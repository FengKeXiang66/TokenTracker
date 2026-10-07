"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

const localApi = require("../src/lib/local-api");

const TRACKER = path.resolve(__dirname, "..", "bin", "tracker.js");

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

function createDevinDb(dir) {
  const dbPath = path.join(dir, "sessions.db");
  executeSql(dbPath, `
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
    );
    CREATE TABLE message_nodes (
      row_id INTEGER PRIMARY KEY,
      session_id TEXT,
      node_id INTEGER,
      parent_node_id INTEGER,
      chat_message TEXT,
      created_at INTEGER,
      metadata TEXT
    );
    CREATE TABLE subagent_heads (
      session_id TEXT,
      agent_id TEXT,
      chain_node_id INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (session_id, agent_id)
    );
  `);
  return dbPath;
}

function assistantMessage({ requestId, model = "swe-2-high", startedAt, input, output, cacheRead = null, cacheCreation = null }) {
  return JSON.stringify({
    role: "assistant",
    message_id: `msg-${requestId}`,
    content: "PRIVATE RESPONSE BODY",
    metadata: {
      request_id: requestId,
      generation_model: model,
      started_generation_at: startedAt,
      created_at: startedAt,
      metrics: {
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: cacheRead,
        cache_creation_tokens: cacheCreation,
      },
    },
  });
}

function insertRequest(dbPath, { rowId, sessionId, nodeId, requestId, model, startedAt, input, output, cacheRead, cacheCreation, copies = 1 }) {
  for (let i = 0; i < copies; i++) {
    executeSql(dbPath, `
      INSERT INTO message_nodes (row_id, session_id, node_id, parent_node_id, chat_message, created_at, metadata)
      VALUES (
        ${Number(rowId) + i}, ${quote(sessionId)}, ${Number(nodeId) + i}, NULL,
        ${quote(assistantMessage({ requestId, model, startedAt, input, output, cacheRead, cacheCreation }))},
        ${1783600000 + Number(rowId) + i}, '{}'
      );
    `);
  }
}

function makeGitRepo(dir, remoteUrl = "https://github.com/acme/widgets.git") {
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".git", "config"),
    `[remote "origin"]\n\turl = ${remoteUrl}\n`,
  );
  return dir;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

async function callLocalApi(queuePath, endpoint, params = "") {
  const handler = localApi.createLocalApiHandler({ queuePath });
  const chunks = [];
  let statusCode = null;
  const url = new URL(`http://localhost/functions/${endpoint}?tz=UTC${params}`);
  const req = { method: "GET", url: url.pathname + url.search, headers: { host: "localhost" } };
  const res = {
    statusCode: 200,
    setHeader() {},
    writeHead(code) { statusCode = code; },
    end(body) { if (body) chunks.push(body); },
    write(chunk) { chunks.push(chunk); },
  };
  const handled = await handler(req, res, url);
  assert.ok(handled, `${endpoint} must handle the request`);
  return { statusCode: statusCode || res.statusCode, body: JSON.parse(chunks.join("")) };
}

