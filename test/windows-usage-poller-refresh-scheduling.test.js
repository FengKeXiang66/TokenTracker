const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const repoRoot = path.join(__dirname, "..");

test("Windows usage poller keeps the final coalesced refresh schedulable", () => {
  const source = fs
    .readFileSync(path.join(repoRoot, "TokenTrackerWin/UsagePoller.cs"), "utf8")
    .replace(/\r\n/g, "\n");
  const finallyStart = source.indexOf("finally\n        {");
  assert.notEqual(finallyStart, -1, "RefreshAsync must retain its drain finally block");
  const finallyBlock = source.slice(finallyStart, source.indexOf("\n        }\n    }", finallyStart));

  // A cancellation can arrive between the IsCancellationRequested check and
  // queueing the delegate. Passing that token to Task.Run would make the
  // runtime drop the delegate, leaving _refreshRequested set indefinitely.
  assert.match(
    finallyBlock,
    /Task\.Run\(\(\)\s*=>\s*RefreshAsync\(currentToken\)\s*\);/,
    "the coalesced refresh must be queued even if its token is cancelled after the check",
  );
  assert.doesNotMatch(
    finallyBlock,
    /Task\.Run\(\(\)\s*=>\s*RefreshAsync\(currentToken\)\s*,\s*currentToken\s*\)/,
    "Task.Run must not use the cancellation token as a scheduling gate",
  );
});
