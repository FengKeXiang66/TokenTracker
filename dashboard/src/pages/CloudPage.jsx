import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Cloud, Monitor, Server } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  BillingNotice,
  CloudFeatures,
  CloudPaymentConflictNotice,
  SelfHostedCloudState,
  cloudMembershipLabel,
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
  const { account, auth, loading: accountLoading, error: accountError } = useCloudAccount();
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
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 max-w-2xl">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-oai-gray-600 dark:text-oai-gray-300">
            <Cloud size={17} aria-hidden />
            {copy("cloud.page.eyebrow")}
          </span>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
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

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label={copy("cloud.selector.term")}
            className="overflow-x-auto [&_button]:min-h-10 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-inset [&_button]:focus-visible:ring-oai-brand"
          >
            <SegmentedControl
              options={[
                { value: 1, label: copy("cloud.term.monthly") },
                { value: 12, label: copy("cloud.term.yearly") },
              ]}
              value={term}
              onChange={setTerm}
            />
          </div>
          <div
            role="group"
            aria-label={copy("cloud.selector.billing_mode")}
            className="overflow-x-auto [&_button]:min-h-10 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-inset [&_button]:focus-visible:ring-oai-brand"
          >
            <SegmentedControl
              options={[
                { value: "recurring", label: copy("cloud.billing_mode.recurring") },
                { value: "fixed", label: copy("cloud.billing_mode.fixed") },
              ]}
              value={billingMode}
              onChange={setBillingMode}
            />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card
            className="order-2 h-full md:order-1"
            bodyClassName="flex h-full flex-col sm:p-7"
          >
            <div className="mb-4 flex items-center gap-2">
              <Monitor size={19} className="text-oai-gray-500 dark:text-oai-gray-400" aria-hidden />
              <h2 className="text-lg font-semibold">
                {copy("cloud.free.title")}
              </h2>
            </div>
            <p className="min-h-[3rem] text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.free.subtitle")}
            </p>
            <div className="my-6">
              <p className="text-4xl font-semibold tracking-tight">
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
            <p className="mt-auto pt-7 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.free.installations")}
            </p>
          </Card>

          <Card
            className="order-1 border-oai-gray-500 dark:border-oai-gray-500 md:order-2"
            bodyClassName="sm:p-7"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {copy("cloud.plan.title")}
              </h2>
              {term === 12 && savings !== 0 ? (
                <span className="rounded-full bg-oai-gray-100 px-2.5 py-1 text-xs font-medium text-oai-gray-700 dark:bg-oai-gray-800 dark:text-oai-gray-200">
                  {copy("cloud.price.savings", { percent: savings })}
                </span>
              ) : null}
            </div>
            <p className="min-h-[3rem] text-sm leading-6 text-oai-gray-500 dark:text-oai-gray-400">
              {copy("cloud.plan.subtitle")}
            </p>
            <div className="my-6" aria-live="polite">
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
                  ? term === 12
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
            </div>
            {hasCloud || openSubscription ? (
              <Button
                as={Link}
                to="/settings?section=account"
                className="w-full no-underline"
              >
                {copy("cloud.action.manage_membership")}
              </Button>
            ) : null}
            {!hasCloud && !openSubscription && !trialUnavailable ? (
              <Button
                type="button"
                onClick={() => checkout(true)}
                disabled={!launched || loading || error || accountPending || !trialAvailable}
                className="w-full"
              >
                {copy("cloud.action.try", {
                  days: catalog?.limits?.trial_days || 7,
                })}
                <ArrowRight size={16} className="ml-2" aria-hidden />
              </Button>
            ) : null}
            {hasCloud || openSubscription || trialUnavailable || (trialAvailable && !accountPending) ? (
              <p className="mt-2 text-center text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
                {hasCloud || openSubscription
                  ? cloudMembershipLabel(membership?.status)
                  : trialUnavailable ? copy("cloud.error.trial") : copy("cloud.trial.no_card")}
              </p>
            ) : null}
            {!openSubscription ? <Button
              type="button"
              variant={trialUnavailable && !hasCloud ? "primary" : "secondary"}
              onClick={() => checkout()}
              disabled={!price || !launched || loading || error || accountPending || !providerAvailable || paymentConflict}
              className="mt-3 w-full"
            >
              {copy("cloud.action.subscribe")}
            </Button> : null}
            <p className="mt-3 text-xs leading-5 text-oai-gray-500 dark:text-oai-gray-400">
              {billingMode === "fixed"
                ? copy("cloud.renewal.manual")
                : copy("cloud.renewal.auto")}
            </p>
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
