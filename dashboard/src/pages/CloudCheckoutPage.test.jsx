import React from "react";
import { webcrypto } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCopyLocale } from "../lib/copy";
import { CloudCheckoutPage } from "./CloudCheckoutPage.jsx";
import { CloudPage } from "./CloudPage.jsx";
import { readCloudPurchase, saveCloudPurchase } from "../lib/cloud-checkout.js";

const NumberFormat = Intl.NumberFormat;

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  signedIn: true,
  userId: "account-1",
  phase: "active",
  environment: "sandbox",
  providers: { waffo: true, alipay: false, wechat: false, paddle: false },
  getAccessToken: vi.fn(),
  external: vi.fn(),
  pendingOrders: [],
  conflictOrders: [],
  hostingMode: "hosted",
  accountMembership: undefined,
  accountLoading: false,
  actualCatalog: false,
  accountError: null,
  subscriptions: [],
}));
const orderId = "11111111-1111-4111-8111-111111111111";
const successorId = "22222222-2222-4222-8222-222222222222";
const membership = { status: "free", trial_available: true };
const prices = [
  {
    sku: "cloud_usd_monthly_fixed",
    billing_mode: "fixed",
    currency: "USD",
    amount_cents: 499,
    term_months: 1,
  },
  {
    sku: "cloud_usd_yearly_fixed",
    billing_mode: "fixed",
    currency: "USD",
    amount_cents: 3999,
    term_months: 12,
  },
  {
    sku: "cloud_usd_monthly",
    billing_mode: "recurring",
    currency: "USD",
    amount_cents: 499,
    term_months: 1,
  },
  {
    sku: "cloud_usd_yearly",
    billing_mode: "recurring",
    currency: "USD",
    amount_cents: 3999,
    term_months: 12,
  },
];
vi.mock("../hooks/use-cloud-billing.js", async () => {
  const actual = await vi.importActual("../hooks/use-cloud-billing.js");
  return {
    useCloudCatalog: () => mocks.actualCatalog ? actual.useCloudCatalog() : ({
      catalog: {
        environment: mocks.environment,
        policy: { phase: mocks.phase, launch_at: "2000-01-01", hosting_mode: mocks.hostingMode },
        prices,
        providers: mocks.providers,
        limits: {
          machines: 5,
          sync_minutes: 15,
          hourly_history_days: 90,
          daily_history_months: 24,
          trial_days: 7,
        },
      },
      loading: false,
    }),
    useCloudAccount: () => ({
      account: { membership: mocks.hostingMode === "self_hosted"
        ? { ...membership, status: "self_hosted", hosting_mode: "self_hosted", trial_available: false, can_read_cloud: true, can_upload_cloud: true }
        : mocks.accountMembership === undefined ? membership : mocks.accountMembership,
        pending_orders: mocks.pendingOrders, conflict_orders: mocks.conflictOrders, subscriptions: mocks.subscriptions },
      loading: mocks.accountLoading,
      error: mocks.accountError,
      auth: {
        signedIn: mocks.signedIn,
        user: mocks.signedIn ? { id: mocks.userId } : null,
        getAccessToken: mocks.getAccessToken,
      },
      refresh: mocks.refresh,
    }),
  };
});
vi.mock("../lib/cloud-billing", async () => ({
  ...(await vi.importActual("../lib/cloud-billing")),
  cloudBillingRequest: mocks.request,
}));
vi.mock("../lib/cloud-checkout.js", async () => ({
  ...(await vi.importActual("../lib/cloud-checkout.js")),
  openCloudExternal: mocks.external,
}));

const click = (target) =>
  act(async () => {
    await userEvent.click(target);
  });

