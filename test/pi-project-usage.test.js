"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { parsePiIncremental } = require("../src/lib/rollout");

const time = Date.UTC(2026, 8, 12, 10);
const message = (id, provider = "anthropic", input = 100) => JSON.stringify({
  type: "message", id,
  message: {
    role: "assistant", provider, model: "claude-sonnet-4-6", timestamp: time,
    usage: { input, output: 20, cacheRead: 30, cacheWrite: 10, totalTokens: input + 60 },
  },
});

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-pi-project-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const project = path.join(dir, "path-with-dashes", "project");
  await fs.mkdir(path.join(project, ".git"), { recursive: true });
  await fs.writeFile(path.join(project, ".git", "config"),
    '[remote "origin"]\n\turl = https://github.com/example/pi-project.git\n');
  const file = path.join(dir, "session.jsonl");
  await fs.writeFile(file, JSON.stringify({ type: "session", id: "session", cwd: project }) + "\n");
  return {
    file, dir, cursors: {}, queuePath: path.join(dir, "queue.jsonl"),
    projectQueuePath: path.join(dir, "project.queue.jsonl"),
    sessionFiles: [file], publicRepoResolver: async ({ projectRef }) => ({
      status: "public_verified", projectKey: "example/pi-project", projectRef,
    }),
  };
}

async function rows(file) {
  return (await fs.readFile(file, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
}

test("Pi projects backfill consumed history with provider-specific sources and remain idempotent", async (t) => {
  const f = await fixture(t);
  await fs.appendFile(f.file, [message("a"), message("b", "github-copilot", 300), ""].join("\n"));
  await parsePiIncremental({ ...f, projectQueuePath: undefined });
  const aggregateBefore = await fs.readFile(f.queuePath, "utf8");
  f.cursors = JSON.parse(JSON.stringify(f.cursors));
  const backfill = await parsePiIncremental(f);
  assert.equal(backfill.eventsAggregated, 0);
  assert.equal(backfill.projectBucketsQueued, 2);
  const bySource = new Map((await rows(f.projectQueuePath)).map((row) => [row.source, row]));
  assert.equal(bySource.get("pi-anthropic").total_tokens, 160);
  assert.equal(bySource.get("pi-github-copilot").total_tokens, 360);
  for (const row of bySource.values()) {
    assert.equal(row.project_key, "example/pi-project");
    assert.equal(row.project_ref, "https://github.com/example/pi-project");
    assert.equal(row.conversation_count, 1);
  }
  assert.equal(await fs.readFile(f.queuePath, "utf8"), aggregateBefore);
  const projectBefore = await fs.readFile(f.projectQueuePath, "utf8");
  f.cursors = JSON.parse(JSON.stringify(f.cursors));
  const repeated = await parsePiIncremental(f);
  assert.equal(repeated.projectBucketsQueued, 0);
  assert.equal(await fs.readFile(f.projectQueuePath, "utf8"), projectBefore);
  await fs.appendFile(f.file, message("c", "anthropic", 50) + "\n");
  await parsePiIncremental(f);
  assert.equal((await rows(f.projectQueuePath)).at(-1).total_tokens, 270);
  assert.equal((await rows(f.queuePath)).at(-1).total_tokens, 270);
});

test("Pi project cursor retries a partial final record without losing or doubling it", async (t) => {
  const f = await fixture(t);
  await fs.appendFile(f.file, message("first", undefined, 100) + "\n");
  await parsePiIncremental(f);
  const tail = message("second", undefined, 200);
  await fs.appendFile(f.file, tail.slice(0, -4));
  await parsePiIncremental(f);
  await fs.appendFile(f.file, tail.slice(-4) + "\n");
  f.cursors = JSON.parse(JSON.stringify(f.cursors));
  await parsePiIncremental(f);
  assert.equal((await rows(f.projectQueuePath)).at(-1).total_tokens, 420);
  assert.equal((await rows(f.queuePath)).at(-1).total_tokens, 420);
  const before = await fs.readFile(f.projectQueuePath, "utf8");
  await parsePiIncremental(f);
  assert.equal(await fs.readFile(f.projectQueuePath, "utf8"), before);
});

test("Pi project append failure preserves cursors so both queues recover on retry", async (t) => {
  const f = await fixture(t);
  await fs.appendFile(f.file, message("first") + "\n");
  await parsePiIncremental(f);
  await fs.appendFile(f.file, message("second") + "\n");
  const before = JSON.stringify(f.cursors);
  const blocked = path.join(f.dir, "blocked-queue");
  await fs.mkdir(blocked);
  await assert.rejects(parsePiIncremental({ ...f, projectQueuePath: blocked }));
  assert.equal(JSON.stringify(f.cursors), before);
  f.cursors = JSON.parse(before);
  await parsePiIncremental(f);
  assert.equal((await rows(f.queuePath)).at(-1).total_tokens, 320);
  assert.equal((await rows(f.projectQueuePath)).at(-1).total_tokens, 320);
});

test("Pi project attribution requires a session cwd and never guesses from the file path", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.file, JSON.stringify({ type: "session", id: "no-cwd" }) + "\n" + message("first") + "\n");
  const result = await parsePiIncremental(f);
  assert.equal(result.eventsAggregated, 1);
  assert.equal(result.projectBucketsQueued, 0);
  assert.equal((await rows(f.queuePath)).at(-1).total_tokens, 160);
  await assert.rejects(fs.access(f.projectQueuePath), { code: "ENOENT" });
});
