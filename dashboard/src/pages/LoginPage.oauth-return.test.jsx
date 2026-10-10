/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://www.tokentracker.cc"} */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage.jsx";

const state = vi.hoisted(() => ({
  bridge: null,
  auth: {
    enabled: true, loading: false, signedIn: false,
    refreshUser: vi.fn(async () => undefined),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    getPublicAuthConfig: vi.fn(async () => ({ data: { oAuthProviders: ["github"] } })),
  },
}));
vi.mock("../contexts/InsforgeAuthContext.jsx", () => ({ useInsforgeAuth: () => state.auth }));
vi.mock("../lib/native-bridge.js", () => ({ getNativeOAuthBridge: () => state.bridge }));
vi.mock("../hooks/useLocale.js", () => ({ useLocale: () => ({ resolvedLocale: "en" }) }));

beforeEach(() => {
  state.bridge = null;
  state.auth.signInWithOAuth.mockClear();
  sessionStorage.clear();
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

async function startOAuth(next) {
  const path = "/login?next=" + encodeURIComponent(next);
  window.history.replaceState(null, "", path);
  render(<MemoryRouter initialEntries={[path]}><LoginPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /GitHub/ }));
}

it.each([
  "/billing/checkout?intent=trial",
  "/billing/checkout?sku=cloud_usd_monthly",
  "/billing/checkout?order=123e4567-e89b-12d3-a456-426614174000",
  "/cloud",
])("uses a fixed allowed OAuth callback and retains %s in the same session", async next => {
  await startOAuth(next);
  expect(state.auth.signInWithOAuth).toHaveBeenCalledWith("github", "https://www.tokentracker.cc/dashboard");
  expect(sessionStorage.getItem("tt.cloud.return")).toBe(next);
});

it("keeps desktop OAuth on the existing native callback", async () => {
  state.bridge = { postMessage: vi.fn() };
  await startOAuth("/billing/checkout?intent=trial");
  expect(state.auth.signInWithOAuth).toHaveBeenCalledWith("github", "https://www.tokentracker.cc/auth/callback");
});

it("does not turn a foreign return destination into an OAuth redirect", async () => {
  await startOAuth("//foreign.example/checkout");
  expect(state.auth.signInWithOAuth).toHaveBeenCalledWith("github", "https://www.tokentracker.cc/");
  expect(sessionStorage.getItem("tt.cloud.return")).toBeNull();
});
