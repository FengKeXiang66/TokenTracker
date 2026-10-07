/**
 * DeepSeek Harness (dsh) parser test.
 *
 * The harness persists each session as an append-only JSONL log under
 * `$DSH_HOME/sessions/<project-key>/<session-id>/session.jsonl[.zstd]`. This
 * suite builds synthetic trees under a tempdir and verifies:
 *   - `resolveDshHome` precedence (TOKENTRACKER_DSH_HOME > DSH_HOME > ~/.dsh)
 *   - `resolveDshSessionFiles` finds both plaintext and zstd artifacts
 *   - `readDshSessionText` reassembles a concatenated-frame zstd container
 *     frame-by-frame with a bounded aggregate output
 *   - usage mapping (disjoint input/cache_read/cache_write/reasoning/output)
 *   - model from `assistant/message.data.message.source.model` with a
 *     `request/header` fallback
 *   - per-file `seq` watermark dedup: a second run adds nothing; an appended
 *     event adds only the delta
 *
 * No real harness install is required: fixtures are written under a tempdir
 * and passed directly to the parser.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");

const {
  resolveDshHome,
  resolveDshHomes,
  resolveDshSessionFiles,
  isDshSessionLogName,
  parseDshVersion,
  readDshSessionText,
  normalizeDshModelName,
  dshUsageToTotals,
  extractDshSessionUsage,
  parseDshIncremental,
} = require("../src/lib/rollout");

async function zstdCompress(data) {
  if (typeof zlib.zstdCompressSync === "function") {
    return zlib.zstdCompressSync(data);
  }
  return Buffer.from(await require("@mongodb-js/zstd").compress(data));
}

const T0 = new Date("2026-05-01T12:00:00Z").getTime();

function headerLine(id = "sess-1") {
  return JSON.stringify({
    type: "session",
    version: 0,
    id,
    createdAt: T0,
    cwd: "/proj",
  });
}

function requestHeaderLine(seq, model = "deepseek-v4-pro") {
  return JSON.stringify({
    type: "request/header",
    seq,
    time: T0,
    data: { header: { config: { provider: "deepseek-official", model } } },
  });
}

function assistantLine(seq, usage, { model, time = T0 } = {}) {
  const source = model
    ? { kind: "model", provider: "deepseek-official", model }
    : undefined;
  return JSON.stringify({
    type: "assistant/message",
    seq,
    time,
    data: {
      turn: 1,
      step: 1,
      message: { role: "assistant", content: [], source, id: `m-${seq}` },
      usage,
    },
  });
}

async function writeSessionLog(dir, name, lines, { zstd = false } = {}) {
  const filePath = path.join(dir, name);
  const text = lines.join("\n") + "\n";
  let data;
  if (zstd) {
    // Split across two independent frames so the concatenated-frame decoder is
    // exercised; the frame boundary is arbitrary (all fixture bytes are ASCII).
    data = Buffer.concat([
      await zstdCompress(Buffer.from(text.slice(0, 60))),
      await zstdCompress(Buffer.from(text.slice(60))),
    ]);
  } else {
    data = Buffer.from(text);
  }
  fs.writeFileSync(filePath, data);
  return filePath;
}

async function makeTree({ compression = "zstd", lines } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-test-"));
  const sessionsRoot = path.join(dir, ".dsh", "sessions");
  const projectDir = path.join(sessionsRoot, "--proj--");
  const sessionDir = path.join(projectDir, "sess-1");
  fs.mkdirSync(sessionDir, { recursive: true });
  const name = compression === "zstd" ? "session.jsonl.zstd" : "session.jsonl";
  const logPath = await writeSessionLog(sessionDir, name, lines, { zstd: compression === "zstd" });
  return { dir, dshHome: path.join(dir, ".dsh"), sessionDir, sessionsRoot, logPath };
}

test("resolveDshHome honors TOKENTRACKER_DSH_HOME, DSH_HOME, then default", () => {
  assert.equal(resolveDshHome({ TOKENTRACKER_DSH_HOME: "/tmp/a" }), path.resolve("/tmp/a"));
  assert.equal(resolveDshHome({ TOKENTRACKER_DSH_HOME: "  ", DSH_HOME: "/tmp/b" }), path.resolve("/tmp/b"));
  assert.equal(resolveDshHome({ DSH_HOME: "/tmp/c" }), path.resolve("/tmp/c"));
  assert.equal(resolveDshHome({}), path.join(os.homedir(), ".dsh"));
});

test("resolveDshHomes follows the Windows native/WSL mode matrix", () => {
  const nativeHome = "/native/.dsh";
  const wslHome = "\\\\wsl$\\Ubuntu\\home\\dev\\.dsh";
  const deps = {
    platform: "win32",
    nativeHome,
    existsSync(candidate) {
      return candidate === nativeHome;
    },
    discoverWslHome() {
      return wslHome;
    },
  };

  assert.deepEqual(resolveDshHomes({}, deps), [wslHome], "default is wsl-first");
  assert.deepEqual(
    resolveDshHomes({ TOKENTRACKER_WSL_MODE: "native-first" }, deps),
    [nativeHome],
  );
  assert.deepEqual(
    resolveDshHomes({ TOKENTRACKER_WSL_MODE: "wsl-only" }, deps),
    [wslHome],
  );
  assert.deepEqual(
    resolveDshHomes({ TOKENTRACKER_WSL_MODE: "native-only" }, deps),
    [nativeHome],
  );
  assert.deepEqual(
    resolveDshHomes({ TOKENTRACKER_WSL_MODE: "both" }, deps),
    [nativeHome, wslHome],
  );
});

test("resolveDshHomes keeps explicit overrides authoritative and never probes WSL off Windows", () => {
  let probes = 0;
  const overridden = resolveDshHomes(
    { TOKENTRACKER_DSH_HOME: "/custom/.dsh", TOKENTRACKER_WSL_MODE: "both" },
    {
      platform: "win32",
      discoverWslHome() {
        probes += 1;
        return "\\\\wsl$\\Ubuntu\\home\\dev\\.dsh";
      },
    },
  );
  assert.deepEqual(overridden, [path.resolve("/custom/.dsh")]);
  assert.equal(probes, 0, "an explicit home must suppress automatic WSL discovery");

  assert.deepEqual(
    resolveDshHomes({}, { platform: "darwin", nativeHome: "/Users/dev/.dsh" }),
    ["/Users/dev/.dsh"],
  );
});

test("normalizeDshModelName drops provider-qualified prefixes", () => {
  assert.equal(normalizeDshModelName("deepseek-v4-pro"), "deepseek-v4-pro");
  assert.equal(normalizeDshModelName("deepseek/deepseek-v4-pro"), "deepseek-v4-pro");
  assert.equal(normalizeDshModelName("  "), null);
  assert.equal(normalizeDshModelName(null), null);
  assert.equal(normalizeDshModelName("/"), null);
});

test("dshUsageToTotals maps disjoint columns 1:1 and rejects all-zero", () => {
  assert.deepEqual(
    dshUsageToTotals({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      reasoningTokens: 7,
    }),
    {
      input_tokens: 100,
      cached_input_tokens: 10,
      cache_creation_input_tokens: 5,
      output_tokens: 50,
      reasoning_output_tokens: 7,
      total_tokens: 172,
      conversation_count: 1,
    },
  );
  assert.equal(dshUsageToTotals({ inputTokens: 0, outputTokens: 0 }), null);
  assert.equal(dshUsageToTotals(null), null);
});

test("extractDshSessionUsage parses header, model source, header fallback, watermark", () => {
  const text = [
    headerLine("sess-1"),
    requestHeaderLine(0, "deepseek-v4-flash"),
    assistantLine(1, { inputTokens: 10, outputTokens: 5 }),
    // message.source carries the model and overrides the header model.
    assistantLine(2, { inputTokens: 20, outputTokens: 5 }, { model: "deepseek-v4-pro" }),
    // all-zero usage is dropped.
    assistantLine(3, { inputTokens: 0, outputTokens: 0 }, { model: "deepseek-v4-pro" }),
  ].join("\n");

  const parsed = extractDshSessionUsage(text, -1);
  assert.equal(parsed.sessionId, "sess-1");
  assert.equal(parsed.maxSeq, 3);
  assert.equal(parsed.deltas.length, 2);
  // seq 1 used the request/header fallback model.
  assert.equal(parsed.deltas[0].model, "deepseek-v4-flash");
  assert.equal(parsed.deltas[0].totals.total_tokens, 15);
  // seq 2 used message.source.model.
  assert.equal(parsed.deltas[1].model, "deepseek-v4-pro");
  assert.equal(parsed.deltas[1].totals.total_tokens, 25);

  // A watermark at seq 1 skips seq <= 1 and only returns seq 2.
  const tail = extractDshSessionUsage(text, 1);
  assert.equal(tail.deltas.length, 1);
  assert.equal(tail.deltas[0].totals.total_tokens, 25);

  const malformed = assistantLine(4, { inputTokens: 20, outputTokens: 5 })
    .replace('"outputTokens":5', '"outputTokens":');
  const malformedParsed = extractDshSessionUsage(`${headerLine()}\n${malformed}`, -1);
  assert.equal(malformedParsed.complete, false);
  assert.equal(malformedParsed.maxSeq, -1, "malformed records must not advance the watermark");
  assert.equal(malformedParsed.deltas.length, 0);
});

test("extractDshSessionUsage never materializes assistant content", () => {
  const secret = "SECRET_PROMPT_MUST_NOT_BE_PARSED";
  const line = JSON.stringify({
    type: "assistant/message",
    seq: 1,
    time: T0,
    data: {
      message: {
        role: "assistant",
        content: [{ type: "text", text: secret }],
        source: { provider: "deepseek-official", model: "deepseek-v4-flash" },
      },
      usage: { inputTokens: 4, outputTokens: 2 },
    },
  });
  const originalParse = JSON.parse;
  let leaked = false;
  JSON.parse = function privacyGuard(value, ...args) {
    if (String(value).includes(secret)) leaked = true;
    return originalParse.call(this, value, ...args);
  };
  try {
    const parsed = extractDshSessionUsage(`${headerLine()}\n${line}\n`, -1);
    assert.equal(parsed.deltas.length, 1);
    assert.equal(parsed.deltas[0].totals.total_tokens, 6);
  } finally {
    JSON.parse = originalParse;
  }
  assert.equal(leaked, false, "message content was passed to JSON.parse");
});

test("readDshSessionText reassembles concatenated-frame zstd", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-zstd-"));
  const lines = [headerLine(), assistantLine(1, { inputTokens: 1, outputTokens: 1 })];
  const full = lines.join("\n") + "\n";
  const f1 = await zstdCompress(Buffer.from(full.slice(0, 80)));
  const f2 = await zstdCompress(Buffer.from(full.slice(80)));
  const p = path.join(dir, "session.jsonl.zstd");
  fs.writeFileSync(p, Buffer.concat([f1, f2]));

  const text = await readDshSessionText(p);
  assert.equal(text, full, "both frames must be reassembled");

  await assert.rejects(
    readDshSessionText(p, { maxOutputBytes: Buffer.byteLength(full) - 1 }),
    /decompressed session log exceeds/i,
    "declared frame sizes must be rejected before unbounded decompression",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("zstd sessions decode without the @mongodb-js/zstd native binding (issue #465)", async (t) => {
  // The desktop bundles install dependencies with --ignore-scripts, so the
  // MongoDB binding's zstd.node never exists there and require() throws. The
  // decoder must therefore succeed on the built-in zlib path alone.
  if (typeof zlib.zstdDecompressSync !== "function") {
    t.skip("built-in zlib zstd unavailable on this Node; fallback path is the only path");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-nozstd-"));
  const lines = [headerLine(), assistantLine(1, { inputTokens: 1, outputTokens: 1 })];
  const full = lines.join("\n") + "\n";
  const f1 = await zstdCompress(Buffer.from(full.slice(0, 80)));
  const f2 = await zstdCompress(Buffer.from(full.slice(80)));
  const p = path.join(dir, "session.jsonl.zstd");
  fs.writeFileSync(p, Buffer.concat([f1, f2]));

  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "@mongodb-js/zstd") {
      throw new Error("Cannot find module '@mongodb-js/zstd' (native binding missing)");
    }
    return originalLoad.call(this, request, ...rest);
  };
  try {
    const text = await readDshSessionText(p);
    assert.equal(text, full, "zstd sessions must decode via built-in zlib when the native binding is absent");
  } finally {
    Module._load = originalLoad;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveDshSessionFiles only accepts exact project/session transcript leaves", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-files-"));
  const root = path.join(dir, ".dsh", "sessions");
  fs.mkdirSync(path.join(root, "--a--", "s1"), { recursive: true });
  fs.mkdirSync(path.join(root, "--a--", "s2"), { recursive: true });
  fs.mkdirSync(path.join(root, "--a--", "s3", "nested"), { recursive: true });
  fs.mkdirSync(path.join(root, "--a--", "s4"), { recursive: true });
  fs.writeFileSync(path.join(root, "--a--", "s1", "session.jsonl"), "x\n");
  fs.writeFileSync(path.join(root, "--a--", "s2", "session.jsonl.zstd"), "y\n");
  fs.writeFileSync(path.join(root, "--a--", "s2", "settings.yaml"), "ignore\n");
  fs.writeFileSync(path.join(root, "session.jsonl"), "wrong depth\n");
  fs.writeFileSync(path.join(root, "--a--", "session.jsonl"), "wrong depth\n");
  fs.writeFileSync(path.join(root, "--a--", "s3", "nested", "session.jsonl"), "wrong depth\n");
  const staleRaw = path.join(root, "--a--", "s4", "session.jsonl");
  const activeZstd = path.join(root, "--a--", "s4", "session.jsonl.zstd");
  fs.writeFileSync(staleRaw, "stale encoding\n");
  fs.writeFileSync(activeZstd, "active encoding\n");
  fs.utimesSync(staleRaw, new Date(T0), new Date(T0));
  fs.utimesSync(activeZstd, new Date(T0 + 1000), new Date(T0 + 1000));

  const files = await resolveDshSessionFiles({ TOKENTRACKER_DSH_HOME: path.join(dir, ".dsh") });
  assert.deepEqual(files, [
    path.join(root, "--a--", "s1", "session.jsonl"),
    path.join(root, "--a--", "s2", "session.jsonl.zstd"),
    activeZstd,
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveDshSessionFiles discovers a WSL-only Harness install on Windows", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wsl-files-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nativeHome = path.join(dir, "windows", ".dsh");
  const wslHome = path.join(dir, "wsl", ".dsh");
  const sessionDir = path.join(wslHome, "sessions", "--proj--", "sess-wsl");
  fs.mkdirSync(sessionDir, { recursive: true });
  const logPath = path.join(sessionDir, "session.jsonl.zstd");
  fs.writeFileSync(logPath, "fixture");

  const files = await resolveDshSessionFiles(
    { TOKENTRACKER_WSL_MODE: "wsl-only" },
    {
      platform: "win32",
      nativeHome,
      discoverWslHome(providerDir) {
        assert.equal(providerDir, ".dsh");
        return wslHome;
      },
    },
  );

  assert.deepEqual(files, [logPath]);
});

test("parseDshIncremental writes queue rows, dedups on rerun, and adds appended delta", async () => {
  const { dir, logPath } = await makeTree({
    lines: [
      headerLine("sess-1"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, reasoningTokens: 7 }),
      assistantLine(2, { inputTokens: 20, outputTokens: 5 }, { time: T0 + 40 * 60 * 1000 }),
    ],
  });
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  const res1 = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
  assert.equal(res1.eventsAggregated, 2);

  const rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const dshRows = rows.filter((r) => r.source === "dsh");
  assert.equal(dshRows.length, 2, "two distinct half-hour buckets");
  assert.ok(dshRows.every((r) => r.model === "deepseek-v4-pro"));
  const first = dshRows.find((r) => r.total_tokens === 172);
  assert.ok(first);
  assert.equal(first.input_tokens, 100);
  assert.equal(first.output_tokens, 50);
  assert.equal(first.cached_input_tokens, 10);
  assert.equal(first.cache_creation_input_tokens, 5);
  assert.equal(first.reasoning_output_tokens, 7);
  assert.equal(first.conversation_count, 1);

  // Second run: file identity is unchanged, nothing new is parsed or queued.
  const res2 = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
  assert.equal(res2.eventsAggregated, 0, "no delta on unchanged rerun");
  const rowsAfter2 = fs.readFileSync(queuePath, "utf8").trim().split("\n").filter(Boolean).length;
  assert.equal(rowsAfter2, rows.length, "no new rows on unchanged rerun");

  // Append a third event to the same file; only the new seq contributes.
  const existing = await readDshSessionText(logPath);
  const grown = existing + assistantLine(3, { inputTokens: 300, outputTokens: 30 }, { time: T0 + 80 * 60 * 1000 }) + "\n";
  fs.writeFileSync(logPath, Buffer.concat([
    await zstdCompress(Buffer.from(grown.slice(0, 60))),
    await zstdCompress(Buffer.from(grown.slice(60))),
  ]));

  const res3 = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
  assert.equal(res3.eventsAggregated, 1, "only the appended event is counted");
  const rows3 = fs.readFileSync(queuePath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const dshTokens = rows3.filter((r) => r.source === "dsh").reduce((s, r) => s + r.total_tokens, 0);
  assert.equal(dshTokens, 172 + 25 + 330, "no re-count of the seed events");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("parseDshIncremental does not acknowledge an incomplete trailing event", async () => {
  const { dir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-partial"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ],
  });
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};
  const completeEvent = assistantLine(2, { inputTokens: 100, outputTokens: 20 });

  try {
    await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    fs.appendFileSync(logPath, completeEvent.slice(0, -2));

    const partial = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    assert.equal(partial.eventsAggregated, 0);
    assert.equal(cursors.dsh.files[logPath].lastSeq, 1);

    fs.appendFileSync(logPath, `${completeEvent.slice(-2)}\n`);
    const completed = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    assert.equal(completed.eventsAggregated, 1);
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 240);

    const repeat = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    assert.equal(repeat.eventsAggregated, 0);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 240);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const compressed of [false, true]) {
  for (const prefixCount of [0, 1]) {
    test(`parseDshIncremental retries a repaired interior v3 record (compressed=${compressed}, prefix=${prefixCount})`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-interior-repair-"));
      const queuePath = path.join(dir, "queue.jsonl");
      const logPath = path.join(dir, compressed ? "session.v3.jsonl.zstd" : "session.v3.jsonl");
      const header = JSON.stringify({ type: "session/start", id: "interior-repair" });
      const event = (seq) => JSON.stringify({
        type: "message/assistant", seq, time: T0,
        data: { model: "deepseek-v4-pro", usage: { inputTokens: 100, outputTokens: 20 } },
      });
      const write = async (lines) => {
        const bytes = Buffer.from([...lines, ""].join("\n"));
        fs.writeFileSync(logPath, compressed ? await zstdCompress(bytes) : bytes);
      };
      let cursors = {};
      const sync = async () => {
        cursors = JSON.parse(JSON.stringify(cursors));
        return parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
      };
      const total = () => Object.values(cursors.hourly.buckets)
        .reduce((sum, bucket) => sum + bucket.totals.total_tokens, 0);
      const prefix = prefixCount ? [event(0)] : [];
      try {
        await write([header, ...prefix, event(1).slice(0, -1), event(2)]);
        await sync();
        assert.equal(total(), prefixCount * 120);
        assert.equal(cursors.dsh.files[logPath].lastSeq, prefixCount ? 0 : -1);
        await sync();
        assert.equal(total(), prefixCount * 120, "unchanged damaged log must not recount the prefix");
        await write([header, ...prefix, event(1), event(2), event(3)]);
        await sync();
        assert.equal(total(), (prefixCount + 3) * 120, "repair plus append must recover every event exactly once");
        const queue = fs.readFileSync(queuePath, "utf8");
        await sync();
        await sync();
        assert.equal(total(), (prefixCount + 3) * 120);
        assert.equal(fs.readFileSync(queuePath, "utf8"), queue, "serialized retries must not append duplicate buckets");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

test("parseDshIncremental does not commit cursor state when queue append fails", async () => {
  const { dir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-queue-failure"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ],
  });
  const queuePath = path.join(dir, "queue-as-directory");
  const cursors = {};
  fs.mkdirSync(queuePath);

  try {
    await assert.rejects(
      parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath }),
      /EISDIR|directory/i,
    );
    assert.equal(cursors.hourly, undefined);
    assert.equal(cursors.dsh.files, undefined);
    assert.equal(cursors.dsh.sessions, undefined);

    fs.rmSync(queuePath, { recursive: true, force: true });
    const recovered = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    assert.equal(recovered.eventsAggregated, 1);
    const rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental reconciles legacy prefixes when a stale artifact gained an append", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-legacy-prefix-"));
  const root = path.join(dir, ".dsh", "sessions", "--proj--");
  const firstDir = path.join(root, "sess-first");
  const secondDir = path.join(root, "sess-second");
  fs.mkdirSync(firstDir, { recursive: true });
  fs.mkdirSync(secondDir, { recursive: true });
  const firstPath = await writeSessionLog(firstDir, "session.jsonl", [
    headerLine("sess-first"),
    requestHeaderLine(0),
    assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
  ]);
  const secondPath = await writeSessionLog(secondDir, "session.jsonl", [
    headerLine("sess-second"),
    requestHeaderLine(0),
    assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
  ]);
  const firstV3Path = path.join(firstDir, "session.v3.jsonl");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({
      sessionFiles: [firstPath, secondPath],
      cursors,
      queuePath,
    });
    // Reproduce the pre-ledger cursor written by the original PR.
    delete cursors.dsh.sessions;
    delete cursors.dsh.files[firstPath].contributions;
    delete cursors.dsh.files[secondPath].contributions;

    const appended = assistantLine(2, { inputTokens: 100, outputTokens: 20 });
    fs.appendFileSync(firstPath, `${appended}\n`);
    await writeSessionLog(firstDir, "session.v3.jsonl", [
      headerLine("sess-first"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
      appended,
    ]);

    const migrated = await parseDshIncremental({
      sessionFiles: [firstV3Path, secondPath],
      cursors,
      queuePath,
    });
    assert.equal(migrated.deferredMigrations, 0);
    assert.equal(migrated.eventsAggregated, 2);
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 360, "unseen append must not be subtracted from the bucket");

    const repeat = await parseDshIncremental({
      sessionFiles: [firstV3Path, secondPath],
      cursors,
      queuePath,
    });
    assert.equal(repeat.eventsAggregated, 0);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 360);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental defers incomplete replacements and recovers later", async () => {
  const { dir, sessionDir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-replace"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ],
  });
  const replacementPath = path.join(sessionDir, "session.v3.jsonl");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    fs.writeFileSync(replacementPath, `${headerLine("sess-replace")}\n`);

    const deferred = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(deferred.deferredMigrations, 1);
    assert.equal(cursors.dsh.files[logPath] != null, true);
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);

    await writeSessionLog(sessionDir, "session.v3.jsonl", [
      headerLine("sess-replace"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ]);
    const recovered = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(recovered.deferredMigrations, 0);
    assert.equal(recovered.eventsAggregated, 1);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);

    const repeat = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(repeat.eventsAggregated, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental keeps legacy migration cursors through a discovery gap", async () => {
  const { dir, sessionDir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-gap"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ],
  });
  const replacementPath = path.join(sessionDir, "session.v3.jsonl");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    delete cursors.dsh.sessions;
    delete cursors.dsh.files[logPath].contributions;
    fs.renameSync(logPath, replacementPath);
    fs.unlinkSync(replacementPath);

    await parseDshIncremental({ sessionFiles: [], cursors, queuePath });
    assert.ok(cursors.dsh.files[logPath], "legacy identity must survive discovery gaps");
    cursors.dsh.files[logPath].missingSince = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await parseDshIncremental({ sessionFiles: [], cursors, queuePath });
    assert.ok(cursors.dsh.files[logPath], "elapsed time cannot make previously counted history safe to replay");

    await writeSessionLog(sessionDir, "session.v3.jsonl", [
      headerLine("sess-gap"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ]);
    const deferred = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(deferred.deferredMigrations, 1);
    const rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120, "unknown legacy baseline must not double-count");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental retains legacy identity when a replacement is temporarily missing", async () => {
  const { dir, sessionDir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-missing-replacement"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ],
  });
  const replacementPath = path.join(sessionDir, "session.v3.jsonl");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    delete cursors.dsh.sessions;
    delete cursors.dsh.files[logPath].contributions;
    fs.renameSync(logPath, replacementPath);
    fs.unlinkSync(replacementPath);

    const missing = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(missing.deferredMigrations, 1);
    assert.ok(cursors.dsh.files[logPath]);
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);

    await parseDshIncremental({ sessionFiles: [], cursors, queuePath });
    assert.ok(cursors.dsh.files[logPath], "discovery gap must not discard the legacy identity");

    await writeSessionLog(sessionDir, "session.v3.jsonl", [
      headerLine("sess-missing-replacement"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ]);
    const stillDeferred = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(stillDeferred.deferredMigrations, 1);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental reconciles legacy/v3 and plain/zstd artifact migrations", async () => {
  const lines = [
    headerLine("sess-migrate"),
    requestHeaderLine(0),
    assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
  ];
  const { dir, sessionDir, logPath } = await makeTree({ compression: "none", lines });
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    // Simulate the cursor written by the original PR before contribution
    // ledgers were added.
    delete cursors.dsh.sessions;
    delete cursors.dsh.files[logPath].contributions;

    const v3Path = path.join(sessionDir, "session.v3.jsonl");
    fs.renameSync(logPath, v3Path);
    const selectedV3 = await resolveDshSessionFiles({
      TOKENTRACKER_DSH_HOME: path.join(dir, ".dsh"),
    });
    assert.deepEqual(selectedV3, [v3Path]);

    const v3Result = await parseDshIncremental({
      sessionFiles: selectedV3,
      cursors,
      queuePath,
    });
    assert.equal(v3Result.eventsAggregated, 1);
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    let latest = rows.at(-1);
    assert.equal(latest.total_tokens, 120, "artifact migration must not double-count the session");
    assert.equal(latest.conversation_count, 1);
    assert.equal(cursors.dsh.files[logPath], undefined);
    assert.ok(cursors.dsh.files[v3Path]);

    const v3ZstdPath = await writeSessionLog(
      sessionDir,
      "session.v3.jsonl.zstd",
      lines,
      { zstd: true },
    );
    fs.utimesSync(v3Path, new Date(T0 + 1000), new Date(T0 + 1000));
    fs.utimesSync(v3ZstdPath, new Date(T0 + 2000), new Date(T0 + 2000));
    const selectedZstd = await resolveDshSessionFiles({
      TOKENTRACKER_DSH_HOME: path.join(dir, ".dsh"),
    });
    assert.deepEqual(selectedZstd, [v3ZstdPath]);

    const zstdResult = await parseDshIncremental({
      sessionFiles: selectedZstd,
      cursors,
      queuePath,
    });
    assert.equal(zstdResult.eventsAggregated, 1);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    latest = rows.at(-1);
    assert.equal(
      latest.total_tokens,
      120,
      "plain/zstd migration must not double-count the session",
    );
    assert.equal(latest.conversation_count, 1);
    assert.equal(cursors.dsh.files[v3Path], undefined);
    assert.ok(cursors.dsh.files[v3ZstdPath]);

    const noOp = await parseDshIncremental({
      sessionFiles: selectedZstd,
      cursors,
      queuePath,
    });
    assert.equal(noOp.eventsAggregated, 0);
    assert.equal(noOp.bucketsQueued, 0);
    assert.equal(fs.readFileSync(queuePath, "utf8").trim().split("\n").length, rows.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental replaces a same-session artifact when seq is rewritten", async () => {
  const { dir, sessionDir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("same-session"),
      requestHeaderLine(99),
      assistantLine(100, { inputTokens: 100, outputTokens: 20 }),
    ],
  });
  const replacementPath = path.join(sessionDir, "session.v3.jsonl");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
    await writeSessionLog(sessionDir, "session.v3.jsonl", [
      headerLine("same-session"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
    ]);
    const migrated = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(migrated.eventsAggregated, 1);
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);
    assert.equal(rows.at(-1).conversation_count, 1);

    const repeat = await parseDshIncremental({
      sessionFiles: [replacementPath],
      cursors,
      queuePath,
    });
    assert.equal(repeat.eventsAggregated, 0);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.at(-1).total_tokens, 120);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental preserves archived sessions during another artifact migration", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-archived-migration-"));
  const root = path.join(dir, ".dsh", "sessions", "--proj--");
  const activeDir = path.join(root, "sess-active");
  const archivedDir = path.join(root, "sess-archived");
  fs.mkdirSync(activeDir, { recursive: true });
  fs.mkdirSync(archivedDir, { recursive: true });
  const activePath = await writeSessionLog(activeDir, "session.jsonl", [
    headerLine("sess-active"),
    requestHeaderLine(0),
    assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
  ]);
  const archivedPath = await writeSessionLog(archivedDir, "session.jsonl", [
    headerLine("sess-archived"),
    requestHeaderLine(0, "deepseek-v4-flash"),
    assistantLine(
      1,
      { inputTokens: 30, outputTokens: 10 },
      { model: "deepseek-v4-flash", time: T0 + 40 * 60 * 1000 },
    ),
  ]);
  const activeV3Path = path.join(activeDir, "session.v3.jsonl");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({
      sessionFiles: [activePath, archivedPath],
      cursors,
      queuePath,
    });
    fs.unlinkSync(archivedPath);
    await parseDshIncremental({ sessionFiles: [activePath], cursors, queuePath });

    fs.renameSync(activePath, activeV3Path);
    fs.utimesSync(activeV3Path, new Date(T0 + 1000), new Date(T0 + 1000));
    const result = await parseDshIncremental({
      sessionFiles: [activeV3Path],
      cursors,
      queuePath,
    });
    assert.equal(result.eventsAggregated, 1);

    const rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    const latestActive = rows.filter(
      (row) => row.model === "deepseek-v4-pro" && row.hour_start === "2026-05-01T12:00:00.000Z",
    ).at(-1);
    const latestArchived = rows.filter(
      (row) => row.model === "deepseek-v4-flash" && row.hour_start === "2026-05-01T12:30:00.000Z",
    ).at(-1);
    assert.equal(latestActive.total_tokens, 120);
    assert.equal(latestActive.conversation_count, 1);
    assert.equal(latestArchived.total_tokens, 40, "deleted session history must survive another migration");
    assert.equal(latestArchived.conversation_count, 1);
    assert.ok(cursors.dsh.sessions["sess-archived"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental isolates an unreadable migration from healthy sessions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-isolated-migration-"));
  const root = path.join(dir, ".dsh", "sessions", "--proj--");
  const activeDir = path.join(root, "sess-active");
  const brokenDir = path.join(root, "sess-broken");
  fs.mkdirSync(activeDir, { recursive: true });
  fs.mkdirSync(brokenDir, { recursive: true });
  const activePath = await writeSessionLog(activeDir, "session.jsonl", [
    headerLine("sess-active"),
    requestHeaderLine(0),
    assistantLine(1, { inputTokens: 100, outputTokens: 20 }),
  ]);
  const brokenLines = [
    headerLine("sess-broken"),
    requestHeaderLine(0, "deepseek-v4-flash"),
    assistantLine(
      1,
      { inputTokens: 30, outputTokens: 10 },
      { model: "deepseek-v4-flash", time: T0 + 40 * 60 * 1000 },
    ),
  ];
  const brokenPath = await writeSessionLog(brokenDir, "session.jsonl", brokenLines);
  const activeV3Path = path.join(activeDir, "session.v3.jsonl");
  const brokenV3Path = path.join(brokenDir, "session.v3.jsonl.zstd");
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  try {
    await parseDshIncremental({
      sessionFiles: [activePath, brokenPath],
      cursors,
      queuePath,
    });
    fs.renameSync(activePath, activeV3Path);
    fs.utimesSync(activeV3Path, new Date(T0 + 1000), new Date(T0 + 1000));
    fs.writeFileSync(brokenV3Path, "not-a-zstd-frame");

    const first = await parseDshIncremental({
      sessionFiles: [activeV3Path, brokenV3Path],
      cursors,
      queuePath,
    });
    assert.equal(first.eventsAggregated, 1, "healthy migrations should proceed independently");
    let rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    let brokenLatest = rows.filter((row) => row.model === "deepseek-v4-flash").at(-1);
    assert.equal(brokenLatest.total_tokens, 40);
    assert.ok(cursors.dsh.files[brokenPath], "failed migration cursor should remain retryable");

    await writeSessionLog(brokenDir, "session.v3.jsonl.zstd", brokenLines, { zstd: true });
    const second = await parseDshIncremental({
      sessionFiles: [activeV3Path, brokenV3Path],
      cursors,
      queuePath,
    });
    assert.equal(second.eventsAggregated, 1);
    rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
    brokenLatest = rows.filter((row) => row.model === "deepseek-v4-flash").at(-1);
    assert.equal(brokenLatest.total_tokens, 40, "retry must not double-count the recovered session");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseDshIncremental accepts a replacement session whose seq restarts", async () => {
  const { dir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-old"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 100, outputTokens: 50 }),
      assistantLine(2, { inputTokens: 20, outputTokens: 5 }),
    ],
  });
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  const first = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
  assert.equal(first.eventsAggregated, 2);

  await writeSessionLog(path.dirname(logPath), path.basename(logPath), [
    headerLine("sess-new"),
    requestHeaderLine(0, "deepseek-v4-flash"),
    assistantLine(1, { inputTokens: 7, outputTokens: 3 }),
  ]);

  const second = await parseDshIncremental({ sessionFiles: [logPath], cursors, queuePath });
  assert.equal(second.eventsAggregated, 1, "new session identity resets the seq watermark");
  assert.equal(cursors.dsh.files[logPath].sessionId, "sess-new");

  const rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").map(JSON.parse);
  const total = rows.filter((row) => row.source === "dsh").reduce((sum, row) => sum + row.total_tokens, 0);
  assert.equal(total, 150 + 25 + 10);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("parseDshIncremental isolates corrupt logs and prunes deleted-session cursors", async () => {
  const { dir, sessionDir, logPath } = await makeTree({
    compression: "none",
    lines: [
      headerLine("sess-good"),
      requestHeaderLine(0),
      assistantLine(1, { inputTokens: 8, outputTokens: 2 }),
    ],
  });
  const corruptDir = path.join(path.dirname(sessionDir), "sess-corrupt");
  fs.mkdirSync(corruptDir, { recursive: true });
  const corruptPath = path.join(corruptDir, "session.jsonl.zstd");
  fs.writeFileSync(corruptPath, "not-a-zstd-frame");
  const deletedPath = path.join(path.dirname(sessionDir), "sess-deleted", "session.jsonl");
  const cursors = {
    dsh: {
      files: {
        [deletedPath]: { inode: 1, size: 10, mtimeMs: 1, lastSeq: 9 },
      },
    },
  };

  const result = await parseDshIncremental({
    sessionFiles: [corruptPath, logPath],
    cursors,
    queuePath: path.join(dir, "queue.jsonl"),
  });

  assert.equal(result.recordsProcessed, 1);
  assert.equal(result.eventsAggregated, 1, "healthy sessions still aggregate");
  assert.ok(cursors.dsh.files[logPath]);
  assert.equal(cursors.dsh.files[corruptPath], undefined, "failed logs retry on a later sync");
  assert.equal(cursors.dsh.files[deletedPath], undefined, "deleted sessions do not leak cursor state");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("parseDshIncremental is a no-op with no files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-empty-"));
  const res = await parseDshIncremental({
    sessionFiles: [],
    cursors: {},
    queuePath: path.join(dir, "queue.jsonl"),
  });
  assert.equal(res.recordsProcessed, 0);
  assert.equal(res.eventsAggregated, 0);
  assert.equal(res.bucketsQueued, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("isDshSessionLogName and parseDshVersion accept versioned and legacy session logs", () => {
  assert.equal(isDshSessionLogName("session.jsonl"), true);
  assert.equal(isDshSessionLogName("session.jsonl.zstd"), true);
  assert.equal(isDshSessionLogName("session.v3.jsonl"), true);
  assert.equal(isDshSessionLogName("session.v3.jsonl.zstd"), true);
  assert.equal(isDshSessionLogName("session.v2.jsonl"), true);
  assert.equal(isDshSessionLogName("session.v10.jsonl.zstd"), true);

  assert.equal(isDshSessionLogName("session.log"), false);
  assert.equal(isDshSessionLogName("session.v3.txt"), false);
  assert.equal(isDshSessionLogName("v3.jsonl"), false);
  assert.equal(isDshSessionLogName("sessions.jsonl"), false);
  assert.equal(isDshSessionLogName(""), false);
  assert.equal(isDshSessionLogName(null), false);

  assert.equal(parseDshVersion("session.jsonl"), 0);
  assert.equal(parseDshVersion("session.jsonl.zstd"), 0);
  assert.equal(parseDshVersion("session.v3.jsonl"), 3);
  assert.equal(parseDshVersion("session.v3.jsonl.zstd"), 3);
  assert.equal(parseDshVersion("session.v12.jsonl"), 12);
});

test("resolveDshSessionFiles discovers v3 session logs and prefers v3 over legacy when tied", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-v3-files-"));
  const root = path.join(dir, ".dsh", "sessions");
  fs.mkdirSync(path.join(root, "--p1--", "s1"), { recursive: true });
  fs.mkdirSync(path.join(root, "--p1--", "s2"), { recursive: true });

  const s1V3 = path.join(root, "--p1--", "s1", "session.v3.jsonl.zstd");
  fs.writeFileSync(s1V3, "v3 content\n");

  // In s2, both legacy and v3 exist with identical timestamps
  const s2Legacy = path.join(root, "--p1--", "s2", "session.jsonl");
  const s2V3 = path.join(root, "--p1--", "s2", "session.v3.jsonl");
  fs.writeFileSync(s2Legacy, "legacy\n");
  fs.writeFileSync(s2V3, "v3\n");
  fs.utimesSync(s2Legacy, new Date(T0), new Date(T0));
  fs.utimesSync(s2V3, new Date(T0), new Date(T0));

  const files = await resolveDshSessionFiles({ TOKENTRACKER_DSH_HOME: path.join(dir, ".dsh") });
  assert.deepEqual(files, [
    s1V3,
    s2V3,
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("parseDshIncremental parses DeepSeek Harness v3 session files end-to-end", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-v3-e2e-"));
  const sessionDir = path.join(dir, "sessions", "--proj--", "sess-v3");
  fs.mkdirSync(sessionDir, { recursive: true });
  const logPath = path.join(sessionDir, "session.v3.jsonl");

  const lines = [
    JSON.stringify({ type: "session/start", version: 3, id: "sess-v3", createdAt: T0, cwd: "/proj" }),
    JSON.stringify({
      type: "request/header",
      seq: 0,
      time: T0,
      data: { header: { config: { provider: "deepseek-official", model: "deepseek-v4-pro" } } },
    }),
    JSON.stringify({
      type: "message/assistant",
      seq: 1,
      time: T0 + 1000,
      data: {
        turn: 1,
        message: { role: "assistant", source: { model: "deepseek-v4-flash" } },
        usage: {
          inputTokens: 100,
          outputTokens: 40,
          cacheReadTokens: 50,
          cacheWriteTokens: 10,
          reasoningTokens: 20,
        },
      },
    }),
  ];
  fs.writeFileSync(logPath, lines.join("\n") + "\n");

  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};
  const res = await parseDshIncremental({
    sessionFiles: [logPath],
    cursors,
    queuePath,
  });

  assert.equal(res.recordsProcessed, 1);
  assert.equal(res.eventsAggregated, 1);
  assert.equal(res.bucketsQueued, 1);

  const rows = (fs.readFileSync(queuePath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "dsh");
  assert.equal(rows[0].model, "deepseek-v4-flash");
  assert.equal(rows[0].input_tokens, 100);
  assert.equal(rows[0].cached_input_tokens, 50);
  assert.equal(rows[0].cache_creation_input_tokens, 10);
  assert.equal(rows[0].output_tokens, 40);
  assert.equal(rows[0].reasoning_output_tokens, 20);
  assert.equal(rows[0].total_tokens, 220);

  fs.rmSync(dir, { recursive: true, force: true });
});

