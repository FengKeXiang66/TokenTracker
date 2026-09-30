const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionDir = path.resolve(
  __dirname,
  "..",
  "TokenTrackerLinux",
  "gnome-extension",
  "tokentracker@tokentracker.cc",
);

test("GNOME extension parses as an ES module", () => {
  // Piped through stdin so Node 20 (no module detection) still checks it as ESM.
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: fs.readFileSync(path.join(extensionDir, "extension.js")),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("GNOME extension metadata matches its directory and lists shell versions", () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(extensionDir, "metadata.json"), "utf8"));
  // GNOME only loads an extension whose uuid equals its directory name.
  assert.equal(metadata.uuid, path.basename(extensionDir));
  assert.ok(Array.isArray(metadata["shell-version"]) && metadata["shell-version"].length > 0);
  for (const version of metadata["shell-version"]) {
    assert.match(version, /^\d+$/);
  }
});

test("GNOME extension ships in the deb, rpm and Arch packages", () => {
  const root = path.resolve(__dirname, "..");
  const uuid = path.basename(extensionDir);
  const files = fs.readdirSync(extensionDir).filter((f) => f !== "README.md").sort();
  const conf = JSON.parse(fs.readFileSync(path.join(root, "TokenTrackerLinux/src-tauri/tauri.conf.json"), "utf8"));
  for (const format of ["deb", "rpm"]) {
    const mapped = conf.bundle.linux[format].files;
    const expected = Object.fromEntries(
      files.map((f) => [`/usr/share/gnome-shell/extensions/${uuid}/${f}`, `../gnome-extension/${uuid}/${f}`]),
    );
    assert.deepEqual(mapped, expected, format);
  }
  const pkgbuild = fs.readFileSync(path.join(root, "TokenTrackerLinux/packaging/arch/tokentracker-linux/PKGBUILD"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/release-dmg.yml"), "utf8");
  const loopOver = (text, head) => text.split("\n").find((line) => line.includes(head)) ?? "";
  for (const f of files) {
    assert.ok(loopOver(pkgbuild, "for _file in").includes(f), `PKGBUILD installs ${f}`);
    assert.ok(loopOver(workflow, "for file in metadata.json").includes(f), `release checks ${f}`);
  }
  assert.match(workflow, /verify_gnome_extension "deb"/);
  assert.match(workflow, /verify_gnome_extension "rpm"/);
  const validator = fs.readFileSync(path.join(root, "TokenTrackerLinux/scripts/validate-package.sh"), "utf8");
  for (const f of files) {
    assert.ok(validator.includes(`usr/share/gnome-shell/extensions/${uuid}/${f}`), f);
  }
});
