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

const {
  resolveUnslothDbPath,
  readUnslothUsageRows,
  normalizeUnslothUsageRow,
  parseUnslothIncremental,
} = require("../src/lib/rollout");
const { computeRowCost } = require("../src/lib/pricing");

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

function createUnslothDb({ withApi = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unsloth-test-"));
  const dbPath = path.join(dir, "studio.db");
  executeSql(dbPath, `
    CREATE TABLE chat_threads (id TEXT PRIMARY KEY, model_id TEXT);
    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      role TEXT,
      content_json TEXT,
      attachments_json TEXT,
      metadata_json TEXT,
      created_at INTEGER
    );
    ${withApi ? `CREATE TABLE api_usage_events (
      id TEXT PRIMARY KEY,
      subject TEXT,
      endpoint TEXT,
      model TEXT,
      status TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      created_at INTEGER
    );` : ""}
  `);
  return { dir, dbPath };
}

function readQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return [];
  return fs.readFileSync(queuePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

test("Unsloth resolves its official Studio database and overrides", () => {
  assert.equal(
    resolveUnslothDbPath({ TOKENTRACKER_UNSLOTH_DB: " /tmp/custom.db " }),
    path.resolve("/tmp/custom.db"),
  );
  assert.equal(
    resolveUnslothDbPath({ UNSLOTH_STUDIO_HOME: "/tmp/studio" }),
    path.join(path.resolve("/tmp/studio"), "studio.db"),
  );
  assert.equal(
    resolveUnslothDbPath({ HOME: "/home/test" }),
    path.join("/home/test", ".unsloth", "studio", "studio.db"),
  );
});

sqliteTest("Unsloth SQL reads only scalar usage fields and supports both usage tables", () => {
  const { dir, dbPath } = createUnslothDb();
  try {
    const metadata = JSON.stringify({
      privatePreview: "PRIVATE PREVIEW",
      contextUsage: {
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        cachedTokens: 30,
        cacheWriteTokens: 10,
        reasoningTokens: 5,
        modelId: "unsloth/Qwen-test",
      },
      responseDetails: {
        responseModelId: "claude-sonnet-4-6",
        providerType: "anthropic",
      },
    });
    executeSql(dbPath, `
      INSERT INTO chat_threads VALUES ('thread-1', 'fallback-model');
      INSERT INTO chat_messages VALUES (
        'message-1', 'thread-1', 'assistant',
        ${quote('{"text":"PRIVATE RESPONSE"}')},
        ${quote('[{"name":"PRIVATE ATTACHMENT"}]')},
        ${quote(metadata)}, 1783605600
      );
      INSERT INTO chat_messages VALUES (
        'message-2', 'thread-1', 'assistant', '{}', '[]',
        ${quote(JSON.stringify({
          contextUsage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
          responseDetails: { responseModelId: "local-test", providerType: "local" },
        }))}, 1783605600
      );
      INSERT INTO chat_messages VALUES (
        'user-1', 'thread-1', 'user', ${quote('{"text":"PRIVATE PROMPT"}')}, '[]', '{}', 1783605590
      );
      -- Failed terminal requests can still carry provider-billed partial usage.
      INSERT INTO api_usage_events VALUES (
        'request-1', 'PRIVATE API SUBJECT', '/v1/chat/completions', 'api-model',
        'error', 50, 15, 65, 1783607400
      );
    `);

    const rows = readUnslothUsageRows(dbPath, { pageSize: 1 });
    assert.equal(rows.length, 3);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "cache_write_tokens",
      "cached_tokens",
      "completion_tokens",
      "created_at",
      "fallback_model",
      "id",
      "prompt_tokens",
      "provider_type",
      "reasoning_tokens",
      "requested_model",
      "response_model",
      "total_tokens",
      "usage_kind",
    ]);
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|content_json|attachments_json|subject/i);
    const normalized = rows.map(normalizeUnslothUsageRow).filter(Boolean);
    assert.equal(normalized[0].totals.input_tokens, 60);
    assert.equal(normalized[0].totals.cached_input_tokens, 30);
    assert.equal(normalized[0].totals.cache_creation_input_tokens, 10);
    assert.equal(normalized[0].totals.output_tokens, 35);
    assert.equal(normalized[0].totals.reasoning_output_tokens, 5);
    assert.equal(normalized[0].model, "anthropic/claude-sonnet-4-6");
    assert.equal(normalized[1].totals.total_tokens, 3);
    assert.equal(normalized[1].model, "local/local-test");
    assert.equal(normalized[2].totals.total_tokens, 65);
    assert.equal(normalized[2].model, "local/api-model");
    assert.ok(computeRowCost({
      source: "unsloth",
      model: normalized[0].model,
      ...normalized[0].totals,
    }) > 0);
    assert.equal(computeRowCost({
      source: "unsloth",
      model: normalized[2].model,
      ...normalized[2].totals,
    }), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Unsloth incremental parsing is idempotent and reconciles updated counters", async () => {
  const { dir, dbPath } = createUnslothDb();
  try {
    const usage = (promptTokens, completionTokens) => JSON.stringify({
      contextUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        modelId: "local-model",
      },
      responseDetails: { providerType: "local", responseModelId: "local-model" },
    });
    executeSql(dbPath, `
      INSERT INTO chat_threads VALUES ('thread-1', 'fallback-model');
      INSERT INTO chat_messages VALUES ('message-1', 'thread-1', 'assistant',
        ${quote('{"text":"PRIVATE"}')}, '[]', ${quote(usage(20, 5))}, 1783605600);
    `);
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    const first = await parseUnslothIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(first, { recordsProcessed: 1, eventsAggregated: 1, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 25);

    const second = await parseUnslothIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(second, { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 });

    executeSql(dbPath, `UPDATE chat_messages SET metadata_json = ${quote(usage(30, 8))} WHERE id = 'message-1';`);
    const third = await parseUnslothIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(third, { recordsProcessed: 1, eventsAggregated: 1, bucketsQueued: 1 });
    const latest = readQueue(queuePath).at(-1);
    assert.equal(latest.total_tokens, 38);
    assert.equal(latest.conversation_count, 1);
    assert.doesNotMatch(JSON.stringify(cursors), /PRIVATE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Unsloth bounds long-history state and rereads only its mutable tail", async () => {
  const { dir, dbPath } = createUnslothDb({ withApi: false });
  try {
    const usage = (promptTokens, completionTokens) => JSON.stringify({
      contextUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        modelId: "local-history",
      },
      responseDetails: { providerType: "local", responseModelId: "local-history" },
    });
    const inserts = Array.from({ length: 12 }, (_, index) => `
      INSERT INTO chat_messages VALUES (
        'message-${String(index).padStart(2, "0")}', 'thread-1', 'assistant', '{}', '[]',
        ${quote(usage(10, 2))}, ${1783605600 + index}
      );
    `).join("\n");
    executeSql(dbPath, `
      INSERT INTO chat_threads VALUES ('thread-1', 'fallback-model');
      ${inserts}
    `);
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};

    const first = await parseUnslothIncremental({
      dbPath,
      cursors,
      queuePath,
      overlapRows: 3,
      sqliteOptions: { pageSize: 2 },
    });
    assert.deepEqual(first, { recordsProcessed: 12, eventsAggregated: 12, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 144);
    assert.equal(Object.keys(cursors.unsloth.messages).length, 3);
    assert.deepEqual(cursors.unsloth.scan.chat, {
      overlap: { createdAt: "1783605609", id: "message-09" },
      latest: { createdAt: "1783605611", id: "message-11" },
    });

    const stateAfterFirst = JSON.parse(JSON.stringify(cursors.unsloth));
    const rowsAfterFirst = readQueue(queuePath);
    for (let pass = 0; pass < 2; pass++) {
      const unchanged = await parseUnslothIncremental({
        dbPath,
        cursors,
        queuePath,
        overlapRows: 3,
        sqliteOptions: { pageSize: 2 },
      });
      assert.deepEqual(unchanged, {
        recordsProcessed: 0,
        eventsAggregated: 0,
        bucketsQueued: 0,
      });
      assert.deepEqual(cursors.unsloth, stateAfterFirst);
      assert.deepEqual(readQueue(queuePath), rowsAfterFirst);
    }

    executeSql(dbPath, `
      UPDATE chat_messages
      SET metadata_json = ${quote(usage(20, 4))}
      WHERE id = 'message-11';
    `);
    const updated = await parseUnslothIncremental({
      dbPath,
      cursors,
      queuePath,
      overlapRows: 3,
      sqliteOptions: { pageSize: 2 },
    });
    assert.deepEqual(updated, { recordsProcessed: 3, eventsAggregated: 1, bucketsQueued: 1 });
    const latest = readQueue(queuePath).at(-1);
    assert.equal(latest.total_tokens, 156);
    assert.equal(latest.conversation_count, 12);
    assert.equal(Object.keys(cursors.unsloth.messages).length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("Unsloth supports older databases without API usage events", async () => {
  const { dir, dbPath } = createUnslothDb({ withApi: false });
  try {
    executeSql(dbPath, `
      INSERT INTO chat_threads VALUES ('thread-1', 'fallback-model');
      INSERT INTO chat_messages VALUES ('message-1', 'thread-1', 'assistant', '{}', '[]',
        ${quote(JSON.stringify({ contextUsage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } }))},
        1783605600);
    `);
    const queuePath = path.join(dir, "queue.jsonl");
    const result = await parseUnslothIncremental({ dbPath, cursors: {}, queuePath });
    assert.deepEqual(result, { recordsProcessed: 1, eventsAggregated: 1, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath)[0].model, "unpriced/unknown/fallback-model");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("sync and status commands expose the Unsloth Studio integration", () => {
  const { dir, dbPath } = createUnslothDb();
  try {
    const metadata = JSON.stringify({
      contextUsage: { promptTokens: 40, completionTokens: 8, totalTokens: 48 },
      responseDetails: { providerType: "openai", responseModelId: "gpt-5.4" },
    });
    executeSql(dbPath, `
      INSERT INTO chat_threads VALUES ('thread-command', 'fallback-model');
      INSERT INTO chat_messages VALUES (
        'message-command', 'thread-command', 'assistant',
        ${quote('{"text":"PRIVATE RESPONSE"}')}, '[]', ${quote(metadata)}, 1783605600
      );
    `);
    const env = {
      ...process.env,
      HOME: dir,
      USERPROFILE: dir,
      APPDATA: path.join(dir, "AppData", "Roaming"),
      TOKENTRACKER_UNSLOTH_DB: dbPath,
      TOKENTRACKER_NO_TELEMETRY: "1",
      TOKENTRACKER_WSL_MODE: "native-only",
    };

    const sync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "unsloth"],
      { env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(sync.status, 0, `sync failed: ${sync.stderr || sync.stdout}`);
    const queuePath = path.join(dir, ".tokentracker", "tracker", "queue.jsonl");
    const rows = readQueue(queuePath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "unsloth");
    assert.equal(rows[0].model, "openai/gpt-5.4");
    assert.equal(rows[0].total_tokens, 48);
    assert.ok(computeRowCost(rows[0]) > 0);

    const cursorPath = path.join(dir, ".tokentracker", "tracker", "cursors.json");
    const cursorAfterFirstSync = JSON.parse(fs.readFileSync(cursorPath, "utf8")).unsloth;
    const secondSync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "unsloth"],
      { env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(secondSync.status, 0, `second sync failed: ${secondSync.stderr || secondSync.stdout}`);
    assert.deepEqual(readQueue(queuePath), rows, "second sync must not append queue rows");
    const cursorAfterSecondSync = JSON.parse(fs.readFileSync(cursorPath, "utf8")).unsloth;
    assert.deepEqual(
      cursorAfterSecondSync,
      cursorAfterFirstSync,
      "second sync must not change the Unsloth cursor state",
    );
    const thirdSync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "unsloth"],
      { env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(thirdSync.status, 0, `third sync failed: ${thirdSync.stderr || thirdSync.stdout}`);
    assert.deepEqual(readQueue(queuePath), rows, "third sync must not append queue rows");
    assert.deepEqual(
      JSON.parse(fs.readFileSync(cursorPath, "utf8")).unsloth,
      cursorAfterFirstSync,
      "third sync must not change the Unsloth cursor state",
    );

    const status = cp.spawnSync(process.execPath, [TRACKER, "status", "--json"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(status.status, 0, `status failed: ${status.stderr || status.stdout}`);
    assert.deepEqual(JSON.parse(status.stdout).providers.unsloth, {
      installed: true,
      detail: dbPath,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
