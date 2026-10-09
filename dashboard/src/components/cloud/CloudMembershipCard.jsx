import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Monitor, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useCloudAccount } from "../../hooks/use-cloud-billing.js";
import { cloudBillingRequest, formatCloudMoney } from "../../lib/cloud-billing";
import {
  CLOUD_ORDER_ID_PATTERN,
  openCloudExternal,
  readCloudPurchase,
} from "../../lib/cloud-checkout.js";
import {
  clearCloudDeviceSession,
  isLocalDashboardHost,
} from "../../lib/cloud-sync-prefs";
import { getLocalApiAuthHeaders } from "../../lib/local-api-auth";
import { copy } from "../../lib/copy";
import { CloudDeadlinePrompt } from "./CloudContextualPrompt.jsx";
import { RedeemProCode } from "./RedeemProCode.jsx";
import { Button } from "../../ui/components/Button.jsx";
import { Card } from "../../ui/components/Card.jsx";
import {
  BillingNotice,
  CloudPaymentConflictNotice,
  cloudMembershipLabel,
  cloudProviderLabel,
  formatCloudDate,
} from "./CloudBillingParts.jsx";

function CloudMachineList({ auth, machineLimit, accountRevision, selfHosted = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const actionLock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const userId = auth?.user?.id;
  const getAccessToken = auth?.getAccessToken;
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      let currentMachineId;
      if (isLocalDashboardHost()) {
        try {
          const headers = await getLocalApiAuthHeaders();
          const response = await fetch("/functions/tokentracker-machine-id", {
            headers,
          });
          if (response.ok)
            currentMachineId = (await response.json())?.machineId;
        } catch {
          /* Cloud list remains available without local identity. */
        }
      }
      const value = await cloudBillingRequest("devices", {
        auth: getAccessToken,
        params: currentMachineId
          ? { current_machine_id: currentMachineId }
          : {},
      });
      if (id === generation.current) {
        setData(value);
        setError(null);
      }
    } catch (reason) {
      if (id === generation.current)
        setError({ ...reason, code: "billing_devices_unavailable" });
    }
  }, [getAccessToken, userId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [refresh, accountRevision]);
  const remove = async (machineId) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cloudBillingRequest("remove-device", {
        auth: getAccessToken,
        body: { machine_id: machineId },
      });
      if (!mounted.current) return;
      if (
        data?.machines?.find((machine) => machine.machine_id === machineId)
          ?.is_current
      )
        clearCloudDeviceSession();
      setPending(null);
      await refresh();
    } catch (reason) {
      if (mounted.current) setError(reason);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const resume = async (machine) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cloudBillingRequest("resume-device", {
        auth: getAccessToken,
        body: { machine_id: machine.machine_id },
      });
      if (!mounted.current) return;
      if (machine.is_current) clearCloudDeviceSession();
      setNotice(copy("cloud.devices.resumed"));
      await refresh();
    } catch (reason) {
      if (mounted.current) setError(reason);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const machines = data?.machines || [];
  const activeCount =
    data?.machine_count ??
    machines.filter((machine) => {
      return machine.status !== "paused";
    }).length;
  const limit = data?.machine_limit ?? machineLimit;
  const hasFreeSlot = limit == null || activeCount < limit;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{copy("cloud.devices.title")}</h3>
        <span className="text-xs text-oai-gray-500 dark:text-oai-gray-400 tabular-nums">
          {data
            ? limit == null
              ? copy(selfHosted ? "cloud.devices.unlimited_self_hosted" : "cloud.devices.unlimited", { count: activeCount })
              : copy("cloud.devices.count", { count: activeCount, limit })
            : error
              ? copy("cloud.devices.count_unknown")
              : copy("cloud.catalog.loading")}
        </span>
      </div>
      <p className="mb-4 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
        {copy("cloud.devices.detail")}
      </p>
      {data?.over_machine_limit || (limit != null && limit < activeCount) ? (
        <div className="mb-4">
          <BillingNotice>{copy("cloud.devices.over_limit")}</BillingNotice>
        </div>
      ) : null}
      {error ? <BillingNotice error={error} onRetry={refresh} context="account" /> : null}
      {notice ? (
        <div className="mb-3">
          <BillingNotice>{notice}</BillingNotice>
        </div>
      ) : null}
      {!error && data && machines.length === 0 ? (
        <p className="text-sm text-oai-gray-500 dark:text-oai-gray-400">
          {copy("cloud.devices.empty")}
        </p>
      ) : null}
      {machines.length !== 0 ? (
        <ul className="divide-y divide-oai-gray-200 dark:divide-oai-gray-800">
          {machines.map((machine) => (
            <li key={machine.machine_id} className="py-3">
              <div className="flex items-center gap-3">
                <Monitor
                  size={17}
                  className="shrink-0 text-oai-gray-500 dark:text-oai-gray-400"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {machine.name || copy("cloud.devices.unnamed")}
                  </p>
                  <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                    {machine.is_current
                      ? copy("cloud.devices.current")
                      : machine.platform ||
                        copy("cloud.devices.platform_unknown")}
                  </p>
                  <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                    {machine.status === "paused"
                      ? copy("cloud.devices.paused")
                      : copy("cloud.devices.active")}
                  </p>
                  {machine.status === "paused" && !hasFreeSlot ? (
                    <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                      {copy("cloud.devices.no_slot")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                    {machine.last_seen_at
                      ? copy("cloud.devices.last_seen", {
                          date: formatCloudDate(machine.last_seen_at),
                        })
                      : copy("cloud.devices.last_seen_unknown")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  aria-expanded={machine.status !== "paused" ? pending === machine.machine_id : undefined}
                  aria-controls={pending === machine.machine_id ? `cloud-machine-confirm-${machine.machine_id}` : undefined}
                  onClick={() =>
                    machine.status === "paused"
                      ? resume(machine)
                      : setPending((current) => current === machine.machine_id ? null : machine.machine_id)
                  }
                  disabled={
                    busy || (machine.status === "paused" && !hasFreeSlot)
                  }
                >
                  {machine.status === "paused"
                    ? copy("cloud.devices.resume")
                    : copy("cloud.devices.remove")}
                </Button>
              </div>
              {pending === machine.machine_id ? (
                <div id={`cloud-machine-confirm-${machine.machine_id}`} className="mt-3 rounded-lg bg-oai-gray-50 p-3 dark:bg-oai-gray-800">
                  <p className="text-xs leading-5">
                    {copy("cloud.devices.remove_detail")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => remove(machine.machine_id)}
                      disabled={busy}
                    >
                      {copy("cloud.devices.confirm_remove")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setPending(null)}
                      disabled={busy}
                    >
                      {copy("cloud.action.keep")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RestoreCloudOrder({ recent, pendingOrders, conflictOrders }) {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState("");
  const [invalid, setInvalid] = useState(false);
  const orders = [...(conflictOrders || []), ...(pendingOrders || [])].filter(
    (order, index, all) => all.findIndex((item) => item.id === order.id) === index,
  );
  if (recent?.order_id && !orders.some((order) => order.id === recent.order_id))
    orders.unshift({ id: recent.order_id });
  return (
    <div>
      <h3 className="text-sm font-semibold">{copy("cloud.restore.title")}</h3>
      <p className="mt-2 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
        {copy("cloud.restore.detail")}
      </p>
      {recent?.request_id && !recent.order_id ? (
        <Link
          to={`/billing/checkout?sku=${encodeURIComponent(recent.sku)}`}
          className="mt-3 inline-flex min-h-10 items-center text-sm text-oai-brand underline underline-offset-4"
        >
          {copy("cloud.action.resume_purchase")}
        </Link>
      ) : null}
      {orders.length !== 0 ? (
        <ul className="mt-3 space-y-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/billing/checkout?order=${encodeURIComponent(order.id)}`}
                className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-oai-gray-200 px-3 text-sm hover:border-oai-brand dark:border-oai-gray-800"
              >
                <span>{order.retry_payment_conflict_at
                  ? copy("cloud.action.review_duplicate_payment")
                  : copy("cloud.action.resume_order")}</span>
                <span className="truncate font-mono text-xs text-oai-gray-500 dark:text-oai-gray-400">
                  {order.id.slice(0, 8)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!CLOUD_ORDER_ID_PATTERN.test(orderId.trim())) {
            setInvalid(true);
            return;
          }
          navigate(
            `/billing/checkout?order=${encodeURIComponent(orderId.trim())}`,
          );
        }}
      >
        <label
          htmlFor="cloud-restore-order"
          className="text-xs text-oai-gray-500 dark:text-oai-gray-400"
        >
          {copy("cloud.checkout.order_id")}
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="cloud-restore-order"
            value={orderId}
            onChange={(event) => {
              setOrderId(event.target.value);
              setInvalid(false);
            }}
            placeholder={copy("cloud.restore.placeholder")}
            className="min-h-10 min-w-0 flex-1 rounded-md border border-oai-gray-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-oai-brand focus:ring-2 focus:ring-inset focus:ring-oai-brand/30 dark:border-oai-gray-700"
            aria-invalid={invalid}
            aria-describedby={invalid ? "cloud-restore-error" : undefined}
          />
          <Button type="submit" variant="secondary">
            {copy("cloud.action.restore")}
          </Button>
        </div>
        {invalid ? (
          <p
            id="cloud-restore-error"
            role="alert"
            className="mt-2 text-xs text-red-600 dark:text-red-400"
          >
            {copy("cloud.restore.invalid")}
          </p>
        ) : null}
      </form>
    </div>
  );
}

export function CloudMembershipCard() {
  const values = useCloudAccount();
  return (
    <CloudMembershipAccount
      key={values.auth?.signedIn ? values.auth.user?.id : "signed-out"}
      {...values}
    />
  );
}

function CloudMembershipAccount({ account, auth, loading, error, refresh }) {
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const membership = account?.membership;
  const selfHosted = membership?.status === "self_hosted" || membership?.hosting_mode === "self_hosted";
  const hasGiftAccess = !selfHosted && (membership?.has_gift === true ||
    account?.gifts?.some((gift) => ["active", "pending"].includes(gift.state)));
  const paymentConflict = [...(account?.conflict_orders || []), ...(account?.pending_orders || [])]
    .some((order) => order.retry_payment_conflict_at);
  const activeSubscription = !selfHosted && account?.subscriptions?.find((item) =>
    ["active", "trialing", "past_due", "paused", "canceling"].includes(item.status),
  );
  const waffoPortal = !selfHosted && (activeSubscription
    ? activeSubscription.provider === "waffo"
    : account?.payments?.some((payment) => payment.provider === "waffo"));
  const canCancelRenewal =
    activeSubscription && !activeSubscription.cancel_at_period_end && activeSubscription.status !== "canceling";
  const hasRenewal = canCancelRenewal && activeSubscription.status !== "paused";
  const nextBillingDate = activeSubscription?.next_billed_at;
  const knownBillingDate = nextBillingDate && Number.isFinite(Date.parse(nextBillingDate));
  useEffect(() => {
    if (canceling && account && !canCancelRenewal) {
      setCanceling(null);
      setActionError(null);
    }
  }, [account, canceling, canCancelRenewal]);
  const endDate = selfHosted ? null :
    membership?.status === "trial"
      ? membership.trial_ends_at
      : membership?.status === "transition"
        ? membership.transition_ends_at
        : membership?.expires_at;
  const perform = async (operation) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await operation();
    } catch (reason) {
      if (mounted.current) setActionError(reason);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const portal = () =>
    perform(async () => {
      const value = await cloudBillingRequest("portal", {
        auth: auth.getAccessToken,
        body: activeSubscription
          ? { subscription_id: activeSubscription.provider_subscription_id }
          : {},
      });
      if (!mounted.current) return;
      await openCloudExternal(value.url || value.portal_url);
    });
  const cancel = () =>
    perform(async () => {
      await cloudBillingRequest("cancel", {
        auth: auth.getAccessToken,
        body: { subscription_id: canceling },
      });
      if (!mounted.current) return;
      setCanceling(null);
      await refresh();
    });

  if (!auth?.signedIn) {
    return (
      <Card className="tt-cloud-theme">
        <h2 className="text-base font-semibold">
          {copy("cloud.membership.title")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
          {copy("cloud.membership.signed_out")}
        </p>
        <Button
          as={Link}
          to="/cloud"
          variant="secondary"
          className="mt-4 no-underline"
        >
          {copy("cloud.action.view_plans")}
        </Button>
      </Card>
    );
  }
  return (
    <Card className="tt-cloud-theme" bodyClassName="space-y-6">
      {account?.environment === "sandbox" ? (
        <BillingNotice>{copy("cloud.catalog.sandbox")}</BillingNotice>
      ) : null}
      {paymentConflict ? <CloudPaymentConflictNotice showBillingLink={false} /> : null}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {copy("cloud.membership.title")}
          </h2>
          <Button
            onClick={refresh}
            variant="ghost"
            disabled={loading}
            aria-label={copy("cloud.action.refresh_membership")}
          >
            <RefreshCw size={15} aria-hidden />
          </Button>
        </div>
        {membership ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-oai-gray-100 px-3 py-1 text-sm font-medium dark:bg-oai-gray-800">
                {membership.status === "active" && membership.access_source === "gift"
                  ? copy("cloud.gift.membership_label") : cloudMembershipLabel(membership.status)}
              </span>
              {endDate ? (
                <span className="text-sm text-oai-gray-500 dark:text-oai-gray-400">
                  {copy("cloud.membership.expires", {
                    date: formatCloudDate(endDate),
                  })}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {selfHosted ? copy("cloud.self_host.instance_retention") : membership.status === "legacy_free"
                ? copy("cloud.membership.preview")
                : membership.status === "expired"
                  ? membership.can_read_cloud
                    ? copy("cloud.membership.read_only", {
                        date: formatCloudDate(membership.read_only_until),
                      })
                    : copy("cloud.membership.expired_detail")
                  : membership.status === "transition"
                    ? copy("cloud.membership.transition_detail")
                    : copy("cloud.membership.local_free")}
            </p>
            <CloudDeadlinePrompt userId={auth.user?.id} membership={membership} subscriptions={account?.subscriptions} className="mt-3" />
          </>
        ) : null}
        {!membership && loading ? (
          <p role="status" className="mt-3 text-sm text-oai-gray-500 dark:text-oai-gray-400">
            {copy("cloud.catalog.loading")}
          </p>
        ) : null}
        {activeSubscription ? (
          <p className="mt-3 text-sm text-oai-gray-500 dark:text-oai-gray-400">
            {activeSubscription.status === "paused"
              ? copy("cloud.membership.renewal_paused")
              : hasRenewal
                ? knownBillingDate
                  ? copy("cloud.membership.renews", { date: formatCloudDate(nextBillingDate) })
                  : copy("cloud.membership.renewal_unknown")
                : copy("cloud.membership.renewal_off")}
          </p>
        ) : null}
        {waffoPortal ? (
          <p className="mt-2 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
            {copy("cloud.membership.portal_login")}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {activeSubscription || waffoPortal ? (
            <Button onClick={portal} variant="secondary" disabled={busy}>
              {activeSubscription
                ? copy("cloud.action.manage_subscription")
                : copy("cloud.action.view_bills")}
              <ExternalLink size={14} className="ml-2" aria-hidden />
            </Button>
          ) : null}
          {!activeSubscription && !paymentConflict && !selfHosted && !hasGiftAccess ? (
            <Button
              as={Link}
              to="/cloud"
              variant="secondary"
              className="no-underline"
            >
              {membership?.status === "active"
                ? copy("cloud.action.renew")
                : copy("cloud.action.view_plans")}
            </Button>
          ) : null}
          {canCancelRenewal ? (
            <Button
              aria-expanded={Boolean(canceling)}
              aria-controls={canceling ? "cloud-cancel-confirm" : undefined}
              onClick={() =>
                setCanceling((current) => current === activeSubscription.provider_subscription_id ? null : activeSubscription.provider_subscription_id)
              }
              variant="ghost"
              disabled={busy}
            >
              {copy("cloud.action.cancel_renewal")}
            </Button>
          ) : null}
          {membership?.can_read_cloud ? (
            <Button
              as={Link}
              to="/dashboard"
              variant="ghost"
              className="no-underline"
            >
              {membership.can_upload_cloud
                ? copy("cloud.action.open_dashboard")
                : copy("cloud.action.read_export")}
            </Button>
          ) : null}
        </div>
        <RedeemProCode account={account} auth={auth} refresh={refresh} />
        {canceling ? (
          <div id="cloud-cancel-confirm" className="mt-4 rounded-lg border border-oai-gray-200 p-4 dark:border-oai-gray-800">
            <p className="text-sm leading-6">
              {endDate
                ? copy("cloud.cancel.detail", { date: formatCloudDate(endDate) })
                : copy("cloud.cancel.no_term")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={cancel} variant="secondary" disabled={busy}>
                {copy("cloud.cancel.confirm")}
              </Button>
              <Button
                onClick={() => setCanceling(null)}
                variant="ghost"
                disabled={busy}
              >
                {copy("cloud.action.keep")}
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <BillingNotice error={error} onRetry={refresh} context="account" />
          </div>
        ) : null}
        {actionError ? (
          <div className="mt-4">
            <BillingNotice error={actionError} context="account" />
          </div>
        ) : null}
      </div>
      {account?.gifts?.length && !selfHosted ? (
        <div className="border-t border-oai-gray-200 pt-6 dark:border-oai-gray-800">
          <h3 className="text-sm font-semibold">{copy("cloud.gift.history_title")}</h3>
          <ul className="mt-3 divide-y divide-oai-gray-200 dark:divide-oai-gray-800">
            {account.gifts.map((gift) => (
              <li key={gift.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{copy("cloud.gift.duration", { days: gift.duration_days })}</span>
                  <span>{copy(["active", "pending", "expired", "revoked"].includes(gift.state)
                    ? `cloud.gift.state_${gift.state}` : "cloud.status.unknown")}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">
                  {copy("cloud.history.term", { start: formatCloudDate(gift.starts_at), end: formatCloudDate(gift.ends_at) })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {membership ? (
        <div className="border-t border-oai-gray-200 pt-6 dark:border-oai-gray-800">
          <CloudMachineList
            auth={auth}
            machineLimit={membership.machine_limit}
            accountRevision={account}
            selfHosted={selfHosted}
          />
        </div>
      ) : null}
      {!selfHosted ? <div className="border-t border-oai-gray-200 pt-6 dark:border-oai-gray-800">
        <RestoreCloudOrder
          recent={readCloudPurchase(auth.user?.id)}
          pendingOrders={account?.pending_orders}
          conflictOrders={account?.conflict_orders}
        />
      </div> : null}
      {account && !selfHosted ? (
        <div className="border-t border-oai-gray-200 pt-6 dark:border-oai-gray-800">
          <h3 className="text-sm font-semibold">
            {copy("cloud.history.title")}
          </h3>
          {account.payments?.length ? (
            <ul className="mt-3 divide-y divide-oai-gray-200 dark:divide-oai-gray-800">
              {account.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      {formatCloudDate(payment.paid_at)}
                    </p>
                    <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                      {cloudProviderLabel(payment.provider)}
                    </p>
                    <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                      {copy("cloud.history.term", {
                        start: formatCloudDate(payment.starts_at),
                        end: formatCloudDate(payment.ends_at),
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatCloudMoney(payment.amount_cents, payment.currency)}
                    </p>
                    {payment.refunded_cents !== 0 ? (
                      <p className="mt-1 text-xs text-oai-gray-500 dark:text-oai-gray-400">
                        {copy("cloud.history.refunded", {
                          amount: formatCloudMoney(
                            payment.refunded_cents,
                            payment.currency,
                          ),
                        })}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.history.empty")}
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
