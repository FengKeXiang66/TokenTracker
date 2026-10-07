const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { test } = require("node:test");

const {
  collectLocalSubscriptions,
  detectClaudeCodeCredentialsPresence,
  detectClaudeCodeSubscriptionDetails,
  readClaudeCodeAccessToken,
  readClaudeCodeOauthToken,
} = require("../src/lib/subscriptions");

function base64UrlEncodeJson(value) {
  const raw = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return raw.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJwt(payload) {
  const header = base64UrlEncodeJson({ alg: "none", typ: "JWT" });
  const body = base64UrlEncodeJson(payload);
  return `${header}.${body}.`;
}

async function writeJson(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

test("collectLocalSubscriptions returns paid ChatGPT plans from codex + opencode", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-"));

  try {
    const home = tmp;
    const codexHome = path.join(tmp, ".codex");
    const codexJwt = makeJwt({
      "https://api.openai.com/auth": { chatgpt_plan_type: "pro" },
    });
    await writeJson(path.join(codexHome, "auth.json"), {
      tokens: { access_token: codexJwt },
    });

    const opencodeJwt = makeJwt({
      "https://api.openai.com/auth": { chatgpt_plan_type: "plus" },
    });
    await writeJson(path.join(tmp, ".local", "share", "opencode", "auth.json"), {
      openai: { access: opencodeJwt },
    });

    const subs = await collectLocalSubscriptions({
      home,
      env: { CODEX_HOME: codexHome },
      platform: "linux",
    });

    assert.equal(subs.length, 2);
    assert.ok(subs.some((s) => s.tool === "codex" && s.planType === "pro"));
    assert.ok(subs.some((s) => s.tool === "opencode" && s.planType === "plus"));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions hides free/unknown plans", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-free-"));

  try {
    const home = tmp;
    const codexHome = path.join(tmp, ".codex");
    const codexJwt = makeJwt({
      "https://api.openai.com/auth": { chatgpt_plan_type: "free" },
    });
    await writeJson(path.join(codexHome, "auth.json"), {
      tokens: { access_token: codexJwt },
    });

    const subs = await collectLocalSubscriptions({
      home,
      env: { CODEX_HOME: codexHome },
      platform: "linux",
    });

    assert.deepEqual(subs, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions can probe Claude Code keychain item existence (no secret read)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-"));

  try {
    const runner = (cmd, args) => {
      const service = args?.[args.indexOf("-s") + 1] || "";
      return {
        status: cmd === "/usr/bin/security" && service === "Claude Code-credentials" ? 0 : 1,
      };
    };

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "darwin",
      securityRunner: runner,
      probeKeychain: true,
    });

    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0], {
      tool: "claude",
      provider: "anthropic",
      product: "credentials",
      planType: "present",
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions does not probe Claude keychain by default", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-default-"));

  try {
    let calls = 0;
    const runner = () => {
      calls += 1;
      return { status: 0 };
    };

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "darwin",
      securityRunner: runner,
    });

    assert.deepEqual(subs, []);
    assert.equal(calls, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions hides Claude keychain line when probe fails", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-miss-"));

  try {
    const runner = () => ({ status: 1 });

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "darwin",
      securityRunner: runner,
      probeKeychain: true,
    });

    assert.deepEqual(subs, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions can read Claude Code subscription type from keychain when enabled (no secret leak)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-details-"));

  try {
    const runner = (cmd, args) => {
      const service = args?.[args.indexOf("-s") + 1] || "";
      if (cmd !== "/usr/bin/security" || service !== "Claude Code-credentials")
        return { status: 1 };

      if (args.includes("-w")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            claudeAiOauth: {
              subscriptionType: "max",
              rateLimitTier: "tier-1",
              accessToken: "secret-access",
              refreshToken: "secret-refresh",
            },
          }),
        };
      }

      return { status: 0 };
    };

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "darwin",
      securityRunner: runner,
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0], {
      tool: "claude",
      provider: "anthropic",
      product: "subscription",
      planType: "max",
      rateLimitTier: "tier-1",
    });
    assert.ok(!("accessToken" in subs[0]));
    assert.ok(!("refreshToken" in subs[0]));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions falls back to Claude Code keychain presence when details probe fails", async () => {
  const tmp = await fs.mkdtemp(
    path.join(os.tmpdir(), "tokentracker-subscriptions-claude-details-fallback-"),
  );

  try {
    const runner = (cmd, args) => {
      const service = args?.[args.indexOf("-s") + 1] || "";
      if (cmd !== "/usr/bin/security" || service !== "Claude Code-credentials")
        return { status: 1 };

      if (args.includes("-w")) return { status: 1 };
      return { status: 0 };
    };

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "darwin",
      securityRunner: runner,
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0], {
      tool: "claude",
      provider: "anthropic",
      product: "credentials",
      planType: "present",
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions reads Claude Code credentials from ~/.claude/.credentials.json on Linux", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-linux-"));

  try {
    await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
      claudeAiOauth: {
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
        subscriptionType: "max",
        rateLimitTier: "tier-1",
      },
    });

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "linux",
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0], {
      tool: "claude",
      provider: "anthropic",
      product: "subscription",
      planType: "max",
      rateLimitTier: "tier-1",
    });
    assert.ok(!("accessToken" in subs[0]));
    assert.ok(!("refreshToken" in subs[0]));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions reports Linux Claude Code credentials presence when details missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-linux-presence-"));

  try {
    // Payload without subscriptionType — details extractor returns null, fall back to presence.
    await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
      claudeAiOauth: { accessToken: "secret-access" },
    });

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "linux",
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0], {
      tool: "claude",
      provider: "anthropic",
      product: "credentials",
      planType: "present",
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions reads Claude Code credentials from %USERPROFILE%\\.claude\\.credentials.json on Windows", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-win32-"));

  try {
    // Windows stores the same plain JSON file as Linux (under the user profile).
    await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
      claudeAiOauth: {
        accessToken: "secret-access",
        subscriptionType: "max",
        rateLimitTier: "tier-1",
      },
    });

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "win32",
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.equal(subs.length, 1);
    assert.deepEqual(subs[0], {
      tool: "claude",
      provider: "anthropic",
      product: "subscription",
      planType: "max",
      rateLimitTier: "tier-1",
    });
    assert.ok(!("accessToken" in subs[0]));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("Claude Code credential helpers default to the current platform", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-default-platform-"));

  try {
    if (process.platform === "darwin") {
      const runner = (cmd, args) => {
        const service = args?.[args.indexOf("-s") + 1] || "";
        if (cmd !== "/usr/bin/security" || service !== "Claude Code-credentials") {
          return { status: 1 };
        }
        return {
          status: 0,
          stdout: JSON.stringify({
            claudeAiOauth: {
              accessToken: "darwin-default-token",
              expiresAt: Date.now() + 60 * 60 * 1000,
              subscriptionType: "max",
              rateLimitTier: "tier-1",
            },
          }),
        };
      };

      assert.equal(readClaudeCodeAccessToken({ securityRunner: runner }), "darwin-default-token");
      assert.deepEqual(detectClaudeCodeSubscriptionDetails({ securityRunner: runner }), {
        tool: "claude",
        provider: "anthropic",
        product: "subscription",
        planType: "max",
        rateLimitTier: "tier-1",
      });
      return;
    }

    if (process.platform === "linux" || process.platform === "win32") {
      await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
        claudeAiOauth: {
          accessToken: "file-default-token",
          expiresAt: Date.now() + 60 * 60 * 1000,
          subscriptionType: "max",
          rateLimitTier: "tier-1",
        },
      });

      assert.equal(readClaudeCodeAccessToken({ home: tmp }), "file-default-token");
      assert.deepEqual(detectClaudeCodeSubscriptionDetails({ home: tmp }), {
        tool: "claude",
        provider: "anthropic",
        product: "subscription",
        planType: "max",
        rateLimitTier: "tier-1",
      });
      return;
    }

    assert.equal(readClaudeCodeAccessToken({ home: tmp }), null);
    assert.equal(detectClaudeCodeSubscriptionDetails({ home: tmp }), null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("readClaudeCodeAccessToken returns null when the keychain token is expired", () => {
  const nowMs = Date.parse("2026-09-10T00:00:00.000Z");
  const runner = () => ({
    status: 0,
    stdout: JSON.stringify({
      claudeAiOauth: {
        accessToken: "expired-darwin-token",
        expiresAt: nowMs - 60_000,
      },
    }),
  });

  assert.equal(
    readClaudeCodeAccessToken({ platform: "darwin", securityRunner: runner, nowMs }),
    null,
  );
});

test("readClaudeCodeOauthToken exposes the expiry that identifies the credential", () => {
  const nowMs = Date.parse("2026-09-10T00:00:00.000Z");
  const expiresAt = nowMs + 6 * 60 * 60 * 1000;
  const runner = () => ({
    status: 0,
    stdout: JSON.stringify({ claudeAiOauth: { accessToken: "live-darwin-token", expiresAt } }),
  });

  assert.deepEqual(
    readClaudeCodeOauthToken({ platform: "darwin", securityRunner: runner, nowMs }),
    { accessToken: "live-darwin-token", expiresAtMs: expiresAt },
  );
});

test("readClaudeCodeAccessToken returns a live keychain token", () => {
  const nowMs = Date.parse("2026-09-10T00:00:00.000Z");
  const runner = () => ({
    status: 0,
    stdout: JSON.stringify({
      claudeAiOauth: {
        accessToken: "live-darwin-token",
        expiresAt: nowMs + 60 * 60 * 1000,
      },
    }),
  });

  assert.equal(
    readClaudeCodeAccessToken({ platform: "darwin", securityRunner: runner, nowMs }),
    "live-darwin-token",
  );
});

for (const platform of ["linux", "win32"]) {
  test(`readClaudeCodeAccessToken returns null when the ${platform} credentials file is expired`, async () => {
    const nowMs = Date.parse("2026-09-10T00:00:00.000Z");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `tokentracker-subscriptions-claude-${platform}-expired-`));
    try {
      await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
        claudeAiOauth: {
          accessToken: `expired-${platform}-token`,
          expiresAt: nowMs - 60_000,
        },
      });
      assert.equal(
        readClaudeCodeAccessToken({ platform, home: tmp, nowMs }),
        null,
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test(`readClaudeCodeAccessToken returns a live ${platform} credentials-file token`, async () => {
    const nowMs = Date.parse("2026-09-10T00:00:00.000Z");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `tokentracker-subscriptions-claude-${platform}-live-`));
    try {
      await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
        claudeAiOauth: {
          accessToken: `live-${platform}-token`,
          expiresAt: nowMs + 60 * 60 * 1000,
        },
      });
      assert.equal(
        readClaudeCodeAccessToken({ platform, home: tmp, nowMs }),
        `live-${platform}-token`,
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
}

test("collectLocalSubscriptions does not read ~/.claude/.credentials.json on unsupported platforms", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-other-"));

  try {
    // Real-looking credentials file on disk — but the platform has no documented
    // plain-file store, so it must be ignored.
    await writeJson(path.join(tmp, ".claude", ".credentials.json"), {
      claudeAiOauth: {
        accessToken: "should-not-be-read",
        subscriptionType: "max",
      },
    });

    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "aix",
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.deepEqual(subs, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions hides Claude Code line on Linux when credentials file is absent", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-claude-linux-miss-"));

  try {
    const subs = await collectLocalSubscriptions({
      home: tmp,
      env: {},
      platform: "linux",
      probeKeychain: true,
      probeKeychainDetails: true,
    });

    assert.deepEqual(subs, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("collectLocalSubscriptions includes OpenClaw when session plugin is configured", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tokentracker-subscriptions-openclaw-"));

  try {
    const home = tmp;
    const pluginEntryDir = path.join(
      home,
      ".tokentracker",
      "tracker",
      "openclaw-plugin",
      "openclaw-session-sync",
    );
    await fs.mkdir(pluginEntryDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginEntryDir, "package.json"),
      '{"name":"@tokentracker/openclaw-session-sync"}\n',
      "utf8",
    );
    await fs.writeFile(path.join(pluginEntryDir, "index.js"), "export default {};\n", "utf8");

    await writeJson(path.join(home, ".openclaw", "openclaw.json"), {
      plugins: {
        entries: {
          "openclaw-session-sync": {
            enabled: true,
            hooks: { allowConversationAccess: true },
          },
        },
        load: {
          paths: [pluginEntryDir],
        },
        installs: {
          "openclaw-session-sync": {
            sourcePath: pluginEntryDir,
            installPath: pluginEntryDir,
          },
        },
      },
    });

    const subs = await collectLocalSubscriptions({
      home,
      env: {},
      platform: "linux",
    });

    assert.ok(
      subs.some(
        (s) =>
          s.tool === "openclaw" &&
          s.provider === "openclaw" &&
          s.product === "session_plugin" &&
          s.planType === "enabled",
      ),
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("Claude keychain reads and presence select the active account, never a stale service-only item", () => {
  const calls = [];
  const securityRunner = (_cmd, args) => {
    calls.push(args);
    const active = args.includes("-a") && args[args.indexOf("-a") + 1] === "active-user";
    return { status: 0, stdout: JSON.stringify({ claudeAiOauth: { accessToken: active ? "active-token" : "stale-token", subscriptionType: active ? "max" : "pro" } }) };
  };
  const opts = { platform: "darwin", env: { USER: "active-user" }, securityRunner };
  assert.equal(readClaudeCodeAccessToken(opts), "active-token");
  assert.equal(detectClaudeCodeSubscriptionDetails(opts).planType, "max");
  assert.equal(detectClaudeCodeCredentialsPresence(opts).planType, "present");
  assert.equal(calls.length, 3);
  for (const args of calls) assert.equal(args[args.indexOf("-a") + 1], "active-user");
});

test("Claude keychain does not fall back to an unrelated stale account when the selected item is absent", () => {
  const calls = [];
  const result = readClaudeCodeAccessToken({ platform: "darwin", env: { USER: "active-user" }, securityRunner: (_cmd, args) => {
    calls.push(args);
    return args.includes("-a") ? { status: 44 } : { status: 0, stdout: '{"claudeAiOauth":{"accessToken":"stale-token"}}' };
  } });
  assert.equal(result, null);
  assert.equal(calls.length, 1);
});

test("Claude keychain account mirrors environment, OS fallback and upstream username validation", () => {
  const { resolveClaudeKeychainAccount } = require("../src/lib/subscriptions");
  assert.equal(resolveClaudeKeychainAccount({ env: { USER: "named-user" }, userInfo: () => ({ username: "os-user" }) }), "named-user");
  assert.equal(resolveClaudeKeychainAccount({ env: {}, userInfo: () => ({ username: "os-user" }) }), "os-user");
  assert.equal(resolveClaudeKeychainAccount({ env: { USER: "invalid user" } }), "claude-code-user");
  assert.equal(resolveClaudeKeychainAccount({ env: {}, userInfo: () => { throw new Error("no user"); } }), "claude-code-user");
});
