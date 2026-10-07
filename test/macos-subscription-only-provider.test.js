const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8").replace(/\r\n/g, "\n");
}

const usageLimitsViewPath = "TokenTrackerBar/TokenTrackerBar/Views/UsageLimitsView.swift";

test("menu-bar panel is not gated on a provider having usable quota data", () => {
  const source = read(usageLimitsViewPath);

  // The old shape hid the entire panel — including every hand-entered
  // subscription bar — whenever no provider reported usable quota data.
  assert.doesNotMatch(source, /if let limits, hasAnyAvailable\(limits\) \{/);
  assert.match(source, /if hasAnyAvailable\(limits\) \|\| !visibleGroups\.isEmpty \{/);
});

test("a provider without usable quota data falls back to its subscription row", () => {
  const source = read(usageLimitsViewPath);

  // Every provider branch requires configured + no error; the shared fallback
  // after the switch is what keeps a manual subscription visible.
  assert.match(
    source,
    /case "opencodeGo":[\s\S]*?if let opencodeGo = limits\.opencodeGo, opencodeGo\.configured, opencodeGo\.error == nil \{/,
  );
  assert.match(
    source,
    /case "antigravity" where limits\.antigravity\.configured && limits\.antigravity\.error == nil:/,
  );
  assert.match(
    source,
    /default:\s*\n\s*break\s*\n\s*\}\s*\n\s*\/\/[\s\S]*?\n\s*return subscriptionOnlySection\(id: id\)/,
  );
});

test("subscription-only sections render the subscription bar without quota rows or status text", () => {
  const source = read(usageLimitsViewPath);
  const sectionMatch = source.match(
    /private func subscriptionOnlySection\(id: String\) -> AnyView\? \{[\s\S]*?\n    \}\n/,
  );

  assert.ok(sectionMatch, "subscriptionOnlySection should exist");
  const section = sectionMatch[0];

  assert.match(section, /guard let subscription = subscriptionByProvider\[id\] else \{ return nil \}/);
  assert.match(section, /subscriptionRow\(for: subscription\)/);
  assert.match(section, /subscriptionBadge\(subscription\)/);
  // No quota rows, no "not connected" status line, no explanation popover —
  // the user asked for the subscription progress bar and nothing else.
  assert.doesNotMatch(section, /limitRow\(/);
  assert.doesNotMatch(section, /LimitsExplainContent/);
  assert.doesNotMatch(section, /resetSection|serviceStatusRow/);
});

test("subscription-only sections reuse the shared provider icon and display name", () => {
  const source = read(usageLimitsViewPath);

  // Icons come from one id→asset table so a provider with no quota record
  // still renders the same brand mark it shows when connected.
  const iconTableMatch = source.match(
    /private static let providerIconAssetNames: \[String: String\] = \[([\s\S]*?)\n    \]/,
  );
  assert.ok(iconTableMatch, "providerIconAssetNames should exist");
  for (const [id, asset] of [
    ["opencodeGo", "OpenCodeLogo"],
    ["antigravity", "AntigravityLogo"],
    ["claude", "ClaudeLogo"],
    ["codex", "CodexLogo"],
    ["devin", "DevinLogo"],
  ]) {
    assert.match(iconTableMatch[1], new RegExp(`"${id}": "${asset}"`), `${id} should map to ${asset}`);
  }
  assert.match(source, /Text\(LimitsSettingsStore\.displayNames\[id\] \?\? id\)/);
});

test("provider icon table stays in lockstep with the connected branches", () => {
  const source = read(usageLimitsViewPath);
  const iconTableMatch = source.match(
    /private static let providerIconAssetNames: \[String: String\] = \[([\s\S]*?)\n    \]/,
  );
  assert.ok(iconTableMatch, "providerIconAssetNames should exist");
  const table = new Map(
    [...iconTableMatch[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  // Every provider branch names its asset inline. If one is added or renamed
  // without the table, an unconfigured provider would lose its logo while a
  // configured one kept it.
  const switchMatch = source.match(/private func sectionIfContent\([\s\S]*?\n    \}/);
  assert.ok(switchMatch, "sectionIfContent should exist");
  const cases = switchMatch[0].split(/\n        case "/).slice(1);
  assert.ok(cases.length >= 12, `expected provider cases, got ${cases.length}`);

  const branchAssets = new Map();
  for (const block of cases) {
    const id = block.match(/^(\w+)"/)?.[1];
    const asset = block.match(/assetName: "([^"]+)"/)?.[1];
    if (id && asset) branchAssets.set(id, asset);
  }
  assert.equal(branchAssets.size, table.size, "the icon table should cover every provider branch");
  for (const [id, asset] of branchAssets) {
    assert.equal(table.get(id), asset, `${id} icon asset should match the connected branch`);
  }
});
