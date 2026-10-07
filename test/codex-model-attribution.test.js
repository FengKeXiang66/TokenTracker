"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyCodexModelEvent,
  createCodexModelAttributionState,
  currentCodexModel,
  extractModelReroute,
} = require("../src/lib/codex-model-attribution");

test("Codex model attribution promotes an official model/rerouted notification to the effective model", () => {
  const state = createCodexModelAttributionState();
  applyCodexModelEvent(state, {
    type: "turn_context",
    payload: { turn_id: "turn-1", model: "gpt-5.6-sol" },
  });
  const notification = {
    method: "model/rerouted",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      fromModel: "gpt-5.6-sol",
      toModel: "gpt-5.6-terra",
      reason: "capacity",
    },
  };
  assert.deepEqual(extractModelReroute(notification), {
    threadId: "thread-1",
    turnId: "turn-1",
    fromModel: "gpt-5.6-sol",
    toModel: "gpt-5.6-terra",
    reason: "capacity",
  });
  applyCodexModelEvent(state, notification);
  assert.equal(state.selectedModel, "gpt-5.6-sol");
  assert.equal(currentCodexModel(state), "gpt-5.6-terra");
  assert.equal(state.rerouted, true);
  applyCodexModelEvent(state, { type: "turn_context", payload: { turn_id: "turn-2" } });
  assert.equal(currentCodexModel(state), "gpt-5.6-sol");
  assert.equal(state.rerouted, false);
});

test("Codex model attribution accepts persisted snake-case event envelopes", () => {
  const state = createCodexModelAttributionState({ model: "gpt-5.6-sol" });
  applyCodexModelEvent(state, {
    type: "event_msg",
    payload: {
      type: "model_rerouted",
      from_model: "gpt-5.6-sol",
      to_model: "gpt-5.6-luna",
      reason: "user_limit",
    },
  });
  assert.equal(currentCodexModel(state), "gpt-5.6-luna");
  assert.equal(state.rerouteReason, "user_limit");
});

test("Codex model attribution falls back to session_meta only when nothing stronger named a model", () => {
  // Defensive path, not an observed one: no Codex build has written a model
  // into session_meta - 0 of 10310 session_meta rows across 5849 local
  // rollouts carry the field, which is why this fixture has to be synthetic.
  // It pins the precedence rule, not the format.
  const state = createCodexModelAttributionState();
  applyCodexModelEvent(state, { type: "session_meta", payload: { id: "s-1", model_provider: "openai" } });
  assert.equal(currentCodexModel(state), null, "model_provider is provenance, never a model");

  assert.deepEqual(
    applyCodexModelEvent(state, { type: "session_meta", payload: { id: "s-1", model: "gpt-5.6-sol" } }),
    { type: "session_meta", selectedModel: "gpt-5.6-sol" },
  );
  assert.equal(currentCodexModel(state), "gpt-5.6-sol");

  // turn_context marks where a turn actually begins, so it always wins.
  applyCodexModelEvent(state, { type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-5.6-terra" } });
  assert.equal(currentCodexModel(state), "gpt-5.6-terra");

  // A forked rollout replays the parent's session_meta rows after its own;
  // that must not drag attribution back to the parent's model.
  assert.equal(
    applyCodexModelEvent(state, { type: "session_meta", payload: { id: "parent", model: "gpt-5.6-sol" } }),
    null,
  );
  assert.equal(currentCodexModel(state), "gpt-5.6-terra");
});