function Location() {
  return (
    <output data-testid="location">
      {useLocation().pathname + useLocation().search}
    </output>
  );
}
function show(path, Page = CloudCheckoutPage) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Page />
      <Location />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setCopyLocale("en");
  // English copy assertions must not inherit the Windows host's currency locale.
  vi.spyOn(Intl, "NumberFormat").mockImplementation(
    (locale, options) => new NumberFormat(locale ?? "en-US", options),
  );
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  mocks.request.mockReset();
  mocks.external.mockReset();
  mocks.pendingOrders = [];
  mocks.conflictOrders = [];
  mocks.hostingMode = "hosted";
  mocks.accountMembership = undefined;
  mocks.accountLoading = false;
  mocks.actualCatalog = false;
  mocks.accountError = null;
  mocks.subscriptions = [];
  mocks.userId = "account-1";
  mocks.signedIn = true;
  mocks.phase = "active";
  mocks.environment = "sandbox";
  mocks.providers = { waffo: true, alipay: false, wechat: false, paddle: false };
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 0 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Cloud pricing and checkout", () => {
  it("lets a signed-out desktop browser return an order reference without claiming payment or calling the order API", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Macintosh");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    mocks.environment = "live";
    mocks.signedIn = false;
    show(`/billing/checkout?order=${orderId.toUpperCase()}`);
    expect(screen.getByRole("link", { name: "Open in TokenTracker" })).toHaveAttribute("href",
      `tokentracker://billing/return?order=${orderId}`);
    expect(screen.queryByRole("heading", { name: "Your Pro access is ready" })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("keeps the app return available on a Windows touch desktop", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0");
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(5);
    mocks.environment = "live";
    mocks.signedIn = false;
    show(`/billing/checkout?order=${orderId}`);
    expect(screen.getByRole("link", { name: "Open in TokenTracker" })).toHaveAttribute("href",
      `tokentracker://billing/return?order=${orderId}`);
  });
  it.each(["sandbox", "native", "mobile", "tablet", "invalid", "trial", "duplicate"])("does not offer an ordinary app return for %s context", (context) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(context === "mobile" ? "iPhone" : "Macintosh");
    vi.spyOn(navigator, "platform", "get").mockReturnValue(context === "mobile" ? "iPhone" : "MacIntel");
    if (context === "tablet") vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(5);
    mocks.environment = context === "sandbox" ? "sandbox" : "live";
    mocks.signedIn = false;
    if (context === "native") vi.stubGlobal("webkit", { messageHandlers: { nativeBridge: {} } });
    show(`/billing/checkout?order=${context === "invalid" ? "not-a-uuid" : orderId}${context === "trial" ? "&intent=trial" : context === "duplicate" ? `&order=${orderId}` : ""}`);
    expect(screen.queryByRole("link", { name: "Open in TokenTracker" })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([CloudPage, CloudCheckoutPage])("shows a free private-instance state instead of official pricing or checkout", (Page) => {
    mocks.hostingMode = "self_hosted";
    show(Page === CloudPage ? "/cloud" : `/billing/checkout?order=${orderId}`, Page);
    expect(screen.getByRole("heading", { name: "Your free self-hosted instance" })).toBeInTheDocument();
    expect(screen.getByText(/operator manages server capacity, backups and history retention/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe to Pro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create secure payment order/ })).not.toBeInTheDocument();
    expect(screen.queryByText("$39.99")).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["ready", "expired", "closed", "paid"])("blocks further checkout on a %s payment conflict without hiding paid status", async (status) => {
    mocks.request.mockResolvedValue({
      order: { ...prices[3], id: orderId, provider: "waffo", status,
        payment_state: status === "paid" ? "paid" : "unpaid",
        checkout_url: "https://pancake.waffo.ai/checkout?session=owned",
        retry_payment_conflict_at: "2026-10-07T15:00:00Z" },
      membership: status === "paid" ? { status: "active", expires_at: "2027-10-04" } : membership,
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(/both the original and replacement orders/);
    expect(screen.getByRole("link", { name: "View payment bills" })).toHaveAttribute("href", "/settings?section=account");
    expect(screen.queryByRole("button", { name: "Close checkout and try again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open secure checkout" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Choose a plan" })).not.toBeInTheDocument();
    if (status === "paid") expect(screen.getByRole("heading", { name: "Your Pro membership is active" })).toBeInTheDocument();
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it.each([CloudPage, CloudCheckoutPage])("blocks a new purchase when the account has a conflicting payment", (Page) => {
    mocks.pendingOrders = [{ id: orderId, retry_payment_conflict_at: "2026-10-07T15:00:00Z" }];
    show(Page === CloudPage ? "/cloud" : "/billing/checkout?sku=cloud_usd_yearly", Page);
    expect(screen.getByRole("alert")).toHaveTextContent(/contact support/);
    expect(screen.getByRole("button", { name: Page === CloudPage ? "Subscribe to Pro" : /Create secure payment order/ })).toBeDisabled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["paid", "closed"])("blocks new purchases from a %s conflict order even with no pending orders", (status) => {
    mocks.conflictOrders = [{ id: orderId, status, retry_payment_conflict_at: "2026-10-07T15:00:00Z" }];
    show("/cloud", CloudPage);
    expect(screen.getByRole("button", { name: "Subscribe to Pro" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/duplicate charge/);
    cleanup();
    show("/billing/checkout?sku=cloud_usd_yearly");
    expect(screen.getByRole("button", { name: /Create secure payment order/ })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/contact support/);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["ready", "expired", "closed"])("offers an explicit restart for an unpaid Waffo %s checkout", async (status) => {
    const oldOrder = { ...prices[3], id: orderId, provider: "waffo", status,
      payment_state: "unpaid", checkout_url: "https://pancake.waffo.ai/checkout?session=old" };
    const successor = { ...oldOrder, id: successorId, status: "ready",
      checkout_url: "https://pancake.waffo.ai/checkout?session=new" };
    mocks.request.mockImplementation(async (action, options) => {
      if (action === "restart-checkout") return { order: successor, membership };
      return { order: options.params.id === successorId ? successor : oldOrder, membership };
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("button", { name: "Close checkout and try again" });
    expect(mocks.request.mock.calls.filter(([action]) => action === "restart-checkout")).toHaveLength(0);
    expect(screen.getByText(/a payment in progress cannot restart/)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Close checkout and try again" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`order=${successorId}`));
    const purchase = readCloudPurchase("account-1");
    expect(purchase.order_id).toBe(successorId);
    expect(purchase.retry_request_id).toBeUndefined();
    expect(mocks.request).toHaveBeenCalledWith("restart-checkout", expect.objectContaining({ body: {
      id: orderId, request_id: purchase.request_id,
    } }));
    expect(mocks.external).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Your Pro membership is active" })).not.toBeInTheDocument();
  });
  it("reuses a persisted restart identity after a timeout and a terminal-order reload", async () => {
    const oldOrder = { ...prices[3], id: orderId, provider: "waffo", status: "expired", payment_state: "unpaid" };
    const successor = { ...oldOrder, id: successorId, status: "ready",
      checkout_url: "https://pancake.waffo.ai/checkout?session=new" };
    mocks.request.mockImplementation(async (action, options) => {
      if (action === "restart-checkout") throw { code: "billing_network_error" };
      return { order: options.params.id === successorId ? successor : oldOrder, membership };
    });
    const firstView = show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("button", { name: "Close checkout and try again" });
    await click(screen.getByRole("button", { name: "Close checkout and try again" }));
    await screen.findByRole("alert");
    const firstRequest = readCloudPurchase("account-1").retry_request_id;
    firstView.unmount();
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("button", { name: "Close checkout and try again" });
    expect(readCloudPurchase("account-1").retry_request_id).toBe(firstRequest);
    mocks.request.mockImplementation(async (action, options) => action === "restart-checkout"
      ? { order: successor, membership }
      : { order: options.params.id === successorId ? successor : oldOrder, membership });
    await click(screen.getByRole("button", { name: "Close checkout and try again" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`order=${successorId}`));
    const attempts = mocks.request.mock.calls.filter(([action]) => action === "restart-checkout");
    expect(attempts).toHaveLength(2);
    expect(attempts.every(([, options]) => options.body.request_id === firstRequest)).toBe(true);
  });
  it.each(["checkout_confirmation_pending", "waffo_notification_pending"])("preserves the old order when %s prevents restart", async (code) => {
    const order = { ...prices[3], id: orderId, provider: "waffo", status: "ready", payment_state: "unpaid",
      checkout_url: "https://pancake.waffo.ai/checkout?session=old" };
    mocks.request.mockImplementation(async (action) => {
      if (action === "restart-checkout") throw { code, status: 409 };
      return { order, membership };
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("button", { name: "Close checkout and try again" });
    await click(screen.getByRole("button", { name: "Close checkout and try again" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot restart yet/);
    expect(screen.getByTestId("location")).toHaveTextContent(`order=${orderId}`);
    expect(readCloudPurchase("account-1").retry_order_id).toBe(orderId);
    expect(mocks.request.mock.calls.filter(([action]) => action === "checkout")).toHaveLength(0);
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it("checks the original paid order when the server refuses a stale unpaid restart", async () => {
    let paid = false;
    const order = { ...prices[3], id: orderId, provider: "waffo", status: "ready", payment_state: "unpaid",
      checkout_url: "https://pancake.waffo.ai/checkout?session=old" };
    mocks.request.mockImplementation(async (action) => {
      if (action === "restart-checkout") {
        paid = true;
        throw { code: "checkout_already_paid", status: 409 };
      }
      return paid
        ? { order: { ...order, status: "paid", payment_state: "paid" }, membership: { status: "active", expires_at: "2027-10-04" } }
        : { order, membership };
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("button", { name: "Close checkout and try again" });
    await click(screen.getByRole("button", { name: "Close checkout and try again" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/server has recorded payment/);
    expect(screen.getByTestId("location")).toHaveTextContent(`order=${orderId}`);
    await act(async () => { fireEvent.focus(window); });
    await screen.findByRole("heading", { name: "Your Pro membership is active" });
    expect(screen.queryByRole("button", { name: "Close checkout and try again" })).not.toBeInTheDocument();
    expect(readCloudPurchase("account-1")).toBeNull();
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it.each([
    ["waffo", "paid", "paid"],
    ["waffo", "paid", "refunded"],
    ["waffo", "ready", "partially_refunded"],
    ["waffo", "ready", undefined],
    ["paddle", "ready", "unpaid"],
  ])("does not restart %s %s with payment state %s", async (provider, status, payment_state) => {
    mocks.request.mockResolvedValue({ order: { ...prices[3], id: orderId, provider, status, payment_state,
      checkout_url: "https://pancake.waffo.ai/checkout?session=owned" }, membership });
    show(`/billing/checkout?order=${orderId}`);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Close checkout and try again" })).not.toBeInTheDocument();
    expect(mocks.request.mock.calls.filter(([action]) => action === "restart-checkout")).toHaveLength(0);
  });
  it("keeps a completed restart response in its original account after switching accounts", async () => {
    let finishRestart;
    const order = { ...prices[3], id: orderId, provider: "waffo", status: "ready", payment_state: "unpaid",
      checkout_url: "https://pancake.waffo.ai/checkout?session=old" };
    mocks.request.mockImplementation((action) => action === "restart-checkout"
      ? new Promise((resolve) => { finishRestart = resolve; })
      : Promise.resolve({ order, membership }));
    const view = show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("button", { name: "Close checkout and try again" });
    await click(screen.getByRole("button", { name: "Close checkout and try again" }));
    mocks.userId = "account-2";
    mocks.request.mockRejectedValue({ code: "order_not_found" });
    view.rerender(<MemoryRouter initialEntries={[`/billing/checkout?order=${orderId}`]}><CloudCheckoutPage /><Location /></MemoryRouter>);
    await screen.findByRole("alert");
    await act(async () => { finishRestart({ order: { ...order, id: successorId }, membership }); });
    expect(screen.getByTestId("location")).toHaveTextContent(`order=${orderId}`);
    expect(readCloudPurchase("account-2")).toBeNull();
    expect(readCloudPurchase("account-1").order_id).toBe(successorId);
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it.each([
    ["cloud_usd_monthly_fixed", "Pay with WeChat", /Fixed term, manual renewal/],
    ["cloud_usd_monthly", "Credit card", /Waffo subscription/],
  ])("discloses the Waffo payment and renewal method for %s", (sku, method, renewal) => {
    show(`/billing/checkout?sku=${sku}`);
    expect(screen.getByText("Secure checkout by Waffo")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(method))).toHaveTextContent(/new tab/);
    expect(screen.getAllByText(renewal).length).toBeGreaterThan(0);
    expect(screen.queryByText("Alipay")).not.toBeInTheDocument();
    expect(screen.queryByText("Secure checkout by Paddle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create secure payment order/ })).toBeEnabled();
  });
  it("waits for the catalog before describing a selected recurring plan's renewal terms", async () => {
    mocks.actualCatalog = true;
    let resolveCatalog;
    mocks.request.mockReturnValue(new Promise((resolve) => { resolveCatalog = resolve; }));
    show("/billing/checkout?sku=cloud_usd_monthly");
    expect(mocks.request).toHaveBeenCalledWith("catalog", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getAllByText("Loading Pro availability…").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No automatic debit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Renews automatically/)).not.toBeInTheDocument();
    expect(screen.queryByText("/month")).not.toBeInTheDocument();
    await act(async () => {
      resolveCatalog({ environment: "sandbox", policy: { phase: "active", launch_at: "2000-01-01" }, prices,
        providers: { waffo: true }, limits: { machines: 5, sync_minutes: 15, hourly_history_days: 90, daily_history_months: 24, trial_days: 7 } });
    });
    expect(screen.getByText(/Waffo subscription. Renews automatically until canceled/)).toBeInTheDocument();
    expect(screen.queryByText(/No automatic debit/)).not.toBeInTheDocument();
    expect(screen.getByText("$4.99")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create secure payment order · $4.99" })).toBeEnabled();
  });
  it("offers the free self-host path alongside concrete hosted benefits", () => {
    show("/cloud", CloudPage);
    expect(screen.getByText("Cross-device analysis")).toBeInTheDocument();
    expect(screen.getByText("Hosted history and exports")).toBeInTheDocument();
    expect(screen.getByText("Managed synchronization")).toBeInTheDocument();
    expect(screen.getByText(/Combine up to 5 sync devices/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read deployment guidance" })).toHaveAttribute("href", "/self-host");
    expect(screen.getByText(/software is free; you manage hosting/)).toHaveTextContent(/technical preview/);
  });
  it("keeps legacy orders separate from the new Waffo provider", async () => {
    mocks.request.mockResolvedValue({
      order: { ...prices[3], id: orderId, provider: "paddle", status: "ready", checkout_url: `https://www.tokentracker.cc/billing/checkout?order=${orderId}&_ptxn=txn_verified` }, membership,
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("heading", { name: "Waiting for payment" });
    expect(screen.queryByRole("button", { name: "Open secure checkout" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've paid · Check status" })).toBeEnabled();
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it("does not keep activating or polling a refunded payment when another membership is active", async () => {
    vi.useFakeTimers();
    mocks.request.mockResolvedValue({
      order: { ...prices[1], id: orderId, provider: "waffo", status: "paid", payment_state: "refunded", expires_at: "2027-10-04" },
      membership: { status: "active", expires_at: "2027-10-04" },
    });
    show(`/billing/checkout?order=${orderId}`);
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "This payment has been refunded" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage membership" })).toHaveAttribute("href", "/settings?section=account");
    expect(screen.queryByRole("button", { name: "I've paid · Check status" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Checkout expires/)).not.toBeInTheDocument();
    const requests=mocks.request.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(mocks.request.mock.calls.length).toBe(requests);
    expect(screen.queryByRole("heading", { name: "Your Pro membership is active" })).not.toBeInTheDocument();
  });
  it("keeps an expired paid period distinct from an unpaid expired checkout", async () => {
    saveCloudPurchase("account-1", { order_id: orderId, retry_order_id: orderId, retry_request_id: successorId });
    mocks.request.mockResolvedValue({
      order: { ...prices[1], id: orderId, provider: "waffo", status: "paid", payment_state: "paid" },
      membership: { status: "expired", read_only_until: "2026-11-03" },
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("heading", { name: "This membership period has ended" });
    expect(screen.getByText(/payment remains in your account history/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew Pro" })).toHaveAttribute("href", "/cloud");
    expect(screen.queryByRole("button", { name: "Close checkout and try again" })).not.toBeInTheDocument();
    expect(readCloudPurchase("account-1")).toBeNull();
  });
  it("shows a newly rejected sign-in before an earlier checkout error", async () => {
    mocks.request.mockImplementation(async (action) => {
      if (action === "reconcile") throw { code: "payment_provider_not_configured" };
      return { order: { ...prices[1], id: orderId, provider: "waffo", status: "pending" }, membership };
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("heading", { name: "Preparing your payment order" });
    await click(screen.getByRole("button", { name: "I've paid · Check status" }));
    await screen.findByRole("alert");
    mocks.request.mockRejectedValue({ code: "invalid_token", status: 401 });
    await act(async () => { fireEvent.focus(window); });
    expect(screen.getByRole("alert")).toHaveTextContent(/sign-in needs refreshing/);
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeEnabled();
  });
  it("routes an unresolved earlier checkout to account recovery instead of suggesting another purchase", async () => {
    mocks.request.mockRejectedValue({ code: "pending_checkout_exists", status: 409 });
    show("/billing/checkout?sku=cloud_usd_yearly");
    await click(screen.getByRole("button", { name: "Create secure payment order · $39.99" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/previous purchase is still unresolved/);
    expect(screen.getByRole("link", { name: "Manage membership" })).toHaveAttribute("href", "/settings?section=account");
  });
  it("keeps a failed reconciliation visible across passive reads and retries the same order", async () => {
    const order = { ...prices[1], id: orderId, provider: "waffo", status: "pending" };
    mocks.request.mockImplementation(async (action) => {
      if (action === "reconcile") throw { code: "payment_provider_not_configured" };
      return { order, membership };
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("heading", { name: "Preparing your payment order" });
    await click(screen.getByRole("button", { name: "I've paid · Check status" }));
    await screen.findByRole("alert");
    await act(async () => { fireEvent.focus(window); });
    expect(screen.getByRole("alert")).toHaveTextContent("This payment method is not available right now.");
    await click(screen.getByRole("button", { name: "Retry", exact: true }));
    const reconciles=mocks.request.mock.calls.filter(([action])=>action === "reconcile");
    expect(reconciles).toHaveLength(2);
    expect(reconciles.every(([,options])=>options.body.id === orderId)).toBe(true);
    expect(screen.queryByRole("heading", { name: "Your Pro membership is active" })).not.toBeInTheDocument();
  });
  it.each([1, 3])(
    "hands billing option %s to the owned Waffo checkout without granting membership",
    async (priceIndex) => {
      const url = "https://pancake.waffo.ai/checkout?session=verified";
      mocks.request.mockResolvedValue({
        order: { ...prices[priceIndex], id: orderId, provider: "waffo", status: "ready", checkout_url: url },
        membership,
      });
      show(`/billing/checkout?order=${orderId}`);
      await screen.findByRole("heading", { name: "Waiting for payment" });
      await click(screen.getByRole("button", { name: "Open secure checkout" }));
      expect(mocks.external).toHaveBeenCalledWith(url);
      expect(screen.getByRole("heading", { name: "Waiting for payment" })).toBeInTheDocument();
    },
  );
  it.each(["preview", "provider_disabled"])(
    "keeps an existing checkout closed when %s, while preserving payment recovery",
    async (condition) => {
      const order = {
        ...prices[1],
        id: orderId,
        provider: "waffo",
        status: "ready",
        checkout_url: "https://pancake.waffo.ai/checkout?session=verified",
      };
      if (condition === "preview") mocks.phase = "preview";
      else mocks.providers.waffo = false;
      mocks.request.mockResolvedValue({ order, membership });
      show(`/billing/checkout?order=${orderId}`);
      await screen.findByRole("heading", { name: "Waiting for payment" });
      expect(
        screen.queryByRole("button", { name: "Open secure checkout" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "I've paid · Check status" }),
      ).toBeEnabled();
    },
  );
  it("uses one global base price and selects the SKU by payment terms", async () => {
    show("/cloud", CloudPage);
    expect(screen.getByText("$39.99")).toBeInTheDocument();
    expect(screen.getByText(/\$39.99 billed yearly/)).toHaveTextContent("$3.33/month");
    expect(screen.getByText(/USD prices exclude tax/)).toBeInTheDocument();
    expect(screen.getByText(/Test pricing draft/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mainland China/ })).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Fixed term", exact: true }));
    expect(screen.getByText("$39.99")).toBeInTheDocument();
    expect(screen.getByText(/Fixed term, manual renewal/)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Subscribe to Pro" }));
    expect(screen.getByTestId("location")).toHaveTextContent("sku=cloud_usd_yearly_fixed");
    await click(screen.getByRole("button", { name: "Monthly", exact: true }));
    expect(screen.getByText("$4.99")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Subscribe to Pro" }));
    expect(screen.getByTestId("location")).toHaveTextContent("sku=cloud_usd_monthly_fixed");
    await click(screen.getByRole("button", { name: "Auto-renewal", exact: true }));
    expect(screen.getByText("$4.99")).toBeInTheDocument();
    expect(screen.getByText(/Waffo subscription/)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Subscribe to Pro" }));
    expect(screen.getByTestId("location")).toHaveTextContent("sku=cloud_usd_monthly");
    expect(screen.getByText("Complete local features, forever.")).toBeInTheDocument();
  });
  it("replaces a used trial with a primary purchase action without implying another no-card trial", async () => {
    mocks.accountMembership = { status: "expired", trial_available: false };
    show("/cloud", CloudPage);
    expect(screen.queryByRole("button", { name: /Try Pro free/ })).not.toBeInTheDocument();
    expect(screen.queryByText("No card required. No automatic charge.")).not.toBeInTheDocument();
    expect(screen.getByText(/cannot start another free trial/)).toBeInTheDocument();
    const subscribe = screen.getByRole("button", { name: "Subscribe to Pro" });
    expect(subscribe).toBeEnabled();
    expect(subscribe).toHaveClass("bg-oai-black");
    await click(subscribe);
    expect(screen.getByTestId("location")).toHaveTextContent("sku=cloud_usd_yearly");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([true, false])("preserves the primary no-card trial for an eligible or signed-out user, signedIn=%s", async (signedIn) => {
    mocks.signedIn = signedIn;
    show("/cloud", CloudPage);
    const trial = screen.getByRole("button", { name: "Try Pro free for 7 days" });
    expect(trial).toBeEnabled();
    expect(trial).toHaveClass("bg-oai-black");
    expect(screen.getByText("No card required. No automatic charge.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe to Pro" })).not.toHaveClass("bg-oai-black");
    await click(trial);
    expect(screen.getByTestId("location")).toHaveTextContent("intent=trial");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["active", "past_due"])("offers management instead of a new purchase while an expired account has an open %s renewal contract", (status) => {
    mocks.accountMembership = { status: "expired", trial_available: false };
    mocks.subscriptions = [{ status, cancel_at_period_end: false }];
    show("/cloud", CloudPage);
    expect(screen.getByRole("link", { name: "Manage membership" })).toHaveAttribute("href", "/settings?section=account");
    expect(screen.queryByRole("button", { name: "Subscribe to Pro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try Pro free/ })).not.toBeInTheDocument();
    expect(screen.queryByText("No card required. No automatic charge.")).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["loading", "error", "unknown"])("does not imply a trial is available while the account is %s", (state) => {
    mocks.accountMembership = null;
    mocks.accountLoading = state === "loading";
    mocks.accountError = state === "error" ? { code: "billing_network_error" } : null;
    show("/cloud", CloudPage);
    expect(screen.getByRole("button", { name: /Try Pro free/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subscribe to Pro" })).toBeDisabled();
    expect(screen.queryByText("No card required. No automatic charge.")).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not create a new order for a retired regional SKU", () => {
    show("/billing/checkout?sku=cloud_cny_yearly");
    expect(screen.queryByRole("button", { name: /Create secure payment order/ })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("disables payment and trial until launch and disables unconfigured providers", async () => {
    mocks.phase = "preview";
    show("/cloud", CloudPage);
    expect(
      screen.getByRole("button", { name: "Subscribe to Pro" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Try Pro free/ }),
    ).toBeDisabled();
    cleanup();
    mocks.phase = "active";
    mocks.providers.waffo = false;
    show("/billing/checkout?sku=cloud_usd_yearly");
    expect(
      screen.getByRole("button", { name: "Create secure payment order · $39.99" }),
    ).toBeDisabled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves the selected purchase in the sign-in next path without creating an order", () => {
    mocks.signedIn = false;
    show("/billing/checkout?sku=cloud_usd_yearly_fixed");
    expect(
      screen.getByRole("link", { name: "Sign in to continue" }),
    ).toHaveAttribute(
      "href",
      "/login?next=%2Fbilling%2Fcheckout%3Fsku%3Dcloud_usd_yearly_fixed",
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("discloses trial end and read-only period before an explicit trial activation", async () => {
    mocks.request.mockResolvedValue({
      membership: { status: "trial", trial_ends_at: "2026-10-11" },
    });
    show("/billing/checkout?intent=trial");
    expect(screen.getByText(/30 days to view and export/)).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
    await click(screen.getByRole("button", { name: "Start 7-day free trial" }));
    expect(mocks.request).toHaveBeenCalledWith(
      "trial",
      expect.objectContaining({ body: {} }),
    );
    await screen.findByRole("heading", {
      name: "Your Pro trial has started",
    });
  });
  it.each([
    ["en", "Start 7-day free trial", "Starting your Pro trial", "Preparing your payment order"],
    ["zh", "开始 7 天免费试用", "正在开通 Pro 试用", "正在准备支付订单"],
    ["zh-TW", "開始 7 天免費試用", "正在開通 Pro 試用", "正在準備付款訂單"],
  ])("describes a pending %s trial activation without presenting a payment order", async (locale, action, waiting, payment) => {
    setCopyLocale(locale);
    let resolveTrial;
    mocks.request.mockReturnValue(new Promise((resolve) => { resolveTrial = resolve; }));
    show("/billing/checkout?intent=trial");
    await click(screen.getByRole("button", { name: action }));
    expect(mocks.request).toHaveBeenCalledWith("trial", expect.objectContaining({ body: {} }));
    expect(screen.getByRole("heading", { name: waiting })).toBeInTheDocument();
    const status = screen.getAllByRole("status").find((node) => node.textContent === waiting);
    expect(status).toHaveTextContent(waiting);
    expect(status).not.toHaveTextContent(/payment|支付|付款/i);
    expect(screen.queryByText(payment)).not.toBeInTheDocument();
    await act(async () => { resolveTrial({ membership: { status: "trial", trial_ends_at: "2026-10-11" } }); });
    expect(screen.queryByText(waiting)).not.toBeInTheDocument();
  });
  it("reuses the same purchase request after a timeout and keeps the server pending order", async () => {
    const order = {
      ...prices[1],
      id: orderId,
      provider: "waffo",
      status: "pending",
    };
    mocks.request.mockImplementation(async (action) => {
      if (action === "order") return { order, membership };
      if (
        action === "checkout" &&
        mocks.request.mock.calls.filter(([name]) => name === "checkout")
          .length === 1
      )
        throw { code: "billing_network_error" };
      return { order, pending: true, error: "checkout_confirmation_pending" };
    });
    show("/billing/checkout?sku=cloud_usd_yearly_fixed");
    const button = screen.getByRole("button", { name: /Create secure payment order/ });
    await click(button);
    await screen.findByText(/connection was interrupted/);
    const firstRequest = readCloudPurchase("account-1").request_id;
    await click(screen.getByRole("button", { name: /Create secure payment order/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        `order=${orderId}`,
      ),
    );
    const checkouts = mocks.request.mock.calls.filter(
      ([action]) => action === "checkout",
    );
    expect(checkouts).toHaveLength(2);
    expect(checkouts[1][1].body.request_id).toBe(firstRequest);
    expect(checkouts.every(([,options]) => options.body.provider === "waffo")).toBe(true);
    expect(screen.getByText(/order is saved/)).toBeInTheDocument();
  });
  it("does not grant membership from a forged payment redirect or a browser return", async () => {
    const url = "https://pancake.waffo.ai/checkout?session=verified";
    const order = {
      ...prices[3], id: orderId, provider: "waffo", status: "ready", checkout_url: url,
    };
    mocks.request.mockResolvedValue({ order, membership });
    show(`/billing/checkout?order=${orderId}&_ptxn=txn_forged&success=1&status=paid`);
    await screen.findByRole("heading", { name: "Waiting for payment" });
    await click(screen.getByRole("button", { name: "Open secure checkout" }));
    expect(mocks.external).toHaveBeenCalledWith(url);
    await act(async () => { fireEvent.focus(window); });
    expect(screen.getByRole("heading", { name: "Waiting for payment" })).toBeInTheDocument();
    expect(screen.queryByText("Your Pro membership is active")).not.toBeInTheDocument();
    mocks.request.mockResolvedValue({
      order: { ...order, status: "paid" },
      membership: { status: "active", expires_at: "2027-10-04" },
    });
    await act(async () => { fireEvent.focus(window); });
    await screen.findByRole("heading", { name: "Your Pro membership is active" });
  });
  it("offers server reconciliation even for an expired checkout", async () => {
    mocks.request.mockResolvedValue({
      order: {
        ...prices[1],
        id: orderId,
        provider: "waffo",
        status: "ready",
        expires_at: "2000-01-01",
      },
      membership,
    });
    show(`/billing/checkout?order=${orderId}`);
    await screen.findByRole("heading", { name: "This order has expired" });
    await click(
      screen.getByRole("button", { name: "I've paid · Check status" }),
    );
    expect(mocks.request).toHaveBeenCalledWith(
      "reconcile",
      expect.objectContaining({ body: { id: orderId } }),
    );
  });
});
