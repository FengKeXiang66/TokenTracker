"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (_e) { }

const sqliteCliProbe = typeof DatabaseSync === "function"
  ? null
  : cp.spawnSync("sqlite3", ["-version"], { windowsHide: true, encoding: "utf8" });
const sqliteTest = typeof DatabaseSync === "function" || sqliteCliProbe?.status === 0
  ? test
  : test.skip;

const {
  resolveDevinDbPath,
  readDevinUsageRows,
  parseDevinIncremental,
} = require("../src/lib/rollout");
const { mockPlatform } = require("./helpers/mock");

function executeSql(dbPath, sql) {
  if (typeof DatabaseSync === "function") {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
    return;
  }
  cp.execFileSync("sqlite3", [dbPath, sql]);
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Mirrors the verified devin CLI 3000.10.21 schema: sessions.created_at is a
// Unix-seconds INTEGER, message_nodes.row_id is the INTEGER PRIMARY KEY and
// node.created_at is Unix seconds (clone persistence time, not call time).
function createDevinDb({ dir, sessions = true } = {}) {
  const root = dir || fs.mkdtempSync(path.join(os.tmpdir(), "devin-test-"));
  const dbPath = path.join(root, "sessions.db");
  executeSql(dbPath, `
    ${sessions ? `
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      working_directory TEXT,
      backend_type TEXT,
      model TEXT,
      agent_mode TEXT,
      created_at INTEGER,
      last_activity_at INTEGER,
      title TEXT,
      main_chain_id INTEGER,
      shell_last_seen_index INTEGER,
      cogs_json TEXT,
      workspace_dirs TEXT,
      hidden INTEGER,
      metadata TEXT
    );` : ""}
    CREATE TABLE message_nodes (
      row_id INTEGER PRIMARY KEY,
      session_id TEXT,
      node_id INTEGER,
      parent_node_id INTEGER,
      chat_message TEXT,
      created_at INTEGER,
      metadata TEXT
    );
    CREATE INDEX idx_message_nodes_session ON message_nodes(session_id);
    CREATE TABLE subagent_heads (
      session_id TEXT,
      agent_id TEXT,
      chain_node_id INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (session_id, agent_id)
    );
  `);
  return { dir: root, dbPath };
}

function insertSession(dbPath, { id, workingDirectory = null, createdAt, model = "swe-2-high", cogs = null }) {
  executeSql(dbPath, `
    INSERT INTO sessions (
      id, working_directory, backend_type, model, agent_mode,
      created_at, last_activity_at, title, cogs_json, hidden, metadata
    ) VALUES (
      ${quote(id)},
      ${workingDirectory == null ? "NULL" : quote(workingDirectory)},
      'cli', ${quote(model)}, 'default',
      ${Number(createdAt)}, ${Number(createdAt)}, 'PRIVATE TITLE',
      ${cogs == null ? "NULL" : quote(cogs)},
      0, '{}'
    );
  `);
}

function devinAssistantMessage({
  requestId,
  model = "swe-2-high",
  startedAt,
  createdAt,
  input = 0,
  output = 0,
  cacheRead = null,
  cacheCreation = null,
  messageId = null,
  body = "PRIVATE RESPONSE BODY",
  extraMetadata = {},
}) {
  return JSON.stringify({
    role: "assistant",
    message_id: messageId || `msg-${requestId}`,
    content: body,
    metadata: {
      request_id: requestId,
      generation_model: model,
      started_generation_at: startedAt,
      created_at: createdAt || startedAt,
      num_tokens: output,
      metrics: {
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: cacheRead,
        cache_creation_tokens: cacheCreation,
      },
      ...extraMetadata,
    },
  });
}

function insertNode(dbPath, { rowId, sessionId, nodeId, parentNodeId = null, chatMessage, createdAt }) {
  executeSql(dbPath, `
    INSERT INTO message_nodes (
      row_id, session_id, node_id, parent_node_id, chat_message, created_at, metadata
    ) VALUES (
      ${Number(rowId)}, ${quote(sessionId)}, ${Number(nodeId)},
      ${parentNodeId == null ? "NULL" : Number(parentNodeId)},
      ${quote(chatMessage)}, ${Number(createdAt)}, '{}'
    );
  `);
}

function insertUserNode(dbPath, { rowId, sessionId, nodeId, createdAt }) {
  insertNode(dbPath, {
    rowId,
    sessionId,
    nodeId,
    chatMessage: JSON.stringify({ role: "user", content: "PRIVATE PROMPT" }),
    createdAt,
  });
}

function readQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return [];
  return fs.readFileSync(queuePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

// Latest queue row per (source, model, hour_start) — readers take the last.
function latestBuckets(queuePath) {
  const out = new Map();
  for (const row of readQueue(queuePath)) {
    out.set(`${row.source}|${row.model}|${row.hour_start}`, row);
  }
  return out;
}

function makeGitRepo(dir, remoteUrl = "https://github.com/acme/widgets.git") {
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".git", "config"),
    `[remote "origin"]\n\turl = ${remoteUrl}\n`,
  );
  return dir;
}

