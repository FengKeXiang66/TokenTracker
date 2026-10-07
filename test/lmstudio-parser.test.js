"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

const TRACKER = path.resolve(__dirname, "..", "bin", "tracker.js");

const {
  resolveLmstudioHome,
  resolveLmstudioLogFiles,
  normalizeLocalStudioTokens,
  readLmstudioFileRecords,
  parseLmstudioIncremental,
} = require("../src/lib/rollout");

function readQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return [];
  return fs.readFileSync(queuePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

function chatRecord({ id, model = "local-model", prompt = 10, output = 4, second = 0 } = {}) {
  return [
    `[2026-07-09 10:00:${String(second).padStart(2, "0")}][INFO][${model}]`,
    "Final response: {",
    `  "id": "${id}",`,
    `  "model": "${model}",`,
    '  "choices": [{"message":{"content":"PRIVATE RESPONSE"}}],',
    '  "usage": {',
    `    "prompt_tokens": ${prompt},`,
    `    "completion_tokens": ${output},`,
    `    "total_tokens": ${prompt + output}`,
    "  }",
    "}",
  ].join("\n");
}

test("LM Studio resolves its native home and recursively finds server logs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmstudio-resolve-"));
  try {
    const home = path.join(dir, "custom-home");
    const nested = path.join(home, "server-logs", "2026-07");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "one.log"), "");
    fs.writeFileSync(path.join(nested, "ignore.txt"), "");
    assert.equal(resolveLmstudioHome({ TOKENTRACKER_LMSTUDIO_HOME: home }), path.resolve(home));
    assert.deepEqual(
      await resolveLmstudioLogFiles({ TOKENTRACKER_LMSTUDIO_HOME: home }),
      [path.join(nested, "one.log")],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LM Studio token normalization keeps cache and reasoning categories disjoint", () => {
  assert.deepEqual(normalizeLocalStudioTokens({
    input_tokens: 100,
    output_tokens: 40,
    total_tokens: 140,
    input_tokens_details: { cached_tokens: 30, cache_creation_input_tokens: 10 },
    output_tokens_details: { reasoning_tokens: 5 },
  }), {
    input_tokens: 60,
    cached_input_tokens: 30,
    cache_creation_input_tokens: 10,
    output_tokens: 35,
    reasoning_output_tokens: 5,
    total_tokens: 140,
    billable_total_tokens: 140,
    total_cost_usd: 0,
    conversation_count: 1,
  });
});

