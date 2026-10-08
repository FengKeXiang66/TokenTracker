import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudAccount } from "./use-cloud-billing.js";

const mocks = vi.hoisted(() => ({
  auth: { signedIn: true, user: { id: "account-1" }, getAccessToken: vi.fn() },
  request: vi.fn(),
}));
vi.mock("../contexts/InsforgeAuthContext.jsx", () => ({
  useInsforgeAuth: () => mocks.auth,
}));
vi.mock("../lib/cloud-billing", () => ({ cloudBillingRequest: mocks.request }));

beforeEach(() => {
  mocks.auth.signedIn = true;
  mocks.auth.user = { id: "account-1" };
  mocks.request.mockReset();
});
afterEach(cleanup);

describe("Cloud account refresh", () => {
  it("rejects a delayed response from the previous account", async () => {
    let resolvePrevious;
    mocks.request
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePrevious = resolve;
          }),
      )
      .mockResolvedValue({ membership: { status: "trial" } });
    const view = renderHook(() => useCloudAccount());
    mocks.auth.user = { id: "account-2" };
    view.rerender();
    await waitFor(() =>
      expect(view.result.current.account?.membership.status).toBe("trial"),
    );
    await act(async () => {
      resolvePrevious({
        membership: { status: "active" },
        payments: [{ id: "private-payment" }],
      });
    });
    expect(view.result.current.account?.membership.status).toBe("trial");
    expect(view.result.current.account?.payments).toBeUndefined();
  });
  it("clears membership immediately when signed out and rechecks the server when the app regains focus", async () => {
    mocks.request.mockResolvedValue({ membership: { status: "active" } });
    const view = renderHook(() => useCloudAccount());
    await waitFor(() =>
      expect(view.result.current.account?.membership.status).toBe("active"),
    );
    const previousCalls = mocks.request.mock.calls.length;
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(mocks.request.mock.calls.length).toBe(previousCalls + 1);
    mocks.auth.signedIn = false;
    mocks.auth.user = null;
    view.rerender();
    expect(view.result.current.account).toBeNull();
  });
});