test("Devin resolver honors the explicit database override on every platform", (t) => {
  assert.equal(
    resolveDevinDbPath({ TOKENTRACKER_DEVIN_DB: " /tmp/custom-devin.db " }),
    path.resolve("/tmp/custom-devin.db"),
  );
  mockPlatform(t, "win32");
  assert.equal(
    resolveDevinDbPath({ TOKENTRACKER_DEVIN_DB: "D:\\dev\\sessions.db" }),
    path.resolve("D:\\dev\\sessions.db"),
  );
});

// POSIX path expectations are host-dependent: node:path keeps win32
// semantics on Windows even with a mocked platform, so run them on real
// POSIX hosts only. The all-platform override and mocked win32 WSL
// contracts above/below stay active on every host.
const posixTest = process.platform === "win32" ? test.skip : test;
posixTest("Devin resolver resolves the POSIX data directory", () => {
  assert.equal(
    resolveDevinDbPath({ XDG_DATA_HOME: "/tmp/xdg", HOME: "/home/test" }),
    path.join("/tmp/xdg", "devin", "cli", "sessions.db"),
  );
  assert.equal(
    resolveDevinDbPath({ HOME: "/home/test" }),
    path.join("/home/test", ".local", "share", "devin", "cli", "sessions.db"),
  );
});

test("Devin resolver on win32 discovers only a WSL install", (t) => {
  mockPlatform(t, "win32");
  const env = { HOME: "C:\\Users\\tester", USERPROFILE: "C:\\Users\\tester" };

  // No native Devin data dir exists; with no WSL distros the answer is null
  // (never a guessed native path).
  assert.equal(
    resolveDevinDbPath(env, { runWsl: () => "", existsSync: () => false }),
    null,
  );

  // A supported WSL mode resolves to the discovered WSL file only.
  const wslCalls = [];
  const runWsl = (args) => {
    wslCalls.push(args);
    if (args[0] === "-l") return "  NAME           STATE      VERSION\n* Ubuntu-24.04   Running    2\n";
    if (args[0] === "-d") return "tester\n";
    return "";
  };
  const existsSync = (p) => typeof p === "string" && p.startsWith("\\\\wsl$\\Ubuntu-24.04\\");
  const resolved = resolveDevinDbPath(env, { runWsl, existsSync });
  assert.equal(
    resolved,
    path.join("\\\\wsl$\\Ubuntu-24.04\\home\\tester\\.local/share/devin/cli", "sessions.db"),
  );
  assert.match(resolved, /^\\\\wsl\$\\Ubuntu-24\.04\\/);

  // native-only mode must not probe WSL at all.
  wslCalls.length = 0;
  assert.equal(
    resolveDevinDbPath(
      { ...env, TOKENTRACKER_WSL_MODE: "native-only" },
      { runWsl, existsSync },
    ),
    null,
  );
  assert.deepEqual(wslCalls, [], "native-only must not run any wsl.exe probe");
});