sqliteTest("Devin sync emits only source=devin rows, reconciles with local API, and replays safely", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devin-sync-"));
  try {
    const repo = makeGitRepo(path.join(dir, "checkout"));
    const dbPath = createDevinDb(dir);
    executeSql(dbPath, `
      INSERT INTO sessions (id, working_directory, backend_type, model, created_at, last_activity_at, title, cogs_json, hidden, metadata)
      VALUES ('s1', ${quote(repo)}, 'cli', 'swe-2-high', 1783600000, 1783600000, 'PRIVATE TITLE', '{"k":"PRIVATE COGS"}', 0, '{}');
      INSERT INTO sessions (id, working_directory, backend_type, model, created_at, last_activity_at, title, hidden, metadata)
      VALUES ('s2', NULL, 'cli', 'swe-2-high', 1783600500, 1783600500, 'PRIVATE TITLE 2', 0, '{}');
    `);
    // s1: one request with duplicated replay nodes + heavy cache reads.
    insertRequest(dbPath, {
      rowId: 1, sessionId: "s1", nodeId: 1, requestId: "req-a",
      startedAt: "2026-07-09T10:03:00.000Z", input: 3408, output: 443,
      cacheRead: 69107, cacheCreation: null, copies: 2,
    });
    // s2: a compactor request in a different bucket and session.
    insertRequest(dbPath, {
      rowId: 10, sessionId: "s2", nodeId: 10, requestId: "req-b",
      model: "compactor", startedAt: "2026-07-09T10:45:00+00:00",
      input: 8000, output: 900,
    });

    const env = {
      ...process.env,
      HOME: dir,
      USERPROFILE: dir,
      APPDATA: path.join(dir, "AppData", "Roaming"),
      TOKENTRACKER_DEVIN_DB: dbPath,
      TOKENTRACKER_NO_TELEMETRY: "1",
      TOKENTRACKER_WSL_MODE: "native-only",
    };
    const trackerDir = path.join(dir, ".tokentracker", "tracker");
    const queuePath = path.join(trackerDir, "queue.jsonl");
    const projectQueuePath = path.join(trackerDir, "project.queue.jsonl");
    const cursorPath = path.join(trackerDir, "cursors.json");

    const runSync = (extraArgs = []) => cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", ...extraArgs],
      { env, encoding: "utf8", timeout: 60_000 },
    );

    const sync = runSync(["--source", "devin"]);
    assert.equal(sync.status, 0, `sync failed: ${sync.stderr || sync.stdout}`);

    const rows = readJsonl(queuePath);
    assert.ok(rows.length >= 2, "expected devin queue rows");
    assert.ok(rows.every((r) => r.source === "devin"), "only devin rows emitted");
    const byKey = new Map(rows.map((r) => [`${r.model}|${r.hour_start}`, r]));
    const swe = byKey.get("swe-2-high|2026-07-09T10:00:00.000Z");
    assert.equal(swe.total_tokens, 72958, "input+cache_read+output, dup nodes once");
    assert.equal(swe.billable_total_tokens, 72958);
    assert.equal(swe.reasoning_output_tokens, 0);
    assert.equal(swe.conversation_count, 1);
    const compactor = byKey.get("compactor|2026-07-09T10:30:00.000Z");
    assert.equal(compactor.total_tokens, 8900);
    assert.equal(compactor.conversation_count, 1, "second session counts separately");

    // Project queue stays local and carries the canonical devin totals.
    const projectRows = readJsonl(projectQueuePath);
    assert.equal(projectRows.length, 1);
    assert.equal(projectRows[0].source, "devin");
    assert.equal(projectRows[0].project_key, "acme/widgets");
    assert.equal(projectRows[0].total_tokens, 72958);
    // Neither queue leaks raw paths, request bodies or session cogs.
    const persisted = fs.readFileSync(queuePath, "utf8") + fs.readFileSync(projectQueuePath, "utf8");
    assert.doesNotMatch(persisted, /PRIVATE|req-a|req-b|checkout/i);

    const cursorAfterFirst = JSON.parse(fs.readFileSync(cursorPath, "utf8")).devin;

    // Replay: identical database must not append anything.
    const secondSync = runSync(["--source", "devin"]);
    assert.equal(secondSync.status, 0, `second sync failed: ${secondSync.stderr || secondSync.stdout}`);
    assert.deepEqual(readJsonl(queuePath), rows, "replay must not inflate usage");
    assert.deepEqual(readJsonl(projectQueuePath), projectRows);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(cursorPath, "utf8")).devin,
      cursorAfterFirst,
      "devin cursor state must be stable across replays",
    );

    // Source filtering: an unrelated --source run must not parse devin.
    insertRequest(dbPath, {
      rowId: 20, sessionId: "s1", nodeId: 20, requestId: "req-c",
      startedAt: "2026-07-09T11:00:00.000Z", input: 10, output: 1,
    });
    const other = runSync(["--source", "goose"]);
    assert.equal(other.status, 0, `other-source sync failed: ${other.stderr || other.stdout}`);
    assert.deepEqual(readJsonl(queuePath), rows, "unrelated source must not emit devin rows");

    // The new request lands on the next devin sync.
    const third = runSync(["--source", "devin"]);
    assert.equal(third.status, 0, `third sync failed: ${third.stderr || third.stdout}`);
    const afterRows = readJsonl(queuePath);
    const merged = new Map();
    for (const r of afterRows) merged.set(`${r.model}|${r.hour_start}`, r);
    assert.equal(merged.get("swe-2-high|2026-07-09T11:00:00.000Z").total_tokens, 11);
    assert.ok(afterRows.every((r) => r.source === "devin"));

    // Local API contract: summary, heatmap and model-breakdown reconcile to
    // the same canonical devin totals the sync wrote.
    const summary = await callLocalApi(queuePath, "tokentracker-usage-summary", "&from=2026-07-09&to=2026-07-09");
    assert.equal(summary.body.totals.total_tokens, 72958 + 8900 + 11);
    assert.equal(summary.body.totals.billable_total_tokens, 72958 + 8900 + 11);
    assert.equal(summary.body.totals.conversation_count, 2);

    const breakdown = await callLocalApi(queuePath, "tokentracker-usage-model-breakdown", "&from=2026-07-09&to=2026-07-09");
    const devinSource = breakdown.body.sources.filter((s) => s.source === "devin");
    assert.equal(devinSource.length, 1, "exactly one devin source entry");
    assert.equal(devinSource[0].totals.total_tokens, 72958 + 8900 + 11);
    const models = devinSource[0].models.map((m) => m.model).sort();
    assert.deepEqual(models, ["compactor", "swe-2-high"]);

    const heatmap = await callLocalApi(queuePath, "tokentracker-usage-heatmap", "&weeks=99");
    assert.ok(heatmap.body.active_days >= 1);
    const dayCell = heatmap.body.weeks.flat().find((c) => c.day === "2026-07-09");
    assert.equal(dayCell.billable_total_tokens, 72958 + 8900 + 11);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Devin sync skips cleanly and status reports detection", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devin-status-"));
  try {
    const dbPath = createDevinDb(dir);
    const env = {
      ...process.env,
      HOME: dir,
      USERPROFILE: dir,
      APPDATA: path.join(dir, "AppData", "Roaming"),
      TOKENTRACKER_DEVIN_DB: dbPath,
      TOKENTRACKER_NO_TELEMETRY: "1",
      TOKENTRACKER_WSL_MODE: "native-only",
    };

    // A devin-only sync on an empty database succeeds without queue output.
    const emptySync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "devin"],
      { env, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(emptySync.status, 0, `sync failed: ${emptySync.stderr || emptySync.stdout}`);

    const status = cp.spawnSync(process.execPath, [TRACKER, "status", "--json"], {
      env,
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(status.status, 0, `status failed: ${status.stderr || status.stdout}`);
    assert.deepEqual(JSON.parse(status.stdout).providers.devin, {
      installed: true,
      detail: dbPath,
    });

    // Without the database the provider reports not installed.
    const envMissing = { ...env, TOKENTRACKER_DEVIN_DB: path.join(dir, "absent", "sessions.db") };
    const statusMissing = cp.spawnSync(process.execPath, [TRACKER, "status", "--json"], {
      env: envMissing,
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(statusMissing.status, 0);
    assert.deepEqual(JSON.parse(statusMissing.stdout).providers.devin, { installed: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
