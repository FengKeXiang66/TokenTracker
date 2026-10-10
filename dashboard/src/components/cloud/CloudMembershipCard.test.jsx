import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCopyLocale } from "../../lib/copy";
import { saveCloudPurchase } from "../../lib/cloud-checkout.js";
import { CloudMembershipCard } from "./CloudMembershipCard.jsx";

const mocks = vi.hoisted(() => ({
  account: null,
  request: vi.fn(),
  refresh: vi.fn(),
  getAccessToken: vi.fn(),
  external: vi.fn(),
  clearToken: vi.fn(),
  userId: "account-1",
}));
vi.mock("../../hooks/use-cloud-billing.js", () => ({
  useCloudAccount: () => ({
    account: mocks.account,
    auth: {
      signedIn: true,
      user: { id: mocks.userId },
      getAccessToken: mocks.getAccessToken,
    },
    refresh: mocks.refresh,
  }),
}));
vi.mock("../../lib/cloud-billing", async () => ({
  ...(await vi.importActual("../../lib/cloud-billing")),
  cloudBillingRequest: mocks.request,
}));
vi.mock("../../lib/cloud-checkout.js", async () => ({
  ...(await vi.importActual("../../lib/cloud-checkout.js")),
  openCloudExternal: mocks.external,
}));
vi.mock("../../lib/local-api-auth", () => ({
  getLocalApiAuthHeaders: async () => ({}),
}));
vi.mock("../../lib/cloud-sync-prefs", async () => ({
  ...(await vi.importActual("../../lib/cloud-sync-prefs")),
  clearCloudDeviceSession: mocks.clearToken,
}));
const orderId = "11111111-1111-4111-8111-111111111111";
const click = (target) =>
  act(async () => {
    await userEvent.click(target);
  });