test("LM Studio reads chat and Responses API usage without retaining content", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmstudio-read-"));
  try {
    const logPath = path.join(dir, "server.log");
    const responseRecord = [
      "[2026-07-09 10:30:00][INFO][reasoning-model]",
      "Final response: {",
      '  "id": "resp_2",',
      '  "model": "reasoning-model",',
      '  "output": [{"type":"message","content":"PRIVATE OUTPUT WITH \\\"usage\\\": {\\\"prompt_tokens\\\":999}"}],',
      '  "usage": {',
      '    "input_tokens": 70,',
      '    "output_tokens": 20,',
      '    "total_tokens": 90,',
      '    "input_tokens_details": {"cached_tokens": 30},',
      '    "output_tokens_details": {"reasoning_tokens": 8}',
      "  }",
      "}",
    ].join("\n");
    fs.writeFileSync(logPath, `${chatRecord({ id: "chatcmpl-1" })}\n${responseRecord}\n`);

    const parsed = await readLmstudioFileRecords(logPath, { windowBytes: 192, chunkBytes: 37 });
    assert.equal(parsed.records.length, 2);
    assert.deepEqual(parsed.records.map((row) => row.key), [
      "lmstudio:chatcmpl-1",
      "lmstudio:resp_2",
    ]);
    assert.equal(parsed.records[1].totals.input_tokens, 40);
    assert.equal(parsed.records[1].totals.cached_input_tokens, 30);
    assert.equal(parsed.records[1].totals.output_tokens, 12);
    assert.equal(parsed.records[1].totals.reasoning_output_tokens, 8);
    assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LM Studio incremental parsing deduplicates mirrored responses and appended logs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmstudio-incremental-"));
  try {
    const firstLog = path.join(dir, "one.log");
    const mirrorLog = path.join(dir, "two.log");
    const firstRecord = chatRecord({ id: "chatcmpl-shared", prompt: 20, output: 5 });
    fs.writeFileSync(firstLog, `${firstRecord}\n`);
    fs.writeFileSync(mirrorLog, `${firstRecord}\n`);
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};

    const first = await parseLmstudioIncremental({
      logFiles: [firstLog, mirrorLog],
      cursors,
      queuePath,
    });
    assert.deepEqual(first, { recordsProcessed: 2, eventsAggregated: 1, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 25);

    const second = await parseLmstudioIncremental({
      logFiles: [firstLog, mirrorLog],
      cursors,
      queuePath,
    });
    assert.deepEqual(second, { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 });

    fs.appendFileSync(firstLog, `${chatRecord({ id: "chatcmpl-new", prompt: 7, output: 3, second: 10 })}\n`);
    const third = await parseLmstudioIncremental({
      logFiles: [firstLog, mirrorLog],
      cursors,
      queuePath,
    });
    assert.deepEqual(third, { recordsProcessed: 1, eventsAggregated: 1, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 35);
    assert.doesNotMatch(JSON.stringify(cursors), /PRIVATE RESPONSE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LM Studio preserves response identity beyond the resume window", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmstudio-resume-identity-"));
  try {
    const logPath = path.join(dir, "server.log");
    const prefix = [
      "[2026-07-09 10:00:00][INFO][carried-model]",
      "Final response: {",
      '  "id": "chatcmpl-carried",',
      '  "model": "carried-model",',
      `  "pending": "${"x".repeat(1_024)}",`,
    ].join("\n");
    fs.writeFileSync(logPath, prefix);
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};
    const readerOptions = { windowBytes: 192, chunkBytes: 41 };

    const beforeUsage = await parseLmstudioIncremental({
      logFiles: [logPath],
      cursors,
      queuePath,
      readerOptions,
    });
    assert.deepEqual(beforeUsage, {
      recordsProcessed: 1,
      eventsAggregated: 0,
      bucketsQueued: 0,
    });
    const resumeIdentity = cursors.lmstudio.files[logPath].resumeIdentity;
    assert.deepEqual({
      responseId: resumeIdentity.responseId,
      model: resumeIdentity.model,
    }, {
      responseId: "chatcmpl-carried",
      model: "carried-model",
    });
    assert.ok(Number.isFinite(resumeIdentity.timestamp));

    fs.appendFileSync(logPath, [
      "\n  \"usage\": {",
      '    "prompt_tokens": 10,',
      '    "completion_tokens": 4,',
      '    "total_tokens": 14',
      "  }",
      "}",
      "",
    ].join("\n"));
    const afterUsage = await parseLmstudioIncremental({
      logFiles: [logPath],
      cursors,
      queuePath,
      readerOptions,
    });
    assert.deepEqual(afterUsage, {
      recordsProcessed: 1,
      eventsAggregated: 1,
      bucketsQueued: 1,
    });
    assert.ok(cursors.lmstudio.messages["lmstudio:chatcmpl-carried"]);
    assert.equal(readQueue(queuePath).at(-1).model, "carried-model");
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 14);
    assert.doesNotMatch(JSON.stringify(cursors), /x{32}/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LM Studio bounds long-history state and resumes without duplicate rows", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmstudio-history-"));
  try {
    const logPath = path.join(dir, "server.log");
    const history = Array.from({ length: 12 }, (_, index) => chatRecord({
      id: `chatcmpl-history-${index}`,
      prompt: 10,
      output: 2,
      second: index,
    }));
    fs.writeFileSync(logPath, `${history.join("\n")}\n`);
    const queuePath = path.join(dir, "queue.jsonl");
    const cursors = {};

    const first = await parseLmstudioIncremental({
      logFiles: [logPath],
      cursors,
      queuePath,
      messageLimit: 3,
    });
    assert.deepEqual(first, { recordsProcessed: 1, eventsAggregated: 12, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 144);
    assert.equal(Object.keys(cursors.lmstudio.messages).length, 3);
    assert.ok(cursors.lmstudio.files[logPath].resumeOffset > 0);

    const queueAfterFirst = readQueue(queuePath);
    const touchedAt = new Date(Date.now() + 2_000);
    fs.utimesSync(logPath, touchedAt, touchedAt);
    const rescanned = await parseLmstudioIncremental({
      logFiles: [logPath],
      cursors,
      queuePath,
      messageLimit: 3,
    });
    assert.deepEqual(rescanned, {
      recordsProcessed: 1,
      eventsAggregated: 12,
      bucketsQueued: 0,
    });
    assert.deepEqual(readQueue(queuePath), queueAfterFirst);
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 144);
    assert.equal(readQueue(queuePath).at(-1).conversation_count, 12);
    assert.equal(Object.keys(cursors.lmstudio.messages).length, 3);

    fs.appendFileSync(logPath, `${chatRecord({
      id: "chatcmpl-history-new",
      prompt: 20,
      output: 4,
      second: 20,
    })}\n`);
    const appended = await parseLmstudioIncremental({
      logFiles: [logPath],
      cursors,
      queuePath,
      messageLimit: 3,
    });
    assert.deepEqual(appended, { recordsProcessed: 1, eventsAggregated: 1, bucketsQueued: 1 });
    assert.equal(readQueue(queuePath).at(-1).total_tokens, 168);
    assert.equal(Object.keys(cursors.lmstudio.messages).length, 3);

    const stateAfterAppend = JSON.parse(JSON.stringify(cursors.lmstudio));
    const rowsAfterAppend = readQueue(queuePath);
    for (let pass = 0; pass < 2; pass++) {
      const unchanged = await parseLmstudioIncremental({
        logFiles: [logPath],
        cursors,
        queuePath,
        messageLimit: 3,
      });
      assert.deepEqual(unchanged, {
        recordsProcessed: 0,
        eventsAggregated: 0,
        bucketsQueued: 0,
      });
      assert.deepEqual(cursors.lmstudio, stateAfterAppend);
      assert.deepEqual(readQueue(queuePath), rowsAfterAppend);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sync and status commands expose the LM Studio integration", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmstudio-command-"));
  try {
    const lmstudioHome = path.join(dir, "lmstudio");
    const logDir = path.join(lmstudioHome, "server-logs", "2026-07");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, "server.log"),
      `${chatRecord({ id: "chatcmpl-command", model: "local-command", prompt: 40, output: 8 })}\n`,
    );
    const env = {
      ...process.env,
      HOME: dir,
      USERPROFILE: dir,
      APPDATA: path.join(dir, "AppData", "Roaming"),
      TOKENTRACKER_LMSTUDIO_HOME: lmstudioHome,
      TOKENTRACKER_NO_TELEMETRY: "1",
      TOKENTRACKER_WSL_MODE: "native-only",
    };

    const sync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "lmstudio"],
      { env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(sync.status, 0, `sync failed: ${sync.stderr || sync.stdout}`);
    const queuePath = path.join(dir, ".tokentracker", "tracker", "queue.jsonl");
    const rows = readQueue(queuePath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "lmstudio");
    assert.equal(rows[0].model, "local-command");
    assert.equal(rows[0].total_tokens, 48);

    const cursorPath = path.join(dir, ".tokentracker", "tracker", "cursors.json");
    const cursorAfterFirstSync = JSON.parse(fs.readFileSync(cursorPath, "utf8")).lmstudio;
    const secondSync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "lmstudio"],
      { env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(secondSync.status, 0, `second sync failed: ${secondSync.stderr || secondSync.stdout}`);
    assert.deepEqual(readQueue(queuePath), rows, "second sync must not append queue rows");
    const cursorAfterSecondSync = JSON.parse(fs.readFileSync(cursorPath, "utf8")).lmstudio;
    assert.deepEqual(
      cursorAfterSecondSync,
      cursorAfterFirstSync,
      "second sync must not change the LM Studio cursor state",
    );
    const thirdSync = cp.spawnSync(
      process.execPath,
      [TRACKER, "sync", "--auto", "--from-notify", "--source", "lmstudio"],
      { env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(thirdSync.status, 0, `third sync failed: ${thirdSync.stderr || thirdSync.stdout}`);
    assert.deepEqual(readQueue(queuePath), rows, "third sync must not append queue rows");
    assert.deepEqual(
      JSON.parse(fs.readFileSync(cursorPath, "utf8")).lmstudio,
      cursorAfterFirstSync,
      "third sync must not change the LM Studio cursor state",
    );

    const status = cp.spawnSync(process.execPath, [TRACKER, "status", "--json"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(status.status, 0, `status failed: ${status.stderr || status.stdout}`);
    assert.deepEqual(JSON.parse(status.stdout).providers.lmstudio, {
      installed: true,
      files: 1,
      detail: path.join(lmstudioHome, "server-logs"),
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
