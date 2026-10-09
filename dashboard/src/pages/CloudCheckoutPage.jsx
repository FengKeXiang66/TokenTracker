import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BillingNotice,
  CloudFeatures,
  CloudPaymentConflictNotice,
  SelfHostedCloudState,
  cloudProviderLabel,
  formatCloudDate,
  formatCloudDateTime,
} from "../components/cloud/CloudBillingParts.jsx";
import {
  useCloudAccount,
  useCloudCatalog,
} from "../hooks/use-cloud-billing.js";
import {
  cloudBillingRequest,
  cloudCheckoutLaunched,
  formatCloudMoney,
} from "../lib/cloud-billing";
import {
  clearCloudPurchase,
  CLOUD_ORDER_ID_PATTERN,
  cloudOrderState,
  getCloudCheckoutRestartRequest,
  getCloudPurchaseRequest,
  openCloudExternal,
  readCloudPurchase,
  saveCloudPurchase,
} from "../lib/cloud-checkout.js";
import { copy } from "../lib/copy";
import { detectOS } from "../lib/os";
import { isNativeEmbed, isNativeWindowsApp, isNativeLinuxApp } from "../lib/native-bridge.js";
import { Button } from "../ui/components/Button.jsx";
import { Card } from "../ui/components/Card.jsx";

