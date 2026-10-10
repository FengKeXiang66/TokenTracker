import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Monitor, Server } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  BillingNotice,
  CloudFeatures,
  CloudPaymentConflictNotice,
  SelfHostedCloudState,
  cloudMembershipLabel,
  formatCloudDate,
} from "../components/cloud/CloudBillingParts.jsx";
import { SegmentedControl } from "../components/settings/Controls.jsx";
import {
  useCloudAccount,
  useCloudCatalog,
} from "../hooks/use-cloud-billing.js";
import {
  cloudAnnualSavings,
  cloudCheckoutLaunched,
  formatCloudMoney,
} from "../lib/cloud-billing";
import { copy } from "../lib/copy";
import { Button } from "../ui/components/Button.jsx";
import { Card } from "../ui/components/Card.jsx";

export function CloudPage() {
  const pageRef=useRef(null);
  useLayoutEffect(()=>{
    const scroller=pageRef.current?.parentElement;
    if(scroller) scroller.scrollTop=0;
  },[]);
  const navigate = useNavigate();
  const { catalog, loading, error, refresh } = useCloudCatalog();
  const { account, auth, loading: accountLoading, error: accountError, refresh: refreshAccount } = useCloudAccount();
  const [billingMode, setBillingMode] = useState("recurring");
  const [term, setTerm] = useState(12);
  const price = catalog?.prices?.find(
    (item) => item.billing_mode === billingMode && item.term_months === term,
  );
  const monthly = catalog?.prices?.find(
    (item) => item.billing_mode === billingMode && item.term_months === 1,
  );
  const annual = catalog?.prices?.find(
    (item) => item.billing_mode === billingMode && item.term_months === 12,
  );
  const currency = price?.currency || "USD";
  const savings = cloudAnnualSavings(monthly, annual);
  const launched = cloudCheckoutLaunched(catalog);
  const providerAvailable = catalog?.providers?.waffo;
  const membership = account?.membership;
  const hasGiftAccess = membership?.has_gift === true ||
    account?.gifts?.some((gift) => ["active", "pending"].includes(gift.state));
  const paymentConflict = [...(account?.conflict_orders || []), ...(account?.pending_orders || [])]
    .some((order) => order.retry_payment_conflict_at);
  const hasCloud =
    membership &&
    ["active", "trial", "transition", "legacy_free"].includes(
      membership.status,
    );
  const openSubscription = account?.subscriptions?.some((item) =>
    ["active", "trialing", "past_due", "paused"].includes(item.status) && !item.cancel_at_period_end,
  );
  const trialUnavailable = membership?.trial_available === false;
  const trialAvailable = !auth?.signedIn || membership?.trial_available === true;
  const accountPending = Boolean(auth?.loading || (auth?.signedIn && (accountLoading || accountError || !membership)));
  const managesCurrentPlan = membership?.status === "active" || openSubscription || hasGiftAccess;
  const offersTrial = !hasCloud && !openSubscription && !hasGiftAccess && !trialUnavailable;
  const purchaseLabel = copy(billingMode === "fixed" ? "cloud.action.buy_pro" : "cloud.action.subscribe");
  const purchaseUnavailable = !price || !launched || loading || error || accountPending || !providerAvailable || paymentConflict;

  const checkout = (trial = false) => {
    const params = trial
      ? new URLSearchParams({ intent: "trial" })
      : new URLSearchParams({ sku: price.sku });
    navigate(`/billing/checkout?${params}`);
  };

  if (catalog?.policy?.hosting_mode === "self_hosted" || membership?.status === "self_hosted") {
    return <SelfHostedCloudState />;
  }

  return (
    <div ref={pageRef} className="tt-cloud-theme flex flex-1 flex-col font-oai text-oai-black dark:text-oai-white">
      <main className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-9">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight">
            {copy("cloud.page.title")}
          </h1>
          <p className="mt-3 text-base leading-7 text-oai-gray-500 dark:text-oai-gray-400">
            {copy("cloud.page.subtitle")}
          </p>
          {catalog?.environment === "sandbox" ? (
            <p className="mt-3 text-xs text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.price.draft")}
            </p>
          ) : null}
        </div>

        {paymentConflict ? <div className="mb-6"><CloudPaymentConflictNotice /></div> : null}

        <div className="grid items-start gap-5 md:grid-cols-2">
          <Card
            className="order-2 md:order-1"
            bodyClassName="flex flex-col sm:p-6"
          >
            <div className="mb-2 flex min-h-11 items-center gap-2">
              <Monitor size={19} className="text-oai-gray-500 dark:text-oai-gray-400" aria-hidden />
              <h2 className="text-lg font-semibold">
                {copy("cloud.free.title")}
              </h2>
            </div>
            <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400 md:min-h-12">
              {copy("cloud.free.subtitle")}
            </p>
            <div className="my-6">
              <p className="text-3xl font-semibold tracking-tight">
                {copy("cloud.free.price")}
              </p>
              <p className="mt-2 text-sm text-oai-gray-500 dark:text-oai-gray-400">
                {copy("cloud.free.forever")}
              </p>
            </div>
            <Button
              as={Link}
              to={auth?.signedIn ? "/dashboard" : "/landing#download"}
              variant="secondary"
              className="w-full no-underline"
            >
              {copy("cloud.free.cta")}
            </Button>
            <div className="mt-7 border-t border-oai-gray-200 pt-6 dark:border-oai-gray-800">
              <ul className="space-y-3 text-sm">
                {[
                  copy("cloud.free.tracking"),
                  copy("cloud.free.limits"),
                  copy("cloud.free.desktop"),
                  copy("cloud.free.exports"),
                  copy("cloud.free.community"),
                ].map((label) => (
                  <li key={label} className="flex gap-3">
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-oai-gray-500 dark:text-oai-gray-400"
                      aria-hidden
                    />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <p className="pt-6 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.free.installations")}
            </p>
          </Card>

          <Card
            className="order-1 border-oai-gray-300 dark:border-oai-gray-600 md:order-2"
            bodyClassName="sm:p-6"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold">
                {copy("cloud.plan.title")}
              </h2>
              <div role="group" aria-label={copy("cloud.selector.term")} className="tt-pro-period-control shrink-0">
                <SegmentedControl
                  options={[
                    { value: 1, label: copy("cloud.term.monthly") },
                    { value: 12, label: copy("cloud.term.yearly") },
                  ]}
                  value={term}
                  onChange={setTerm}
                />
              </div>
            </div>
            <p className="text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400 md:min-h-12">
              {copy("cloud.plan.subtitle")}
            </p>
            <div className="mb-4 mt-5" aria-live="polite">
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {price
                    ? formatCloudMoney(price.amount_cents, currency)
                    : copy("cloud.price.pending")}
                </span>
                <span className="text-sm text-oai-gray-500 dark:text-oai-gray-400">
                  {term === 12
                    ? copy("cloud.price.per_year")
                    : copy("cloud.price.per_month")}
                </span>
              </p>
              <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
                {price
                  ? billingMode === "fixed"
                    ? copy(term === 12 ? "cloud.price.fixed_annual_total" : "cloud.price.fixed_monthly_total", {
                        equivalent: formatCloudMoney(Math.round(price.amount_cents / 12), currency),
                      })
                    : term === 12
                    ? copy("cloud.price.annual_total", {
                        total: formatCloudMoney(price.amount_cents, currency),
                        equivalent: formatCloudMoney(
                          Math.round(price.amount_cents / 12),
                          currency,
                        ),
                      })
                    : copy("cloud.price.monthly_total", {
                        total: formatCloudMoney(price.amount_cents, currency),
                      })
                  : copy("cloud.price.waiting")}
              </p>
              {term === 12 && savings !== 0 ? (
                <p className="mt-1 text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">
                  {copy("cloud.price.savings", { percent: savings })}
                </p>
              ) : null}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="pro-renewal-toggle" className="cursor-pointer text-sm font-medium">
                  {copy("cloud.billing_mode.recurring")}
                </label>
                <button
                  id="pro-renewal-toggle"
                  type="button"
                  role="switch"
                  aria-checked={billingMode === "recurring"}
                  aria-label={copy("cloud.billing_mode.recurring")}
                  aria-describedby="pro-renewal-description"
                  onClick={() => setBillingMode((value) => value === "recurring" ? "fixed" : "recurring")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                >
                  <span aria-hidden className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${billingMode === "recurring" ? "bg-oai-gray-900 dark:bg-oai-gray-100" : "bg-oai-gray-300 dark:bg-oai-gray-700"}`}>
                    <span className={`h-3.5 w-3.5 rounded-full transition-transform motion-reduce:transition-none ${billingMode === "recurring" ? "translate-x-[19px] bg-white dark:bg-oai-gray-900" : "translate-x-[3px] bg-white"}`} />
                  </span>
                </button>
              </div>
              <p id="pro-renewal-description" className="text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">
                {copy(billingMode === "recurring" ? "cloud.renewal.auto" : "cloud.renewal.manual")}
              </p>
            </div>
            {managesCurrentPlan ? (
              <Button
                as={Link}
                to="/settings?section=account"
                className="w-full no-underline"
              >
                {copy("cloud.action.manage_membership")}
              </Button>
            ) : null}
            {!managesCurrentPlan && offersTrial ? (
              <Button
                type="button"
                onClick={() => checkout(true)}
                disabled={!launched || loading || error || accountPending || !trialAvailable || paymentConflict}
                className="w-full"
              >
                {copy("cloud.action.try", {
                  days: catalog?.limits?.trial_days || 7,
                })}
                <ArrowRight size={16} className="ml-2" aria-hidden />
              </Button>
            ) : null}
            {!managesCurrentPlan && !offersTrial ? (
              <Button type="button" onClick={() => checkout()} disabled={purchaseUnavailable} className="w-full">
                {purchaseLabel}
                <ArrowRight size={16} className="ml-2" aria-hidden />
              </Button>
            ) : null}
            {hasCloud || openSubscription || (trialUnavailable && !hasCloud) || (trialAvailable && !accountPending) ? (
              <p className="mt-2 text-center text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
                {hasCloud || openSubscription
                  ? cloudMembershipLabel(membership?.status)
                  : trialUnavailable ? copy("cloud.error.trial") : copy("cloud.trial.no_card")}
              </p>
            ) : null}
            {hasCloud && !managesCurrentPlan ? <p className="mt-2 text-center text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">
              {membership?.status === "transition" && membership.transition_ends_at
                ? copy("cloud.membership.expires", { date: formatCloudDate(membership.transition_ends_at) })
                : membership?.status === "trial" && membership.trial_ends_at
                  ? copy("cloud.membership.expires", { date: formatCloudDate(membership.trial_ends_at) })
                  : null}
              <Link to="/settings?section=account" className="ml-2 inline-flex min-h-8 items-center underline underline-offset-4">{copy("cloud.action.manage_membership")}</Link>
            </p> : null}
            {!openSubscription && !hasGiftAccess && (offersTrial || (managesCurrentPlan && billingMode === "fixed")) ? <Button
              type="button"
              variant="ghost"
              onClick={() => checkout()}
              disabled={purchaseUnavailable}
              className="mx-auto mt-1 !flex w-fit underline underline-offset-4"
            >
              {managesCurrentPlan ? copy("cloud.action.renew") : purchaseLabel}
            </Button> : null}
            {hasGiftAccess ? <p className="mt-3 text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">
              {copy("cloud.gift.error_active")}
            </p> : null}
            {price ? (
              <p className="mt-2 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
                {copy("cloud.checkout.tax")}
              </p>
            ) : null}
            <div className="mt-6 border-t border-oai-gray-200 pt-6 dark:border-oai-gray-800">
              <CloudFeatures limits={catalog?.limits} />
              <p className="mt-4 flex items-start gap-3 text-sm leading-6">
                <Check size={17} className="mt-1 shrink-0 text-oai-gray-600 dark:text-oai-gray-300" aria-hidden />
                {copy("cloud.feature.pro_identity")}
              </p>
            </div>
            <p className="mt-5 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.feature.privacy_detail")}
            </p>
          </Card>
        </div>

        <div className="mt-5">
          {accountError ? <BillingNotice error={accountError} context="account" onRetry={refreshAccount} /> : null}
          {error ? <BillingNotice error={error} onRetry={refresh} /> : null}
          {!error && loading ? (
            <BillingNotice>{copy("cloud.catalog.loading")}</BillingNotice>
          ) : null}
          {!error && !loading && !launched ? (
            <BillingNotice>{copy("cloud.catalog.preview")}</BillingNotice>
          ) : null}
          {!error && !loading && launched && !providerAvailable ? (
            <BillingNotice>
              {copy("cloud.catalog.provider_unavailable")}
            </BillingNotice>
          ) : null}
          {!error &&
          !loading &&
          launched &&
          catalog?.environment === "sandbox" ? (
            <BillingNotice>{copy("cloud.catalog.sandbox")}</BillingNotice>
          ) : null}
        </div>

        <section className="mt-8 flex flex-col gap-5 rounded-xl border border-oai-gray-200 p-5 dark:border-oai-gray-800 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Server size={18} aria-hidden />
              {copy("cloud.self_host.title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-oai-gray-600 dark:text-oai-gray-300">
              {copy("cloud.self_host.body")}
            </p>
          </div>
          <Button as={Link} to="/self-host" variant="secondary" className="shrink-0 self-start no-underline sm:self-auto">
            {copy("cloud.self_host.cta")}
            <ArrowRight size={16} className="ml-2" aria-hidden />
          </Button>
        </section>

        <div className="mt-10 grid gap-7 border-t border-oai-gray-200 pt-7 dark:border-oai-gray-800 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold">
              {copy("cloud.faq.cost_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.faq.cost_body")}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {copy("cloud.faq.local_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.faq.local_body")}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {copy("cloud.faq.expiry_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.faq.expiry_body")}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {copy("cloud.faq.existing_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.faq.existing_body")}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {copy("cloud.faq.platform_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.faq.platform_body")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