beforeEach(() => {
  setCopyLocale("en");
  mocks.request.mockReset();
  mocks.refresh.mockReset();
  mocks.external.mockReset();
  mocks.clearToken.mockReset();
  mocks.userId = "account-1";
  localStorage.clear();
  mocks.account = {
    membership: {
      status: "active",
      expires_at: "2027-10-04",
      machine_limit: 5,
      can_read_cloud: true,
      can_upload_cloud: true,
    },
    subscriptions: [
      {
        provider: "waffo",
        provider_subscription_id: "sub_test",
        status: "active",
        cancel_at_period_end: false,
        next_billed_at: "2027-10-04",
      },
    ],
    payments: [],
    pending_orders: [{ id: orderId }],
    conflict_orders: [],
  };
  mocks.request.mockResolvedValue({
    machines: [
      {
        machine_id: "opaque-slot-1",
        name: "Work laptop",
        platform: "macOS",
        last_seen_at: null,
      },
    ],
    machine_limit: 5,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show() {
  return render(
    <MemoryRouter>
      <CloudMembershipCard />
    </MemoryRouter>,
  );
}

describe("Cloud membership management", () => {
  it("provides Cloud file export controls directly in the read-only account card", async () => {
    mocks.account.membership.can_upload_cloud = false;
    show();
    await screen.findByText("Work laptop");
    await click(screen.getByRole("button", { name: "Export Cloud usage" }));
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeInTheDocument();
    expect(screen.getByLabelText("From (UTC)")).toBeInTheDocument();
  });
  it.each([[], [{ id: "revoked-recent", state: "revoked", duration_days: 30 }]])(
    "honors current gift access even when recent history omits its active gift %j", async (gifts) => {
      mocks.account.membership.has_gift = true;
      mocks.account.gifts = gifts;
      mocks.account.subscriptions = [];
      mocks.account.pending_orders = [];
      show(); await screen.findByText("Work laptop");
      expect(screen.queryByRole("link", { name: "Renew Cloud" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View Cloud plans" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/dashboard");
    },
  );
  it.each([false, "true"])("does not treat has_gift %s as an authoritative gift", async (hasGift) => {
    mocks.account.membership.has_gift = hasGift;
    mocks.account.gifts = [];
    mocks.account.subscriptions = [];
    mocks.account.pending_orders = [];
    show(); await screen.findByText("Work laptop");
    expect(screen.getByRole("link", { name: "Renew Cloud" })).toHaveAttribute("href", "/cloud");
    expect(screen.queryByText("Gifted Cloud")).not.toBeInTheDocument();
  });
  it("keeps gifted Cloud separate from paid bills and never invents a renewal", async () => {
    mocks.account.gift_redemption_available = true;
    mocks.account.membership.access_source = "gift";
    mocks.account.subscriptions = [];
    mocks.account.pending_orders = [];
    mocks.account.gifts = [{ id: "gift-1", duration_days: 30, starts_at: "2026-10-09", ends_at: "2026-11-08", state: "active" }];
    show(); await screen.findByText("Work laptop");
    expect(screen.getByText("Gifted Cloud")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cloud gifts" })).toBeInTheDocument();
    expect(screen.getByText("30 days of Cloud")).toBeInTheDocument();
    expect(screen.queryByText(/Renews on|Auto-renewal is off|Auto-renewal is paused/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Renew Cloud" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redeem Cloud code" })).toBeEnabled();
    expect(screen.queryByText(/Waffo/)).not.toBeInTheDocument();
    expect(mocks.account.payments).toEqual([]);
  });
  it("keeps an upcoming gift and canceled recurring access distinct from the provider billing date", async () => {
    mocks.account.subscriptions[0].cancel_at_period_end = true;
    mocks.account.subscriptions[0].next_billed_at = "2027-11-04";
    mocks.account.membership.access_source = "payment";
    mocks.account.gifts = [{ id: "future-gift", duration_days: 90, starts_at: "2027-10-04", ends_at: "2028-01-02", state: "pending" }];
    show(); await screen.findByText("Work laptop");
    expect(screen.getByText("Cloud active")).toBeInTheDocument();
    expect(screen.getByText("Starts after current access")).toBeInTheDocument();
    expect(screen.getByText(/Available until/)).toHaveTextContent("Oct 4, 2027");
    expect(screen.getByText(/Auto-renewal is off/)).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
    expect(mocks.account.subscriptions[0].next_billed_at).toBe("2027-11-04");
  });
  it.each(["expired", "revoked"])("shows a %s gift without Cloud access or removing normal plan discovery", async (state) => {
    mocks.account.subscriptions = [];
    mocks.account.membership = { status: "free", access_source: "none", can_read_cloud: false, can_upload_cloud: false };
    mocks.account.gifts = [{ id: "old-gift", duration_days: 365, starts_at: "2024-10-09", ends_at: "2025-10-09", state }];
    show(); await screen.findByText("Work laptop");
    expect(screen.getByText(state === "expired" ? "Expired" : "Revoked")).toBeInTheDocument();
    expect(screen.queryByText("Gifted Cloud")).not.toBeInTheDocument();
    expect(screen.queryByText("Cloud active")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Cloud plans" })).toBeInTheDocument();
  });
  it("keeps self-hosted device management free without trial, prices or an official payment portal", async () => {
    mocks.account.membership = { status: "self_hosted", hosting_mode: "self_hosted", machine_limit: null,
      trial_available: false, can_read_cloud: true, can_upload_cloud: true };
    mocks.request.mockResolvedValue({ machines: [], machine_count: 3, machine_limit: null });
    show();
    await screen.findByText("3 registered sync devices");
    expect(screen.getByText("Self-hosted · free")).toBeInTheDocument();
    expect(screen.getByText(/operator manages server capacity, backups and history retention/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Cloud plans" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel auto-renewal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Resume order/ })).not.toBeInTheDocument();
  });
  it("shows payment conflicts with billing recovery and keeps the confirmed membership", async () => {
    mocks.account.subscriptions = [];
    mocks.account.pending_orders = [];
    mocks.account.conflict_orders = [{ id: orderId, status: "paid", retry_payment_conflict_at: "2026-10-07T15:00:00Z" }];
    mocks.account.payments = [{
      id: "waffo-paid", provider: "waffo", currency: "USD", amount_cents: 499, refunded_cents: 0,
      paid_at: "2026-10-04", starts_at: "2026-10-04", ends_at: "2026-11-04",
    }];
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByRole("alert")).toHaveTextContent(/duplicate charge/);
    expect(screen.getByText("Cloud active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View payment bills" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Review duplicate payment/ })).toHaveAttribute("href", `/billing/checkout?order=${orderId}`);
    expect(screen.queryByRole("link", { name: "Renew Cloud" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Resume order/ })).not.toBeInTheDocument();
  });
  it("deduplicates a legacy pending entry against a closed conflict record", async () => {
    mocks.account.pending_orders = [{ id: orderId, status: "ready" }];
    mocks.account.conflict_orders = [{ id: orderId, status: "closed", retry_payment_conflict_at: "2026-10-07T15:00:00Z" }];
    show();
    await screen.findByText("Work laptop");
    expect(screen.getAllByRole("link", { name: /Review duplicate payment/ })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Resume order/ })).not.toBeInTheDocument();
  });
  it("keeps the paid-access deadline distinct from the provider's next billing date", async () => {
    mocks.account.subscriptions[0].next_billed_at = "2027-11-04";
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByText(/Available until/)).toHaveTextContent("Oct 4, 2027");
    expect(screen.getByText(/Renews on/)).toHaveTextContent("Nov 4, 2027");
  });
  it("shows an ongoing provider renewal even after a full refund removes paid access", async () => {
    mocks.account.membership = {
      status: "expired", expires_at: null, can_read_cloud: false, can_upload_cloud: false,
    };
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByText("Cloud expired")).toBeInTheDocument();
    expect(screen.getByText(/Renews on/)).toHaveTextContent("Oct 4, 2027");
    expect(screen.queryByText(/Available until/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel auto-renewal" })).toBeEnabled();
    await click(screen.getByRole("button", { name: "Cancel auto-renewal" }));
    expect(screen.getByText(/current Cloud access stays as shown above/)).toBeInTheDocument();
    expect(screen.queryByText(/remains available until/)).not.toBeInTheDocument();
  });
  it.each([null, "invalid-date"])("does not guess a missing or invalid next billing date (%s) from membership expiry", async (date) => {
    mocks.account.subscriptions[0].next_billed_at = date;
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByText(/next billing date is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeEnabled();
    expect(screen.getByText(/Available until/)).toHaveTextContent("Oct 4, 2027");
  });
  it("shows paused renewal separately while keeping explicit subscription management and cancellation", async () => {
    mocks.account.subscriptions[0].status = "paused";
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByText(/Auto-renewal is paused/)).toBeInTheDocument();
    expect(screen.queryByText(/Auto-renewal is off/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeEnabled();
    await click(screen.getByRole("button", { name: "Cancel auto-renewal" }));
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
    expect(mocks.request.mock.calls.filter(([action])=>action === "cancel")).toHaveLength(0);
    await click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(mocks.request).toHaveBeenCalledWith("cancel", expect.objectContaining({ body: { subscription_id: "sub_test" } }));
  });
  it("discards device data returned for the previous account", async () => {
    let resolvePrevious;
    mocks.request.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePrevious = resolve; }),
    ).mockResolvedValue({
      machines: [{ machine_id: "new-device", name: "Second account device" }],
      machine_count: 1,
      machine_limit: 5,
    });
    const view = show();
    await act(async () => { await Promise.resolve(); });
    mocks.userId = "account-2";
    view.rerender(<MemoryRouter><CloudMembershipCard /></MemoryRouter>);
    await screen.findByText("Second account device");
    await act(async () => {
      resolvePrevious({
        machines: [{ machine_id: "private-old", name: "Private old laptop" }],
        machine_count: 1,
        machine_limit: 5,
      });
    });
    expect(screen.queryByText("Private old laptop")).not.toBeInTheDocument();
    expect(screen.getByText("Second account device")).toBeInTheDocument();
  });
  it.each(["remove-device", "resume-device"])(
    "does not clear the new account's local connection after a delayed %s",
    async (action) => {
      let resolveMutation;
      mocks.request.mockImplementation((name) => {
        if (name === action)
          return new Promise((resolve) => { resolveMutation = resolve; });
        return Promise.resolve({
          machines: [{
            machine_id: "current",
            name: mocks.userId === "account-1" ? "Old laptop" : "Second account device",
            status: action === "resume-device" ? "paused" : "active",
            is_current: true,
          }],
          machine_count: action === "resume-device" ? 0 : 1,
          machine_limit: 5,
        });
      });
      const view = show();
      await screen.findByText("Old laptop");
      if (action === "remove-device") {
        await click(screen.getByRole("button", { name: "Pause", exact: true }));
        await click(screen.getByRole("button", { name: "Pause Cloud sync" }));
      } else await click(screen.getByRole("button", { name: "Resume sync" }));
      mocks.userId = "account-2";
      view.rerender(<MemoryRouter><CloudMembershipCard /></MemoryRouter>);
      await screen.findByText("Second account device");
      await act(async () => { resolveMutation({ ok: true }); });
      expect(mocks.clearToken).not.toHaveBeenCalled();
      expect(screen.queryByText(/Cloud sync resumed/)).not.toBeInTheDocument();
      expect(screen.getByText("Second account device")).toBeInTheDocument();
    },
  );
  it("does not open a previous account's portal after an account switch", async () => {
    let resolvePortal;
    mocks.request.mockImplementation((action) => action === "portal"
      ? new Promise((resolve) => { resolvePortal = resolve; })
      : Promise.resolve({ machines: [], machine_count: 0, machine_limit: 5 }));
    const view = show();
    await click(screen.getByRole("button", { name: "Manage subscription" }));
    mocks.userId = "account-2";
    view.rerender(<MemoryRouter><CloudMembershipCard /></MemoryRouter>);
    await act(async () => { resolvePortal({ url: "https://pancake.waffo.ai/consumer/portal/login" }); });
    expect(mocks.external).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Manage subscription" })).toBeEnabled();
  });
  it("opens Waffo bills with an explicit purchase-email sign-in instruction", async () => {
    mocks.request.mockImplementation(async (action) => action === "portal"
      ? { url: "https://pancake.waffo.ai/consumer/portal/login" }
      : { machines: [], machine_count: 0, machine_limit: 5 });
    show();
    expect(screen.getByText(/sign in with the email used at checkout/)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(mocks.request).toHaveBeenCalledWith("portal", expect.objectContaining({ body: { subscription_id: "sub_test" } }));
    expect(mocks.external).toHaveBeenCalledWith("https://pancake.waffo.ai/consumer/portal/login");
  });
  it("keeps legacy billing channels distinct from Waffo history", async () => {
    mocks.account.payments = ["waffo", "paddle", "wechat", "alipay"].map((provider) => ({
      id: provider, provider, currency: "USD", amount_cents: 599,
      refunded_cents: 0, paid_at: "2026-10-04", starts_at: "2026-10-04", ends_at: "2026-11-04",
    }));
    show();
    await screen.findByText("Work laptop");
    for (const name of ["Waffo", "Paddle", "WeChat Pay", "Alipay"])
      expect(screen.getByText(name, { exact: true })).toBeInTheDocument();
  });
  it("offers Waffo bills for a fixed-term purchase without a subscription", async () => {
    mocks.account.subscriptions = [];
    mocks.account.payments = [{
      id: "waffo-fixed", provider: "waffo", currency: "USD", amount_cents: 499,
      refunded_cents: 0, paid_at: "2026-10-04", starts_at: "2026-10-04", ends_at: "2026-11-04",
    }];
    mocks.request.mockImplementation(async (action) => action === "portal"
      ? { url: "https://pancake.waffo.ai/consumer/portal/login" }
      : { machines: [], machine_count: 0, machine_limit: 5 });
    show();
    expect(screen.getByText(/sign in with the email used at checkout/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel auto-renewal" })).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: "View payment bills" }));
    expect(mocks.request).toHaveBeenCalledWith("portal", expect.objectContaining({ body: {} }));
    expect(mocks.external).toHaveBeenCalledWith("https://pancake.waffo.ai/consumer/portal/login");
    expect(screen.getByRole("link", { name: "Renew Cloud" })).toHaveAttribute("href", "/cloud");
  });
  it("keeps cancellation pending for explicit retry when the provider rejects it", async () => {
    mocks.request.mockImplementation(async (action) => {
      if (action === "cancel") throw { code: "billing_network_error" };
      return { machines: [], machine_count: 0, machine_limit: 5 };
    });
    show();
    await click(screen.getByRole("button", { name: "Cancel auto-renewal" }));
    await click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/connection was interrupted/);
    expect(screen.getByText(/Renews on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Auto-renewal is off/)).not.toBeInTheDocument();
  });
  it("discards a cancellation failure from the previous account", async () => {
    let rejectCancel;
    mocks.request.mockImplementation((action) => action === "cancel"
      ? new Promise((_resolve, reject) => { rejectCancel = reject; })
      : Promise.resolve({ machines: [], machine_count: 0, machine_limit: 5 }));
    const view = show();
    await click(screen.getByRole("button", { name: "Cancel auto-renewal" }));
    await click(screen.getByRole("button", { name: "Confirm cancellation" }));
    mocks.userId = "account-2";
    view.rerender(<MemoryRouter><CloudMembershipCard /></MemoryRouter>);
    await act(async () => { rejectCancel({ code: "billing_network_error" }); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm cancellation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel auto-renewal" })).toBeEnabled();
  });
  it("keeps device context and the current token when the server rejects resume", async () => {
    mocks.request.mockImplementation(async (action) => {
      if (action === "resume-device") throw { code: "cloud_machine_limit" };
      return {
        machines: [
          {
            machine_id: "paused",
            name: "Paused laptop",
            status: "paused",
            is_current: true,
          },
        ],
        machine_count: 0,
        machine_limit: 5,
      };
    });
    show();
    await screen.findByText("Paused laptop");
    await click(screen.getByRole("button", { name: "Resume sync" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "reached its Cloud sync device limit",
    );
    expect(screen.getByText("Paused laptop")).toBeInTheDocument();
    expect(mocks.clearToken).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cloud sync resumed/)).not.toBeInTheDocument();
  });
  it("resumes a paused device only after explicit action and replaces its current token", async () => {
    const paused = {
      machine_id: "opaque-slot-paused",
      name: "Paused laptop",
      is_current: true,
      status: "paused",
      last_seen_at: null,
    };
    const devices = {
      machines: [paused],
      machine_count: 0,
      machine_limit: 5,
      over_machine_limit: false,
    };
    mocks.request.mockImplementation(async (action) => {
      if (action === "resume-device") {
        paused.status = "active";
        devices.machine_count = 1;
        return {};
      }
      return devices;
    });
    show();
    await screen.findByText("Paused laptop");
    expect(screen.getByText("0 / 5 devices")).toBeInTheDocument();
    expect(
      mocks.request.mock.calls.filter(([action]) => action === "resume-device"),
    ).toHaveLength(0);
    await click(screen.getByRole("button", { name: "Resume sync" }));
    expect(mocks.request).toHaveBeenCalledWith(
      "resume-device",
      expect.objectContaining({ body: { machine_id: "opaque-slot-paused" } }),
    );
    expect(mocks.clearToken).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 / 5 devices")).toBeInTheDocument();
  });
  it("keeps resume disabled when all server-counted slots are occupied", async () => {
    mocks.request.mockResolvedValue({
      machines: [
        { machine_id: "paused", name: "Paused laptop", status: "paused" },
      ],
      machine_count: 5,
      machine_limit: 5,
    });
    show();
    await screen.findByText("Paused laptop");
    expect(screen.getByRole("button", { name: "Resume sync" })).toBeDisabled();
    expect(
      screen.getByText("Pause another device to free a sync slot."),
    ).toBeInTheDocument();
  });
  it("recovers the same request when a timeout happened before an order ID was returned", async () => {
    saveCloudPurchase("account-1", {
      sku: "cloud_cny_yearly",
      provider: "alipay",
      request_id: orderId,
    });
    show();
    await screen.findByText("Work laptop");
    expect(
      screen.getByRole("link", { name: "Resume previous purchase" }),
    ).toHaveAttribute("href", "/billing/checkout?sku=cloud_cny_yearly");
  });
  it("makes cancellation explicit and preserves the paid term", async () => {
    mocks.refresh.mockImplementation(async () => {
      mocks.account = {
        ...mocks.account,
        subscriptions: [{ ...mocks.account.subscriptions[0], cancel_at_period_end: true }],
      };
    });
    const view=show();
    await screen.findByText("Work laptop");
    expect(screen.getByText(/Renews on/)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Cancel auto-renewal" }));
    expect(screen.getByText(/remains available until/)).toHaveTextContent(
      "2027",
    );
    expect(
      mocks.request.mock.calls.filter(([action]) => action === "cancel"),
    ).toHaveLength(0);
    await click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(mocks.request).toHaveBeenCalledWith(
      "cancel",
      expect.objectContaining({ body: { subscription_id: "sub_test" } }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
    await act(async () => {
      view.rerender(<MemoryRouter><CloudMembershipCard /></MemoryRouter>);
    });
    expect(screen.getByText("Auto-renewal is off.")).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/)).not.toBeInTheDocument();
    expect(screen.getByText(/Available until/)).toHaveTextContent("2027");
  });
  it("clears an ambiguous cancellation error only after the server confirms renewal is off", async () => {
    mocks.request.mockImplementation(async (action) => {
      if (action === "cancel") throw { code: "billing_network_error" };
      return { machines: [], machine_count: 0, machine_limit: 5 };
    });
    const view=show();
    await click(screen.getByRole("button", { name: "Cancel auto-renewal" }));
    await click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    mocks.account = {
      ...mocks.account,
      subscriptions: [{ ...mocks.account.subscriptions[0], cancel_at_period_end: true }],
    };
    await act(async () => {
      view.rerender(<MemoryRouter><CloudMembershipCard /></MemoryRouter>);
    });
    expect(screen.getByText("Auto-renewal is off.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm cancellation" })).not.toBeInTheDocument();
  });
  it("shows unknown sync time honestly and pauses only the confirmed device slot", async () => {
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByText("Last sync time unavailable")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Pause", exact: true }));
    expect(
      screen.getByText(/Local data and existing Cloud history stay/),
    ).toBeInTheDocument();
    expect(
      mocks.request.mock.calls.filter(([action]) => action === "remove-device"),
    ).toHaveLength(0);
    await click(screen.getByRole("button", { name: "Pause Cloud sync" }));
    expect(mocks.request).toHaveBeenCalledWith(
      "remove-device",
      expect.objectContaining({ body: { machine_id: "opaque-slot-1" } }),
    );
  });
  it("discloses the server read-only deadline and provides pending-order recovery", async () => {
    mocks.account.membership = {
      status: "expired",
      read_only_until: "2026-11-03",
      machine_limit: 1,
      can_read_cloud: true,
      can_upload_cloud: false,
    };
    mocks.account.subscriptions = [];
    show();
    await screen.findByText("Work laptop");
    expect(screen.getByText(/Read and export its history until/)).toHaveTextContent(
      "Nov 3, 2026",
    );
    expect(screen.getByText(/Free daily community uploads and leaderboard participation continue/)).toHaveTextContent(/pause other active devices/);
    expect(
      screen.getByRole("link", { name: "Open dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: "Export Cloud usage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Resume order/ })).toHaveAttribute(
      "href",
      `/billing/checkout?order=${orderId}`,
    );
    await act(async () => {
      await userEvent.type(
        screen.getByRole("textbox", { name: "Order ID" }),
        "invalid",
      );
    });
    await click(screen.getByRole("button", { name: "Recover order" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "complete TokenTracker order ID",
    );
  });
});