sqliteTest("Devin SQL projection never selects message bodies or session cogs", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, {
      id: "s1",
      workingDirectory: "/work/one",
      createdAt: 1783600000,
      cogs: JSON.stringify({ secret: "PRIVATE COGS" }),
    });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-1",
        startedAt: "2026-01-05T10:03:12.345Z",
        input: 100,
        output: 20,
        cacheRead: 400,
        cacheCreation: 5,
      }),
      createdAt: 1783610000,
    });
    insertUserNode(dbPath, { rowId: 2, sessionId: "s1", nodeId: 2, createdAt: 1783609990 });

    const rows = await readDevinUsageRows(dbPath);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "cache_creation_tokens",
      "cache_read_tokens",
      "generation_model",
      "input_tokens",
      "message_created_at",
      "output_tokens",
      "request_id",
      "row_id",
      "session_created_at",
      "session_id",
      "started_generation_at",
      "working_directory",
    ]);
    const serialized = JSON.stringify(rows);
    assert.doesNotMatch(serialized, /PRIVATE|cogs|chat_message|content/i);
    assert.equal(rows[0].request_id, "req-1");
    assert.equal(rows[0].input_tokens, 100);
    assert.equal(rows[0].cache_read_tokens, 400);
    assert.equal(rows[0].cache_creation_tokens, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin projection degrades cleanly without a sessions table", async () => {
  const { dir, dbPath } = createDevinDb({ sessions: false });
  try {
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s-orphan",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-less",
        model: "compactor",
        startedAt: "2026-01-06T09:15:30.000Z",
        input: 42,
        output: 7,
        cacheRead: 300,
        cacheCreation: 9,
      }),
      createdAt: 1783620000,
    });

    const rows = await readDevinUsageRows(dbPath);
    assert.equal(rows.length, 1);
    const row = rows[0];
    // Exact scalar projection — no session join columns, no message bodies.
    assert.equal(row.request_id, "req-less");
    assert.equal(row.generation_model, "compactor");
    assert.equal(row.started_generation_at, "2026-01-06T09:15:30.000Z");
    assert.equal(row.input_tokens, 42);
    assert.equal(row.output_tokens, 7);
    assert.equal(row.cache_read_tokens, 300);
    assert.equal(row.cache_creation_tokens, 9);
    assert.equal(row.session_id, "s-orphan");
    assert.equal(row.session_created_at, null);
    assert.equal(row.working_directory, null);
    const serialized = JSON.stringify(rows);
    assert.doesNotMatch(serialized, /PRIVATE|cogs|chat_message|content/i);

    // The event path also works: the row still counts once with the original
    // generation time and recorded model.
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    const buckets = latestBuckets(queuePath);
    const bucket = buckets.get("devin|compactor|2026-01-06T09:00:00.000Z");
    assert.equal(bucket.total_tokens, 358);
    assert.equal(bucket.conversation_count, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin first import dedups replayed nodes and buckets by generation time", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    // Three replayed copies of one request: identical request_id/metrics,
    // differing node persistence times. The clone insertion hour (1783610xxx)
    // must NOT decide the bucket — the original 10:03Z generation does.
    for (const [rowId, nodeId, nodeCreatedAt] of [
      [1, 10, 1783605601],
      [2, 11, 1783610000],
      [3, 12, 1783615000],
    ]) {
      insertNode(dbPath, {
        rowId,
        sessionId: "s1",
        nodeId,
        chatMessage: devinAssistantMessage({
          requestId: "req-a",
          startedAt: "2026-07-09T10:03:00.000Z",
          input: 3408,
          output: 443,
          cacheRead: 69107,
          cacheCreation: null,
        }),
        createdAt: nodeCreatedAt,
      });
    }
    insertUserNode(dbPath, { rowId: 4, sessionId: "s1", nodeId: 13, createdAt: 1783605590 });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    const first = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(first, {
      recordsProcessed: 3,
      eventsAggregated: 1,
      bucketsQueued: 1,
      projectBucketsQueued: 0,
    });

    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.size, 1, "one (source, model, hour) bucket");
    const row = [...buckets.values()][0];
    assert.equal(row.source, "devin");
    assert.equal(row.model, "swe-2-high");
    assert.equal(row.hour_start, "2026-07-09T10:00:00.000Z");
    assert.equal(row.input_tokens, 3408);
    assert.equal(row.output_tokens, 443);
    assert.equal(row.cached_input_tokens, 69107);
    assert.equal(row.cache_creation_input_tokens, 0);
    assert.equal(row.reasoning_output_tokens, 0);
    assert.equal(row.total_tokens, 72958);
    assert.equal(row.billable_total_tokens, 72958);
    assert.equal(row.conversation_count, 1);

    assert.equal(Object.keys(cursors.devin.requests).length, 1);

    // Unchanged sync: identical fingerprint → zero work, no queue append.
    const before = readQueue(queuePath).length;
    const second = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(second, {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    });
    assert.equal(readQueue(queuePath).length, before);

    // A new request in the same session counts only itself.
    insertNode(dbPath, {
      rowId: 5,
      sessionId: "s1",
      nodeId: 14,
      chatMessage: devinAssistantMessage({
        requestId: "req-b",
        startedAt: "2026-07-09T10:12:00.000Z",
        input: 10,
        output: 2,
      }),
      createdAt: 1783620000,
    });
    const third = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(third, {
      recordsProcessed: 4,
      eventsAggregated: 1,
      bucketsQueued: 1,
      projectBucketsQueued: 0,
    });
    const merged = latestBuckets(queuePath);
    const updated = merged.get("devin|swe-2-high|2026-07-09T10:00:00.000Z");
    assert.equal(updated.total_tokens, 72970);
    assert.equal(updated.conversation_count, 1, "same session still counts once");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin cross-session fork copies share request_id and count once", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    const repoA = makeGitRepo(path.join(dir, "repo-a"));
    const repoB = makeGitRepo(path.join(dir, "repo-b"), "https://github.com/acme/other.git");
    insertSession(dbPath, { id: "s-original", workingDirectory: repoA, createdAt: 1783600000 });
    insertSession(dbPath, { id: "s-fork", workingDirectory: repoB, createdAt: 1783700000 });
    const msg = devinAssistantMessage({
      requestId: "req-fork",
      startedAt: "2026-07-09T11:05:00+00:00",
      input: 500,
      output: 50,
    });
    insertNode(dbPath, { rowId: 1, sessionId: "s-original", nodeId: 1, chatMessage: msg, createdAt: 1783600100 });
    insertNode(dbPath, { rowId: 2, sessionId: "s-fork", nodeId: 1, chatMessage: msg, createdAt: 1783700100 });

    const queuePath = path.join(dir, "queue.jsonl");
    const projectQueuePath = path.join(dir, "project.queue.jsonl");
    const cursors = {};
    const result = await parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
    assert.equal(result.eventsAggregated, 1);

    const buckets = latestBuckets(queuePath);
    const row = buckets.get("devin|swe-2-high|2026-07-09T11:00:00.000Z");
    assert.equal(row.total_tokens, 550, "fork copy must not double-count");

    // Canonical record belongs to the ORIGINAL (earlier-created) session, so
    // project attribution lands on repo-a, not the fork's working directory.
    const projectRows = readQueue(projectQueuePath);
    assert.equal(projectRows.length, 1);
    assert.equal(projectRows[0].source, "devin");
    assert.equal(projectRows[0].project_key, "acme/widgets");
    assert.equal(projectRows[0].total_tokens, 550);
    assert.doesNotMatch(JSON.stringify(projectRows), /repo-a|\/work|Users/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin reconciles a corrected request instead of double-adding", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-fix",
        startedAt: "2026-07-09T12:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783600200,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(
      latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T12:00:00.000Z").total_tokens,
      110,
    );

    // Metrics finalized upward in place on a new node carrying the same
    // request_id (the Devin writer appends a corrected sibling node).
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-fix",
        startedAt: "2026-07-09T12:00:00.000Z",
        input: 180,
        output: 25,
        cacheRead: 30,
      }),
      createdAt: 1783600300,
    });
    const second = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(second.eventsAggregated, 1);
    const row = latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T12:00:00.000Z");
    assert.equal(row.total_tokens, 235, "correction replaces, not adds");
    assert.equal(row.cached_input_tokens, 30);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin skips pending/malformed metrics then counts the finalized row", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    // Pending: no metrics block at all.
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: JSON.stringify({
        role: "assistant",
        message_id: "m1",
        metadata: {
          request_id: "req-pending",
          generation_model: "swe-2-high",
          started_generation_at: "2026-07-09T13:00:00.000Z",
        },
      }),
      createdAt: 1783600400,
    });
    // Malformed: string metrics.
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: JSON.stringify({
        role: "assistant",
        metadata: {
          request_id: "req-bad",
          generation_model: "swe-2-high",
          started_generation_at: "2026-07-09T13:01:00.000Z",
          metrics: { input_tokens: "many", output_tokens: 4 },
        },
      }),
      createdAt: 1783600401,
    });
    // Missing request_id: must never contribute.
    insertNode(dbPath, {
      rowId: 3,
      sessionId: "s1",
      nodeId: 3,
      chatMessage: JSON.stringify({
        role: "assistant",
        metadata: {
          generation_model: "swe-2-high",
          started_generation_at: "2026-07-09T13:02:00.000Z",
          metrics: { input_tokens: 9, output_tokens: 9 },
        },
      }),
      createdAt: 1783600402,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    const first = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(first.recordsProcessed, 2, "only rows with a request_id are projected");
    assert.equal(first.eventsAggregated, 0, "nothing finalized yet");
    assert.equal(readQueue(queuePath).length, 0);

    // The pending request finalizes.
    executeSql(dbPath, `
      UPDATE message_nodes SET chat_message = ${quote(devinAssistantMessage({
        requestId: "req-pending",
        startedAt: "2026-07-09T13:00:00.000Z",
        input: 42,
        output: 7,
      }))}
      WHERE row_id = 1;
    `);
    const second = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(second.eventsAggregated, 1);
    assert.equal(
      latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T13:00:00.000Z").total_tokens,
      49,
    );
    assert.doesNotMatch(JSON.stringify(readQueue(queuePath)), /req-bad|99/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin preserves per-request models: swe-2-high vs compactor vs later model", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    // sessions.model says swe-2-high, but individual requests ran other
    // models — generation_model must win over the session column.
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000, model: "swe-2-high" });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-swe",
        model: "swe-2-high",
        startedAt: "2026-07-09T14:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783600500,
    });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-compactor",
        model: "compactor",
        startedAt: "2026-07-09T14:10:00.000Z",
        input: 8000,
        output: 900,
      }),
      createdAt: 1783600501,
    });
    insertNode(dbPath, {
      rowId: 3,
      sessionId: "s1",
      nodeId: 3,
      chatMessage: devinAssistantMessage({
        requestId: "req-swe2",
        model: "swe-2",
        startedAt: "2026-07-09T14:20:00.000Z",
        input: 60,
        output: 6,
      }),
      createdAt: 1783600502,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    const result = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(result.eventsAggregated, 3);
    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.get("devin|swe-2-high|2026-07-09T14:00:00.000Z").total_tokens, 110);
    assert.equal(buckets.get("devin|compactor|2026-07-09T14:00:00.000Z").total_tokens, 8900);
    assert.equal(buckets.get("devin|swe-2|2026-07-09T14:00:00.000Z").total_tokens, 66);
    // One session → one conversation marker on the earliest request only.
    assert.equal(buckets.get("devin|swe-2-high|2026-07-09T14:00:00.000Z").conversation_count, 1);
    assert.equal(buckets.get("devin|compactor|2026-07-09T14:00:00.000Z").conversation_count, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin normalizes RFC3339 Z/+00:00 to the same bucket", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-z",
        startedAt: "2026-07-09T15:05:00.000Z",
        input: 10,
        output: 1,
      }),
      createdAt: 1783600600,
    });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-offset",
        startedAt: "2026-07-09T15:07:30.500+00:00",
        input: 20,
        output: 2,
      }),
      createdAt: 1783600601,
    });
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    const row = latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T15:00:00.000Z");
    assert.equal(row.total_tokens, 33);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin deletion/compaction does not refund already-counted usage", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-gone",
        startedAt: "2026-07-09T16:00:00.000Z",
        input: 70,
        output: 7,
      }),
      createdAt: 1783600700,
    });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-kept",
        startedAt: "2026-07-09T16:10:00.000Z",
        input: 30,
        output: 3,
      }),
      createdAt: 1783600701,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(
      latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T16:00:00.000Z").total_tokens,
      110,
    );

    // Compaction wipes req-gone's nodes; its spend is historical fact.
    executeSql(dbPath, `DELETE FROM message_nodes WHERE row_id = 1;`);
    const second = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(second.eventsAggregated, 0);
    const row = latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T16:00:00.000Z");
    assert.equal(row.total_tokens, 110, "deleted history stays counted");
    assert.equal(row.conversation_count, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin picks up WAL-only writes and survives database replacement", async () => {
  const { dir, dbPath } = createDevinDb();
  const writer = typeof DatabaseSync === "function" ? new DatabaseSync(dbPath) : null;
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-1",
        startedAt: "2026-07-09T17:00:00.000Z",
        input: 11,
        output: 1,
      }),
      createdAt: 1783600800,
    });
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(
      latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T17:00:00.000Z").total_tokens,
      12,
    );

    if (writer) {
      // Force WAL mode and append a request through a live connection whose
      // -wal sidecar is the only thing that changed on disk.
      writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
      writer.exec(`
        INSERT INTO message_nodes (row_id, session_id, node_id, chat_message, created_at, metadata)
        VALUES (2, 's1', 2, ${quote(devinAssistantMessage({
          requestId: "req-wal",
          startedAt: "2026-07-09T17:20:00.000Z",
          input: 22,
          output: 2,
        }))}, 1783600801, '{}');
      `);
      assert.ok(fs.existsSync(`${dbPath}-wal`), "fixture must leave a live -wal file");
      const walScan = await parseDevinIncremental({ dbPath, cursors, queuePath });
      assert.equal(walScan.eventsAggregated, 1);
      assert.equal(
        latestBuckets(queuePath).get("devin|swe-2-high|2026-07-09T17:00:00.000Z").total_tokens,
        36,
      );
    }

    // Replace the whole database file: identical retained requests plus a new
    // one must not multiply usage.
    if (writer) writer.close();
    fs.rmSync(dbPath, { force: true });
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
    createDevinDb({ dir });
    insertSession(dbPath, { id: "s1", workingDirectory: "/work/one", createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-1",
        startedAt: "2026-07-09T17:00:00.000Z",
        input: 11,
        output: 1,
      }),
      createdAt: 1783600800,
    });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-new",
        startedAt: "2026-07-09T17:40:00.000Z",
        input: 40,
        output: 4,
      }),
      createdAt: 1783600802,
    });
    const replaced = await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(replaced.eventsAggregated, 1, "only the genuinely new request counts");
    const merged = latestBuckets(queuePath);
    // A native writer adds req-wal; the sqlite3 CLI fallback keeps only req-1.
    assert.equal(
      merged.get("devin|swe-2-high|2026-07-09T17:00:00.000Z").total_tokens,
      writer ? 36 : 12,
    );
    assert.equal(
      merged.get("devin|swe-2-high|2026-07-09T17:30:00.000Z").total_tokens,
      44,
    );
  } finally {
    try { writer?.close(); } catch (_e) { }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin retains owning session/project/conversation when the original copy is deleted", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    const repoA = makeGitRepo(path.join(dir, "repo-a"));
    const repoB = makeGitRepo(path.join(dir, "repo-b"), "https://github.com/acme/other.git");
    insertSession(dbPath, { id: "original", workingDirectory: repoA, createdAt: 1783600000 });
    insertSession(dbPath, { id: "fork", workingDirectory: repoB, createdAt: 1783600100 });
    const copied = devinAssistantMessage({
      requestId: "old-request",
      startedAt: "2026-07-09T18:00:00Z",
      input: 50,
      output: 5,
    });
    insertNode(dbPath, { rowId: 1, sessionId: "original", nodeId: 1, chatMessage: copied, createdAt: 1783600200 });
    insertNode(dbPath, { rowId: 2, sessionId: "fork", nodeId: 1, chatMessage: copied, createdAt: 1783600300 });
    insertNode(dbPath, {
      rowId: 3,
      sessionId: "fork",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "new-fork-request",
        startedAt: "2026-07-09T18:05:00Z",
        input: 8,
        output: 2,
      }),
      createdAt: 1783600400,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const projectQueuePath = path.join(dir, "project.queue.jsonl");
    const cursors = {};
    const parse = () => parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
    const latestProjects = () => {
      const out = new Map();
      for (const row of readQueue(projectQueuePath)) {
        out.set(`${row.project_key}|${row.source}|${row.hour_start}`, row);
      }
      return [...out.values()].map((row) => [row.project_key, row.total_tokens]);
    };
    const conversationTotal = () =>
      [...latestBuckets(queuePath).values()].reduce((sum, row) => sum + (row.conversation_count || 0), 0);

    await parse();
    assert.deepEqual(Object.fromEntries(latestProjects()), {
      "acme/widgets": 55,
      "acme/other": 10,
    });
    assert.equal(conversationTotal(), 2, "two sessions produced original usage");

    // Delete only the original copy; the fork copy of old-request survives.
    executeSql(dbPath, "DELETE FROM message_nodes WHERE row_id = 1");
    const second = await parse();
    assert.equal(second.eventsAggregated, 0, "no new usage — only a copy deletion");
    assert.deepEqual(Object.fromEntries(latestProjects()), {
      "acme/widgets": 55,
      "acme/other": 10,
    }, "historical project ownership must not migrate to the fork");
    assert.equal(conversationTotal(), 2, "the original session's conversation is not refunded");

    // Re-parse idempotence: deleting more copies changes nothing.
    const third = await parse();
    assert.deepEqual(third, {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin counts a fork's own later usage once even after the copied request vanishes", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: null, createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-A",
        startedAt: "2026-07-09T10:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783600100,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    const conversationTotal = () =>
      [...latestBuckets(queuePath).values()].reduce((sum, row) => sum + (row.conversation_count || 0), 0);
    const tokenTotal = () =>
      [...latestBuckets(queuePath).values()].reduce((sum, row) => sum + (row.total_tokens || 0), 0);

    await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(conversationTotal(), 1);

    // s1's node is wiped; a later fork s2 keeps a copy of req-A and adds its
    // own original request req-C. A fork containing only copies pays no
    // conversation of its own; its genuinely new request pays exactly one.
    executeSql(dbPath, "DELETE FROM message_nodes WHERE row_id = 1");
    insertSession(dbPath, { id: "s2", workingDirectory: null, createdAt: 1783700000 });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s2",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-A",
        startedAt: "2026-07-09T10:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783700100,
    });
    insertNode(dbPath, {
      rowId: 3,
      sessionId: "s2",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-C",
        startedAt: "2026-07-09T10:20:00.000Z",
        input: 30,
        output: 3,
      }),
      createdAt: 1783700200,
    });
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(conversationTotal(), 2, "s1 historical + s2's own request");
    assert.equal(tokenTotal(), 143);

    // req-A vanishes everywhere. s2 keeps producing original usage and must
    // stay counted — the marker must not be pinned to the vanished request.
    executeSql(dbPath, "DELETE FROM message_nodes WHERE row_id = 2");
    insertNode(dbPath, {
      rowId: 4,
      sessionId: "s2",
      nodeId: 3,
      chatMessage: devinAssistantMessage({
        requestId: "req-D",
        startedAt: "2026-07-09T10:40:00.000Z",
        input: 7,
        output: 1,
      }),
      createdAt: 1783700300,
    });
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    assert.equal(conversationTotal(), 2);
    assert.equal(tokenTotal(), 151);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin correction keeps the retained owning project while moving model and hour", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    const repoA = makeGitRepo(path.join(dir, "repo-a"));
    const repoB = makeGitRepo(path.join(dir, "repo-b"), "https://github.com/acme/other.git");
    insertSession(dbPath, { id: "s1", workingDirectory: repoA, createdAt: 1783600000 });
    insertSession(dbPath, { id: "s2", workingDirectory: repoB, createdAt: 1783600100 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-M",
        startedAt: "2026-07-09T12:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783600200,
    });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s2",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-M",
        startedAt: "2026-07-09T12:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783600300,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const projectQueuePath = path.join(dir, "project.queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
    const projectTotals = () => {
      const out = new Map();
      for (const row of readQueue(projectQueuePath)) {
        out.set(`${row.project_key}|${row.source}|${row.hour_start}`, row);
      }
      return out;
    };

    // In-place correction applied consistently to every retained copy (the
    // verified writer keeps copies identical): model + hour move. The
    // contribution reconciles to the new model/bucket but stays with the
    // originally recorded owning project even though a fork copy survives.
    const corrected = devinAssistantMessage({
      requestId: "req-M",
      model: "compactor",
      startedAt: "2026-07-09T13:30:00.000Z",
      input: 200,
      output: 20,
    });
    executeSql(dbPath, `UPDATE message_nodes SET chat_message = ${quote(corrected)} WHERE row_id IN (1, 2)`);
    const second = await parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
    assert.equal(second.eventsAggregated, 1);

    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.get("devin|swe-2-high|2026-07-09T12:00:00.000Z").total_tokens, 0);
    assert.equal(buckets.get("devin|compactor|2026-07-09T13:30:00.000Z").total_tokens, 220);

    const projects = projectTotals();
    const oldProjectRow = projects.get("acme/widgets|devin|2026-07-09T12:00:00.000Z");
    const newProjectRow = projects.get("acme/widgets|devin|2026-07-09T13:30:00.000Z");
    assert.equal(oldProjectRow.total_tokens, 0, "old project bucket retracted");
    assert.equal(newProjectRow.total_tokens, 220, "correction lands on the retained project");
    assert.equal(projects.get("acme/other|devin|2026-07-09T13:30:00.000Z"), undefined);

    // Then the original copy disappears — only the corrected fork copy
    // survives. Nothing may move again.
    executeSql(dbPath, "DELETE FROM message_nodes WHERE row_id = 1");
    const third = await parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
    assert.equal(third.eventsAggregated, 0);
    assert.equal(projectTotals().get("acme/widgets|devin|2026-07-09T13:30:00.000Z").total_tokens, 220);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin ledger survives cursor serialization for untrusted request ids", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    insertSession(dbPath, { id: "s1", workingDirectory: null, createdAt: 1783600000 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "__proto__",
        startedAt: "2026-07-09T10:00:00.000Z",
        input: 100,
        output: 10,
      }),
      createdAt: 1783600100,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    await parseDevinIncremental({ dbPath, cursors, queuePath });
    const tokenTotal = () =>
      [...latestBuckets(queuePath).values()].reduce((sum, row) => sum + (row.total_tokens || 0), 0);
    assert.equal(tokenTotal(), 110);
    assert.deepEqual(Object.keys(cursors.devin.requests), ["__proto__"]);

    // Simulate the next sync process loading cursors.json.
    const restored = JSON.parse(JSON.stringify(cursors));
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s1",
      nodeId: 2,
      chatMessage: devinAssistantMessage({
        requestId: "req-normal",
        startedAt: "2026-07-09T10:10:00.000Z",
        input: 5,
        output: 1,
      }),
      createdAt: 1783600200,
    });
    const second = await parseDevinIncremental({ dbPath, cursors: restored, queuePath });
    assert.equal(second.eventsAggregated, 1, "only the genuinely new request counts");
    assert.equal(tokenTotal(), 116, "the __proto__ request must not re-add");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin queue write failure leaves published state untouched so a retry recovers", async () => {
  for (const target of ["aggregate", "project"]) {
    const { dir, dbPath } = createDevinDb();
    const originalAppend = fsp.appendFile;
    try {
      const repo = makeGitRepo(path.join(dir, "repo"));
      insertSession(dbPath, { id: "session", workingDirectory: repo, createdAt: 1783600000 });
      insertNode(dbPath, {
        rowId: 1,
        sessionId: "session",
        nodeId: 1,
        chatMessage: devinAssistantMessage({
          requestId: "request-1",
          startedAt: "2026-07-09T18:00:00Z",
          input: 50,
          output: 5,
        }),
        createdAt: 1783600100,
      });
      const queuePath = path.join(dir, "queue.jsonl");
      const projectQueuePath = path.join(dir, "project.queue.jsonl");
      let cursors = {};
      const parse = () => parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
      const totals = (file, keyPrefix) => {
        const out = new Map();
        for (const row of readQueue(file)) {
          const key = `${row[keyPrefix] || ""}|${row.source}|${row.hour_start}`;
          out.set(key, row);
        }
        return [...out.values()].reduce((sum, row) => sum + (row.total_tokens || 0), 0);
      };

      await parse();
      assert.equal(totals(queuePath, "model"), 55, `${target}: baseline aggregate`);
      assert.equal(totals(projectQueuePath, "project_key"), 55, `${target}: baseline project`);

      insertNode(dbPath, {
        rowId: 2,
        sessionId: "session",
        nodeId: 2,
        chatMessage: devinAssistantMessage({
          requestId: "request-2",
          startedAt: "2026-07-09T18:10:00Z",
          input: 5,
          output: 5,
        }),
        createdAt: 1783600200,
      });

      // An unrelated provider's published bucket must stay a shared
      // read-only reference — the parser stages only devin-owned state.
      const foreignBucket = {
        totals: {
          input_tokens: 7,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 3,
          reasoning_output_tokens: 0,
          total_tokens: 10,
          billable_total_tokens: 10,
          total_cost_usd: 0,
          conversation_count: 1,
        },
        queuedKey: "foreign-key",
      };
      cursors.hourly.buckets["codex|gpt-5|2026-07-09T18:00:00.000Z"] = foreignBucket;

      const failedFile = target === "aggregate" ? queuePath : projectQueuePath;
      fsp.appendFile = async function (file, ...args) {
        if (file === failedFile) {
          throw Object.assign(new Error(`Synthetic ${target} write failure`), { code: "EIO" });
        }
        return originalAppend.call(this, file, ...args);
      };
      await assert.rejects(parse(), { code: "EIO" });
      fsp.appendFile = originalAppend;

      // Nothing caller-visible may have advanced: the request ledger keeps
      // only request-1 and the hourly/project buckets keep their published
      // totals and queuedKey.
      assert.deepEqual(
        Object.keys(cursors.devin.requests).sort(),
        ["request-1"],
        `${target}: request-2 must not be staged into the published ledger`,
      );
      const devinBucket = cursors.hourly.buckets["devin|swe-2-high|2026-07-09T18:00:00.000Z"];
      assert.equal(devinBucket.totals.total_tokens, 55, `${target}: published bucket unpolluted`);
      assert.equal(
        cursors.hourly.buckets["codex|gpt-5|2026-07-09T18:00:00.000Z"],
        foreignBucket,
        `${target}: foreign provider bucket untouched by reference`,
      );
      assert.equal(foreignBucket.totals.total_tokens, 10);
      assert.equal(foreignBucket.queuedKey, "foreign-key");

      // Cursor JSON round-trip, then the retry must re-derive the same
      // contribution and let latest-wins rows settle both queues at 65.
      cursors = JSON.parse(JSON.stringify(cursors));
      const retried = await parse();
      assert.equal(retried.eventsAggregated, 1, `${target}: retry recounts the new request`);
      assert.equal(totals(queuePath, "model"), 65, `${target}: aggregate recovered`);
      assert.equal(totals(projectQueuePath, "project_key"), 65, `${target}: project recovered`);

      const replay = await parse();
      assert.equal(replay.eventsAggregated, 0, `${target}: no re-add on replay`);
      assert.equal(totals(queuePath, "model"), 65);
      assert.equal(totals(projectQueuePath, "project_key"), 65);
    } finally {
      fsp.appendFile = originalAppend;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

sqliteTest("Devin handles missing and corrupt databases", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devin-missing-"));
  try {
    const queuePath = path.join(dir, "queue.jsonl");
    const missing = await parseDevinIncremental({
      dbPath: path.join(dir, "nope", "sessions.db"),
      cursors: {},
      queuePath,
    });
    assert.deepEqual(missing, {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    });

    const corruptPath = path.join(dir, "sessions.db");
    fs.writeFileSync(corruptPath, "this is not a sqlite database");
    await assert.rejects(
      parseDevinIncremental({ dbPath: corruptPath, cursors: {}, queuePath }),
      /Cannot read Devin SQLite database/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin project attribution follows the owning session's working_directory", async () => {
  const { dir, dbPath } = createDevinDb();
  try {
    const repo = makeGitRepo(path.join(dir, "checkout"));
    insertSession(dbPath, { id: "s1", workingDirectory: repo, createdAt: 1783600000 });
    insertSession(dbPath, { id: "s2", workingDirectory: null, createdAt: 1783600100 });
    insertNode(dbPath, {
      rowId: 1,
      sessionId: "s1",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-proj",
        startedAt: "2026-07-09T18:00:00.000Z",
        input: 50,
        output: 5,
      }),
      createdAt: 1783600900,
    });
    insertNode(dbPath, {
      rowId: 2,
      sessionId: "s2",
      nodeId: 1,
      chatMessage: devinAssistantMessage({
        requestId: "req-noproj",
        startedAt: "2026-07-09T18:05:00.000Z",
        input: 30,
        output: 3,
      }),
      createdAt: 1783600901,
    });

    const queuePath = path.join(dir, "queue.jsonl");
    const projectQueuePath = path.join(dir, "project.queue.jsonl");
    const cursors = {};
    const result = await parseDevinIncremental({ dbPath, cursors, queuePath, projectQueuePath });
    assert.equal(result.projectBucketsQueued, 1);
    const projectRows = readQueue(projectQueuePath);
    assert.equal(projectRows.length, 1);
    assert.equal(projectRows[0].project_key, "acme/widgets");
    assert.equal(projectRows[0].total_tokens, 55);
    assert.equal(projectRows[0].hour_start, "2026-07-09T18:00:00.000Z");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