export function CloudCheckoutPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    // Ignore legacy checkout hints. Only the owned server order controls payment.
    if (!params.has("_ptxn")) return;
    const next = new URLSearchParams(params);
    next.delete("_ptxn");
    setParams(next, { replace: true });
  }, [params, setParams]);
  const {
    catalog,
    loading: catalogLoading,
    error: catalogError,
    refresh: refreshCatalog,
  } = useCloudCatalog();
  const { account, auth, refresh: refreshAccount } = useCloudAccount();
  const orderId = params.get("order") || "";
  const trialIntent = params.get("intent") === "trial";
  const requestedSku = params.get("sku");
  const [orderResult, setOrderResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(Boolean(orderId));
  const [error, setError] = useState(null);
  const [trialMembership, setTrialMembership] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [restartingCheckout, setRestartingCheckout] = useState(false);
  const mutationLock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const userId = auth?.signedIn ? auth.user?.id : null;
  const orderScope = useRef(orderId);
  orderScope.current = orderId;
  const accountScope = useRef(userId);
  accountScope.current = userId;
  const currentOrderResult =
    orderResult?.ownerId === userId ? orderResult : null;
  const currentTrial =
    trialMembership?.ownerId === userId ? trialMembership : null;
  const currentActionError =
    actionError?.ownerId === userId && actionError?.orderId === orderId
      ? actionError.error : null;
  const displayError = error || currentActionError;
  const order = currentOrderResult?.order;
  const membership =
    currentTrial || currentOrderResult?.membership || account?.membership;
  const selfHostedInstance = catalog?.policy?.hosting_mode === "self_hosted" || membership?.status === "self_hosted";
  const sku = order?.sku || requestedSku;
  const price = catalog?.prices?.find((item) => item.sku === sku);
  const currency = order?.currency || price?.currency;
  const amount = order?.amount_cents ?? price?.amount_cents;
  const billingMode = order?.billing_mode || price?.billing_mode;
  const termMonths = order?.term_months || price?.term_months;
  const selectedProvider = order?.provider || "waffo";
  const state = currentTrial
    ? "trial_success"
    : busy && !order
      ? "creating"
      : cloudOrderState(order, membership);
  const launched = cloudCheckoutLaunched(catalog);
  const providerAvailable = Boolean(catalog?.providers?.[selectedProvider]);
  const paymentConflict = Boolean(order?.retry_payment_conflict_at ||
    [...(account?.conflict_orders || []), ...(account?.pending_orders || [])]
      .some((item) => item.retry_payment_conflict_at));
  const hasGiftAccess = membership?.has_gift === true || account?.membership?.has_gift === true ||
    account?.gifts?.some((gift) => ["active", "pending"].includes(gift.state));
  const canRestartCheckout = order?.provider === "waffo" &&
    order.payment_state === "unpaid" &&
    order.status !== "paid" &&
    ["awaiting", "expired", "canceled"].includes(state) && launched && providerAvailable && !paymentConflict && !hasGiftAccess;
  const requestAuth = auth?.getAccessToken;
  const recent = readCloudPurchase(userId);
  const signInUrl = `/login?next=${encodeURIComponent(`/billing/checkout?${params}`)}`;
  const desktopReturnUrl = catalog?.environment === "live" && !trialIntent &&
    params.getAll("order").length === 1 && CLOUD_ORDER_ID_PATTERN.test(orderId) &&
    ["mac", "windows"].includes(detectOS()) &&
    !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) &&
    !isNativeEmbed() && !isNativeWindowsApp() && !isNativeLinuxApp()
      ? `tokentracker://billing/return?order=${orderId.toLowerCase()}` : null;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshOrder = useCallback(async () => {
    if (selfHostedInstance) return null;
    if (!orderId || !userId || accountScope.current !== userId) return null;
    if (!CLOUD_ORDER_ID_PATTERN.test(orderId)) {
      setError({ code: "order_not_found" });
      setLoadingOrder(false);
      return null;
    }
    const id = ++generation.current;
    try {
      const value = await cloudBillingRequest("order", {
        auth: requestAuth,
        params: { id: orderId },
      });
      if (id !== generation.current || accountScope.current !== userId)
        return null;
      setOrderResult({ ...value, ownerId: userId });
      setError(null);
      if (cloudOrderState(value.order, value.membership) === "success")
        setActionError(null);
      if (
        ["success", "expired", "canceled", "refunded"].includes(
          cloudOrderState(value.order, value.membership),
        )
      ) {
        const purchase = readCloudPurchase(userId);
        const recovering = value.order.payment_state === "unpaid" && value.order.status !== "paid" &&
          ["expired", "canceled"].includes(cloudOrderState(value.order, value.membership)) &&
          purchase?.retry_order_id === orderId && purchase?.retry_request_id;
        if (purchase?.order_id === orderId && !recovering)
          clearCloudPurchase(userId);
      }
      return value;
    } catch (reason) {
      if (id === generation.current) setError(reason);
      return null;
    } finally {
      if (id === generation.current) setLoadingOrder(false);
    }
  }, [orderId, userId, requestAuth, selfHostedInstance]);

  useEffect(() => {
    setOrderResult(null);
    setError(null);
    setLoadingOrder(Boolean(orderId && userId));
    void refreshOrder();
    return () => {
      generation.current += 1;
    };
  }, [refreshOrder, orderId, userId]);
  useEffect(() => {
    if (
      selfHostedInstance || !orderId ||
      !userId ||
      ["success", "canceled", "expired", "refunded"].includes(state)
    )
      return;
    const onReturn = () => {
      if (document.visibilityState === "visible") void refreshOrder();
    };
    const timer = window.setInterval(onReturn, 5000);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [orderId, userId, state, refreshOrder, selfHostedInstance]);
  const perform = async (operation) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    setActionError(null);
    try {
      await operation();
    } catch (reason) {
      if (mounted.current && accountScope.current === userId)
        setActionError({ ownerId: userId, orderId, error: reason });
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };

  const createOrder = () =>
    perform(async () => {
      const purchase = getCloudPurchaseRequest(userId, sku, selectedProvider);
      const value = await cloudBillingRequest("checkout", {
        auth: requestAuth,
        body: {
          sku,
          provider: selectedProvider,
          request_id: purchase.request_id,
          mobile: window.matchMedia("(max-width: 640px)").matches,
        },
      });
      saveCloudPurchase(userId, { ...purchase, order_id: value.order.id });
      if (!mounted.current || accountScope.current !== userId) return;
      setOrderResult({
        ...value,
        ownerId: userId,
        order: { ...price, provider: selectedProvider, ...value.order },
      });
      setParams({ order: value.order.id }, { replace: true });
    });

  const startTrial = () =>
    perform(async () => {
      const value = await cloudBillingRequest("trial", {
        auth: requestAuth,
        body: {},
      });
      if (!mounted.current || accountScope.current !== userId) return;
      setTrialMembership({ ...value.membership, ownerId: userId });
      void refreshAccount();
    });

  const reconcile = () =>
    perform(async () => {
      await cloudBillingRequest("reconcile", {
        auth: requestAuth,
        body: { id: orderId },
      });
      if (!mounted.current || accountScope.current !== userId) return;
      await refreshOrder();
      await refreshAccount();
    });

  const restartCheckout = () =>
    perform(async () => {
      const purchase = getCloudCheckoutRestartRequest(userId, order);
      setRestartingCheckout(true);
      try {
        const value = await cloudBillingRequest("restart-checkout", {
          auth: requestAuth,
          body: { id: order.id, request_id: purchase.retry_request_id },
        });
        saveCloudPurchase(userId, {
          sku: order.sku,
          provider: order.provider,
          request_id: purchase.retry_request_id,
          order_id: value.order.id,
        });
        if (!mounted.current || accountScope.current !== userId || orderScope.current !== order.id) return;
        setOrderResult({ ...value, ownerId: userId });
        setParams({ order: value.order.id }, { replace: true });
      } finally {
        if (mounted.current) setRestartingCheckout(false);
      }
    });

  const openPayment = () =>
    perform(async () => {
      await openCloudExternal(order.checkout_url);
    });

  const trialDays = catalog?.limits?.trial_days || 7;
  const trialEnd = new Date(Date.now() + trialDays * 86400000).toISOString();
  const preparingText = trialIntent
    ? copy("cloud.checkout.starting_trial")
    : copy("cloud.checkout.creating");
  const headings = {
    review: trialIntent
      ? copy("cloud.checkout.trial_title")
      : copy("cloud.checkout.title"),
    creating: preparingText,
    awaiting: copy("cloud.checkout.awaiting"),
    activating: copy("cloud.checkout.activating"),
    success: copy("cloud.checkout.success"),
    canceled: copy("cloud.checkout.canceled"),
    expired: order?.status === "paid"
      ? copy("cloud.checkout.term_ended")
      : copy("cloud.checkout.expired"),
    refunded: copy("cloud.checkout.refunded"),
    trial_success: copy("cloud.checkout.trial_success"),
  };

  let contentNode = null;
  if (!userId) {
    contentNode = (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
          {copy("cloud.checkout.sign_in")}
        </p>
        <Button
          as={Link}
          to={signInUrl}
          className="w-full no-underline"
          disabled={auth?.loading}
        >
          {copy("cloud.action.sign_in_continue")}
        </Button>
      </div>
    );
  } else if (loadingOrder || (busy && !order)) {
    contentNode = (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Loader2 className="motion-safe:animate-spin" size={17} aria-hidden />
        {loadingOrder
          ? copy("cloud.checkout.loading")
          : preparingText}
      </p>
    );
  } else if (state === "trial_success" || state === "success") {
    contentNode = (
      <div className="space-y-5">
        <CheckCircle2 size={32} className="text-oai-gray-700 dark:text-oai-gray-200" aria-hidden />
        <p className="text-sm leading-6">
          {state === "trial_success"
            ? copy("cloud.trial.ends", {
                date: formatCloudDate(membership.trial_ends_at),
              })
            : copy("cloud.membership.expires", {
                date: formatCloudDate(membership.expires_at),
              })}
        </p>
        <Button as={Link} to="/dashboard" className="w-full no-underline">
          {copy("cloud.action.open_dashboard")}
        </Button>
        <Button
          as={Link}
          to="/settings?section=account"
          variant="secondary"
          className="w-full no-underline"
        >
          {copy("cloud.action.manage_membership")}
        </Button>
      </div>
    );
  } else if (state === "review" && !orderId && hasGiftAccess) {
    contentNode = (
      <div className="space-y-5">
        <BillingNotice>{copy("cloud.gift.error_active")}</BillingNotice>
        <Button as={Link} to="/settings?section=account" variant="secondary" className="w-full no-underline">
          {copy("cloud.action.manage_membership")}
        </Button>
      </div>
    );
  } else if (state === "review" && !orderId && trialIntent) {
    contentNode = (
      <div className="space-y-5">
        <p className="text-sm leading-6">
          {copy("cloud.trial.disclosure", {
            days: trialDays,
            date: formatCloudDate(trialEnd),
          })}
        </p>
        <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
          {copy("cloud.trial.expiry")}
        </p>
        {account?.membership && !account.membership.trial_available ? (
          <BillingNotice>{copy("cloud.error.trial")}</BillingNotice>
        ) : null}
        <Button
          onClick={startTrial}
          disabled={busy || !launched || !account?.membership?.trial_available}
          className="w-full"
        >
          {copy("cloud.action.start_trial", { days: trialDays })}
        </Button>
      </div>
    );
  } else if (state === "review" && !orderId && price) {
    contentNode = (
      <div className="space-y-5">
        <p className="text-sm leading-6">{copy("cloud.checkout.review")}</p>
        <p className="inline-flex items-center gap-2 text-sm">
          <ShieldCheck size={16} aria-hidden />
          {copy("cloud.checkout.waffo")}
        </p>
        {billingMode ? (
          <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
            {billingMode === "fixed"
              ? copy("cloud.checkout.methods_fixed")
              : copy("cloud.checkout.methods_recurring")}
          </p>
        ) : null}
        {billingMode ? (
          <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
            {billingMode === "fixed"
              ? copy("cloud.renewal.manual")
              : copy("cloud.renewal.auto")}
          </p>
        ) : null}
        {recent?.order_id ? (
          <Button
            as={Link}
            to={`/billing/checkout?order=${encodeURIComponent(recent.order_id)}`}
            variant="secondary"
            className="w-full no-underline"
          >
            {copy("cloud.action.resume_order")}
          </Button>
        ) : null}
        {recent?.request_id && !recent.order_id && recent.sku !== sku ? (
          <Button
            as={Link}
            to={`/billing/checkout?sku=${encodeURIComponent(recent.sku)}`}
            variant="secondary"
            className="w-full no-underline"
          >
            {copy("cloud.action.resume_purchase")}
          </Button>
        ) : null}
        <Button
          onClick={createOrder}
          disabled={
            busy || !launched || !providerAvailable || !billingMode || Boolean(recent?.order_id) || paymentConflict
          }
          className="w-full"
        >
          {copy("cloud.action.create_checkout", {
            amount: formatCloudMoney(amount, currency),
          })}
        </Button>
      </div>
    );
  } else if (order) {
    const descriptions = {
      creating: copy("cloud.checkout.pending_creation"),
      awaiting: copy("cloud.checkout.pending_payment"),
      activating: copy("cloud.checkout.received"),
      expired: order?.status === "paid"
        ? copy("cloud.checkout.term_ended_detail")
        : copy("cloud.checkout.expired_detail"),
      canceled: copy("cloud.checkout.canceled_detail"),
      refunded: copy("cloud.checkout.refunded_detail"),
    };
    contentNode = (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
          {descriptions[state]}
        </p>
        {state === "awaiting" && order.checkout_url && launched && providerAvailable && !paymentConflict ? (
          <Button
            onClick={openPayment}
            disabled={busy}
            className="w-full"
          >
            {copy("cloud.action.open_payment")}
            <ExternalLink size={15} className="ml-2" aria-hidden />
          </Button>
        ) : null}
        {state !== "refunded" ? (
          <>
            <Button
              onClick={reconcile}
              disabled={busy}
              variant="secondary"
              className="w-full"
            >
              {busy
                ? copy("cloud.action.checking")
                : copy("cloud.action.check_payment")}
            </Button>
            <p className="text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.checkout.recovery_hint")}
            </p>
          </>
        ) : null}
        {canRestartCheckout ? (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.checkout.restart_detail")}
            </p>
            <Button
              onClick={restartCheckout}
              disabled={busy}
              variant="secondary"
              className="w-full"
            >
              {restartingCheckout
                ? copy("cloud.action.restarting_checkout")
                : copy("cloud.action.restart_checkout")}
            </Button>
          </div>
        ) : null}
        {["canceled", "expired"].includes(state) && !paymentConflict ? (
          <Button as={Link} to="/cloud" className="w-full no-underline">
            {order.status === "paid" ? copy("cloud.action.renew") : copy("cloud.action.choose_plan")}
          </Button>
        ) : null}
        {state === "refunded" ? (
          <Button as={Link} to="/settings?section=account" className="w-full no-underline">
            {copy("cloud.action.manage_membership")}
          </Button>
        ) : null}
        <div className="border-t border-oai-gray-200 pt-4 dark:border-oai-gray-800">
          <p className="mb-2 text-xs text-oai-gray-500 dark:text-oai-gray-400">
            {cloudProviderLabel(order.provider)}
          </p>
          <p className="text-xs text-oai-gray-500 dark:text-oai-gray-400">
            {copy("cloud.checkout.order_id")}
          </p>
          <p className="mt-1 break-all font-mono text-xs select-all">
            {order.id}
          </p>
          {order.status !== "paid" && order.expires_at ? (
            <p className="mt-2 text-xs text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.checkout.expires", {
                date: formatCloudDateTime(order.expires_at),
              })}
            </p>
          ) : null}
        </div>
      </div>
    );
  } else {
    contentNode = (
      <BillingNotice>
        {orderId
          ? copy("cloud.error.order_not_found")
          : copy("cloud.checkout.choose_plan")}
      </BillingNotice>
    );
  }

  if (selfHostedInstance) {
    return <SelfHostedCloudState />;
  }

  return (
    <div className="tt-cloud-theme flex flex-1 flex-col font-oai text-oai-black dark:text-oai-white">
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/cloud"
          className="mb-7 inline-flex min-h-10 items-center gap-2 text-sm text-oai-gray-500 dark:text-oai-gray-400 hover:text-oai-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oai-brand"
        >
          <ArrowLeft size={16} aria-hidden />
          {copy("cloud.checkout.back")}
        </Link>
        <h1
          className="text-3xl font-semibold tracking-tight"
          aria-live="polite"
        >
          {loadingOrder ? copy("cloud.checkout.loading") : headings[state]}
        </h1>
        <p className="mt-3 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
          {copy("cloud.checkout.local_free")}
        </p>
        {catalog?.environment === "sandbox" && !trialIntent ? (
          <p className="mt-2 text-xs text-oai-gray-500 dark:text-oai-gray-400">
            {copy("cloud.price.draft")}
          </p>
        ) : null}

        {paymentConflict ? <div className="mt-5"><CloudPaymentConflictNotice /></div> : null}

        <div className="mt-7 grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
          <Card bodyClassName="sm:p-7">
            {contentNode}
            {desktopReturnUrl ? (
              <div className="mt-5 space-y-3 border-t border-oai-gray-200 pt-5 dark:border-oai-gray-800">
                <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
                  {copy("cloud.checkout.return_app_hint")}
                </p>
                <Button as="a" href={desktopReturnUrl} variant="secondary" className="w-full no-underline">
                  {copy("cloud.action.open_app")}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">
              {copy("cloud.checkout.summary")}
            </h2>
            {!trialIntent ? (
              <div className="mt-4 border-b border-oai-gray-200 pb-4 dark:border-oai-gray-800">
                <p className="text-2xl font-semibold tabular-nums">
                  {amount != null && currency
                    ? formatCloudMoney(amount, currency)
                    : copy(catalogLoading ? "cloud.catalog.loading" : "cloud.price.pending")}
                </p>
                {termMonths ? (
                  <p className="mt-1 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
                    {termMonths === 12
                      ? copy("cloud.price.per_year")
                      : copy("cloud.price.per_month")}
                  </p>
                ) : null}
                {billingMode && currency ? (
                  <p className="mt-2 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
                    {currency === "USD"
                      ? copy("cloud.checkout.tax")
                      : copy("cloud.renewal.manual")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-oai-gray-500 dark:text-oai-gray-400">
                {copy("cloud.trial.no_card")}
              </p>
            )}
            <div className="mt-5">
              <CloudFeatures limits={catalog?.limits} />
            </div>
          </Card>
        </div>
        <div className="mt-5 space-y-3">
          {displayError ? (
            <BillingNotice
              error={displayError}
              onRetry={orderId ? (error ? refreshOrder : reconcile) : undefined}
            />
          ) : null}
          {displayError &&
          [
            "subscription_already_exists",
            "fixed_term_still_active",
            "checkout_request_conflict",
            "pending_checkout_exists",
            "gift_membership_active",
          ].includes(displayError.code || displayError.message) ? (
            <Button
              as={Link}
              to="/settings?section=account"
              variant="secondary"
              className="no-underline"
            >
              {copy("cloud.action.manage_membership")}
            </Button>
          ) : null}
          {displayError &&
          [
            "authentication_required",
            "invalid_token",
            "invalid_authentication",
          ].includes(displayError.code || displayError.message) ? (
            <Button
              onClick={async () => {
                await auth?.signOut?.();
                navigate(signInUrl);
              }}
              variant="secondary"
            >
              {copy("cloud.action.sign_in_continue")}
            </Button>
          ) : null}
          {catalogError ? (
            <BillingNotice error={catalogError} onRetry={refreshCatalog} />
          ) : null}
          {!catalogError && catalogLoading ? (
            <BillingNotice>{copy("cloud.catalog.loading")}</BillingNotice>
          ) : null}
          {!catalogError && !catalogLoading && !launched ? (
            <BillingNotice>{copy("cloud.catalog.preview")}</BillingNotice>
          ) : null}
          {!catalogError &&
          !catalogLoading &&
          launched &&
          !trialIntent &&
          !displayError &&
          !providerAvailable &&
          ["review", "creating", "awaiting"].includes(state) ? (
            <BillingNotice>
              {copy("cloud.catalog.provider_unavailable")}
            </BillingNotice>
          ) : null}
          {!catalogError &&
          !catalogLoading &&
          launched &&
          catalog?.environment === "sandbox" ? (
            <BillingNotice>{copy("cloud.catalog.sandbox")}</BillingNotice>
          ) : null}
        </div>
      </main>
    </div>
  );
}
