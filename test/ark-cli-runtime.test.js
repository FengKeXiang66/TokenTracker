"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

for (const product of ["agent", "coding"]) {
  test(`Ark ${product} Plan runs an npm CLI from a Finder-style minimal PATH`, {
    skip: process.platform === "win32",
  }, (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "ark-runtime-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const bin = path.join(home, "node installation", "bin");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(path.join(home, ".arkcli"));
    fs.symlinkSync(process.execPath, path.join(bin, "node"));
    const payload = {
      viewer: { user_id: "fixture", profile: `${product}-plan-personal` },
      items: [{ product: `${product}-plan`, subscribed: true, tier: product === "agent" ? "medium" : "pro",
        periods: [{ label: product === "agent" ? "5h" : "session", percent: 25 }] }],
    };
    fs.writeFileSync(path.join(bin, "arkcli"),
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(payload))});\n`,
      { mode: 0o755 });
    const modulePath = require.resolve(`../src/lib/ark-${product}-plan-limits`);
    const fn = product === "agent" ? "fetchArkAgentPlanLimits" : "fetchArkCodingPlanLimits";
    const script = `require(${JSON.stringify(modulePath)}).${fn}(${JSON.stringify({ home, globalBinDirs: [bin] })})
      .then(result => process.stdout.write(JSON.stringify(result)));`;
    const result = JSON.parse(execFileSync(process.execPath, ["-e", script], {
      env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 15000,
    }));
    assert.equal(result.configured, true);
    assert.equal(result.error, null, JSON.stringify(result));
    assert.equal(result.primary_window.used_percent, 25);
  });
}
