const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function bridge() {
  const source = fs.readFileSync(path.join(__dirname, "../TokenTrackerLinux/src-tauri/src/main.rs"), "utf8");
  const raw = source.slice(source.indexOf("fn ui_zoom_bridge(")).match(/r#"([\s\S]*?)"#/)[1];
  const script = raw.replaceAll("{{", "{").replaceAll("}}", "}")
    .replaceAll("{step}", "0.1").replaceAll("{min}", "0.5")
    .replaceAll("{max}", "3").replaceAll("{baseline}", "1");
  const listeners = {};
  const calls = [];
  vm.runInNewContext(script, { window: {
    addEventListener: (event, listener) => { listeners[event] = listener; },
    __TAURI_INTERNALS__: { invoke: (command, args) => new Promise((resolve, reject) => {
      assert.equal(command, "set_ui_zoom");
      calls.push({ value: args.value, resolve, reject });
    }) },
  } });
  return {
    calls,
    key: (key) => listeners.keydown({ ctrlKey: true, key, preventDefault() {} }),
    wheel: (deltaY) => listeners.wheel({ ctrlKey: true, deltaY, preventDefault() {} }),
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("Linux zoom accumulates rapid input and serializes host writes", async () => {
  const b = bridge();
  b.key("+");
  b.key("+");
  b.wheel(-120);
  assert.deepEqual(b.calls.map((call) => call.value), [1.1]);
  b.calls[0].resolve(1.1);
  await settle();
  assert.deepEqual(b.calls.map((call) => call.value), [1.1, 1.3]);
  b.calls[1].resolve(1.3);
  await settle();
  b.key("-");
  assert.equal(b.calls[2].value, 1.2);
  b.calls[2].resolve(1.2);
});

test("reset during an in-flight zoom wins over the older response", async () => {
  const b = bridge();
  b.key("+");
  b.key("+");
  b.key("0");
  b.calls[0].resolve(1.1);
  await settle();
  assert.deepEqual(b.calls.map((call) => call.value), [1.1, 1]);
  b.calls[1].resolve(1);
  await settle();
  b.key("+");
  assert.equal(b.calls[2].value, 1.1);
  b.calls[2].resolve(1.1);
});

test("a failed older write does not drop the latest zoom intent", async () => {
  const b = bridge();
  b.key("+");
  b.wheel(-120);
  b.calls[0].reject(new Error("host unavailable"));
  await settle();
  assert.deepEqual(b.calls.map((call) => call.value), [1.1, 1.2]);
  b.calls[1].resolve(1.2);
});

test("zero-delta wheel events do not zoom", () => {
  const b = bridge();
  b.wheel(0);
  assert.equal(b.calls.length, 0);
});
