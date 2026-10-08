# Cloud billing operations

This is a deployment and merchant setup checklist, not a record of a production launch. Prices remain proposed. Keep the live policy in `preview` until the gates below pass. Mark each check with its commit, environment, date, result, and private evidence location; leave untested items unchecked.

The code and configuration references are [runtime.ts](../dashboard/edge-patches/cloud/runtime.ts), [Waffo adapter](../dashboard/edge-patches/cloud/waffo.ts), [billing handler](../dashboard/edge-patches/tokentracker-billing.ts), [financial migration](../migrations/20261003120000_cloud-subscriptions.sql), [device/access migration](../migrations/20261004120000_cloud-machine-access.sql), [Waffo migration](../migrations/20261007120000_cloud-waffo.sql), [safe-retry migration](../migrations/20261007130000_cloud-waffo-retry.sql), [attempt bindings](../migrations/20261007140000_cloud-waffo-attempts.sql), [authorization audit](../migrations/20261007150000_cloud-waffo-authorizations.sql), [sandbox periods](../migrations/20261007160000_cloud-waffo-sandbox-periods.sql), [instance policy](../migrations/20261008120000_self-hosted-access.sql), [token environment validation](../migrations/20261008120001_validate-cloud-token-environment.sql), and [usage archive](cloud-usage-archive.md). Recheck them against the reviewed commit at deployment.

## Environment and secrets

Sandbox and live provider credentials, notification destinations, price IDs, orders, payments, and subscriptions must stay separate. Use a dedicated checkout/return origin, without changing the production account UI. The default billing environment is `live` so historical production device tokens remain compatible; both policy rows start in `preview`. A separate sandbox backend can explicitly set `TOKENTRACKER_BILLING_ENVIRONMENT=sandbox`. For acceptance on the existing paid backend, use the fixed sandbox builds below and leave that global setting unchanged. The default does not enable charging.

Store server credentials in the target backend's secret store. Do not commit `.insforge/project.json`, local secret files, private keys, screenshots containing credentials, or customer payment payloads. Never use `VITE_` for server API keys or service-role credentials. `@waffo/pancake-ts@0.25.0` runs only on the server; the frontend receives the owned order and hosted checkout URL, without a client SDK or private key.

TokenTracker `sandbox` maps to Waffo `test`; TokenTracker `live` maps to Waffo `prod`. Product setup uses the separate `WAFFO_ENVIRONMENT=test` script variable. Keep these names distinct and never infer production approval from a successful test request.

| Configuration key | Value to prepare |
|---|---|
| `TOKENTRACKER_BILLING_ENVIRONMENT` | `sandbox` or `live`, mapped to Waffo `test` or `prod` |
| `TOKENTRACKER_WAFFO_LIVE_CHECKOUT_VERIFIED` | Default false. Set `true` only after genuine production checkout, refund and membership recovery are independently verified |
| `TOKENTRACKER_BILLING_SITE_URL` | HTTPS origin hosting `/billing/checkout`; Waffo return URLs require HTTPS |
| `INSFORGE_BASE_URL` | Target backend origin |
| `INSFORGE_SERVICE_ROLE_KEY` | Server-only edge database credential |
| `INSFORGE_ANON_KEY` or `ANON_KEY` | Backend anonymous client key |
| `JWT_SECRET` / `JWT_PUBLIC_KEY` | Backend JWT verifier material matching its actual signing algorithm |
| `WAFFO_MERCHANT_ID` | Merchant identity for the approved environment |
| `WAFFO_STORE_ID` | The selected store, verified by API read-back |
| `WAFFO_PRIVATE_KEY` | Server-only RSA PEM or raw Base64 key material; the SDK normalizes its supported formats |
| `WAFFO_CLOUD_MONTHLY_PRODUCT_ID` | Monthly recurring USD product |
| `WAFFO_CLOUD_YEARLY_PRODUCT_ID` | Yearly recurring USD product |
| `WAFFO_CLOUD_MONTHLY_PASS_PRODUCT_ID` | One-month fixed-term USD product |
| `WAFFO_CLOUD_YEARLY_PASS_PRODUCT_ID` | One-year fixed-term USD product |

| SKU | Billing mode | USD base amount | SDK product type |
|---|---|---|---|
| `cloud_usd_monthly` | `recurring` | 4.99 | Subscription, monthly |
| `cloud_usd_yearly` | `recurring` | 39.99 | Subscription, yearly |
| `cloud_usd_monthly_fixed` | `fixed` | 4.99 | One-time |
| `cloud_usd_yearly_fixed` | `fixed` | 39.99 | One-time |

These are global test prices before tax. Store integer cents in TokenTracker (499/3999), but pass display amount strings (`"4.99"`/`"39.99"`) to the SDK. Waffo products use the `saas` tax category. Product and order validation checks ownership, environment, price, billing period and absence of a provider trial. The seven-day no-card trial belongs to TokenTracker. Waffo checkout calculates tax and displays the final charge; do not promise identical tax-inclusive totals or a CNY conversion rate. Read back `providers.waffo` from the catalog; that flag is not proof of merchant approval or payment.

## Existing project hosted sandbox

The owner authorized acceptance on the existing paid TokenTracker backend at `https://srctyff5.us-east.insforge.app`. No new developer account or backend is required. Sandbox and live billing records share PostgreSQL but use separate `environment` values; authentication remains the existing project's authentication.

1. Check the linked project and save private schema/function recovery evidence. Apply only the nine financial/device migrations listed below, skipping `20261005120000_cloud-usage-archive.sql`. The token environment column defaults existing tokens to `live`. Its named FK starts `NOT VALID`, still enforcing new writes, then the final migration validates historical rows in a separate transaction. On this hosted project, `statement_timeout` overrides are forbidden; preserve the platform timeout and use the allowed three-second `lock_timeout`. Read back migration history and `convalidated=true` rather than relying on the CLI success message.
2. Create dedicated application test users through the existing auth service. Configure the nine dedicated settings: `TOKENTRACKER_SANDBOX_USER_IDS`, `TOKENTRACKER_SANDBOX_BILLING_SITE_URL`, and the `TOKENTRACKER_SANDBOX_` versions of merchant ID, store ID, private key and four Waffo product IDs. The allowlist contains actual test-user UUIDs. Keep passwords, JWTs and private keys outside the repository and logs. Do not replace reserved JWT/backend secrets or global billing environment/site settings.
3. Build and deploy only the two new sandbox slugs. The build fixes billing to `sandbox`/Waffo `test`, disables live checkout verification, reads only dedicated Waffo/site settings, and checks a valid signed JWT plus the UUID allowlist before billing or catalog database access. The original function slugs and production frontend remain unchanged.

```bash
node scripts/build-cloud-functions.cjs --sandbox
npx @insforge/cli functions deploy tokentracker-billing-sandbox --file .tmp/cloud-functions-sandbox/tokentracker-billing-sandbox.js
npx @insforge/cli functions deploy tokentracker-waffo-webhook-sandbox --file .tmp/cloud-functions-sandbox/tokentracker-waffo-webhook-sandbox.js
```

4. Independently compare each remote source with its artifact and confirm active status. Verify allowlisted JWT requests return 200, other valid users return 403, and missing/tampered JWTs return 401. Anonymous/authenticated REST reads of the catalog base table are denied. Read back all four merchant test products, then set only the sandbox policy to `active` for acceptance. The live row must remain `preview`, with `launch_at=NULL` and `hosting_mode=hosted`.
5. Register the merchant test webhook at `https://srctyff5.us-east.insforge.app/functions/tokentracker-waffo-webhook-sandbox` and read back its URL, events and test flag. It retains raw RSA signature verification and checks test mode/store before SQL. Verify genuine checkout, callback, ledger, membership, return UI, cancellation and refunds with the dedicated users. Preserve private receipts and compare original service behavior after testing. This does not enable paid restrictions on the existing sync/leaderboard functions.

On 2026-10-08, all nine migrations and both sandbox functions were deployed and independently read back. The FK was validated; metadata for the original 23 active functions and MD5s for 52 existing business RPCs were unchanged. Two forbidden timeout attempts were checked to have created no new tables before the successful deployment. Real JWT allowlist checks, invalid-webhook rejection and test-product read-back passed. Hosted payment/cancellation/refund and UI acceptance are still in progress; no real wallet, production payment, settlement or hosted cross-device acceptance is claimed.

## Merchant preparation

### Waffo test setup and production approval

- Verify the selected merchant/store through the SDK and dashboard before configuring products. Do not replace unrelated existing products or publish test products as part of a test run.
- [Test product setup](../scripts/setup-waffo-cloud.cjs) requires `WAFFO_ENVIRONMENT=test` and secure merchant/store/key configuration. Its default run is read-only; `--apply` creates missing products with stable idempotency keys and performs an independent API read-back. On 2026-10-07, all four test products were created and read back. Keep their IDs and private evidence outside tracked documents.
- The store read-back on 2026-10-07 reported `prodEnabled=false`. Complete the KYB, product/site and payout review required by Waffo, then independently verify production approval. Test products and checkout sessions do not establish live permission. Use separate production credentials and reviewed product publication only after approval.
- Configure an HTTP webhook for the matching store/environment at `BACKEND_ORIGIN/functions/tokentracker-waffo-webhook`. Include one-time completion, subscription activation/payment/cancellation/past-due, and refund lifecycle events needed by the handler. Re-read the stored URL, event list and test-mode flag after configuration.
- Use the SDK's RSA-SHA256 verification over the raw request body and `X-Waffo-Signature`. Verify event mode and store, then reconcile with the signed provider API before transactional fulfillment. Do not grant membership from checkout redirects or unsigned metadata.
- Confirm recurring card/Apple Pay/Google Pay and fixed-term WeChat/card availability in the actual hosted checkout. Web opens a new tab with `noopener,noreferrer`; native clients use the system browser. The [consumer portal](https://pancake.waffo.ai/consumer/portal/login) requires the purchase email and a separate Waffo login; it is not a TokenTracker-authenticated portal session.

Record the merchant contract's fees, payout account/currency, schedule and any threshold privately. Waffo's MoR service handles applicable consumer sales taxes under its terms. It does not establish exemption from the operator's own income/business taxes, invoicing or foreign-exchange accounting. Review those obligations for the real operating entity and settlement contract. [MoR service](https://www.waffo.ai/features/mor), [developer terms](https://www.waffo.ai/developer-terms)

A verified checkout receipt is different from payout settlement. The sandbox receipts described below are verified separately. Production pilot payments and bank settlement remain unverified; do not infer them from product setup or local tests.

### Contextual membership reminders

Reminders reuse existing catalog, membership and denied-access responses without new API requests, polling or telemetry. Nothing appears on initial dashboard opening or the free leaderboard. A user's sync toggle, private history selection or device action can show a dismissible explanation in that panel. Free local use and daily community uploads remain available.

Sales and trial CTAs require a fresh catalog with `environment=live`, reached active launch policy, configured Waffo and `checkout_verified=true`, plus a matching active/live membership response. The server's verification flag also requires explicit `TOKENTRACKER_WAFFO_LIVE_CHECKOUT_VERIFIED=true`. Product setup or sandbox success does not justify that switch. With current `prodEnabled=false`, the reminder can only offer explanatory Cloud information.

Dismissal records are local, per account and scene, with at least seven days of shared cooldown across promotional scenes. Account switches clear active reminder intent. Unwritable storage suppresses sales CTAs and automatic expiry nudges; explicit action explanations can still be closed in memory. Existing paid access never triggers a sales prompt. Device/history issues lead to management, while date notices use the trial's final 48 hours or a transition/fixed paid term's final seven days. Cancellation does not shorten the paid term.

### Declined checkout and safe retry

Waffo consumes a checkout session when the buyer is submitted, before payment has necessarily succeeded. A consumed session can show expired even before its configured TTL. Do not refresh the old session or treat that screen as proof of an unpaid order. See the [official checkout guide](https://docs.waffo.ai/checkout/checkout-flow).

The explicit `POST billing?action=restart-checkout` takes `{id: old_order_uuid, request_id: retry_uuid}`. The server validates the retry UUID before side effects, verifies every strongly bound attempt has no real successful or processing payment, closes each pending Waffo order with its own idempotency key and re-reads the complete terminal set, then creates one linked replacement under database locks. Verified zero-amount period0 authorizations are durable audit evidence, never membership payments. The client persists the retry request against its predecessor and reuses it after a timeout. Only the successful response changes the visible order URL. Returning from payment never grants membership.

The isolated test on 2026-10-07 confirmed a declined provider payment as failed with its order closed, without Cloud access. An explicit restart returned HTTP 200 with a new TokenTracker order UUID. A separate sandbox Visa payment was read back as succeeded for USD 4.99; a genuine provider-signed payment callback returned HTTP 200, and PostgreSQL recorded the order paid with Cloud access enabled. Actual merchant sandbox receipts cover monthly/annual recurring Visa, monthly fixed WeChat and annual fixed Visa. A USD2.00 partial monthly refund retained its paid term; full refunds of the monthly WeChat pass and both annual products reversed only their corresponding rights. Canceling both recurring modes retained their original paid dates. The annual fixed Back/replacement path succeeded with two provider attempts under one application UUID. Two other pending fixed attempts were canceled, then one successor was created; replay returned that same successor. These use an isolated application auth/SQL backend, not hosted production InsForge or real funds.

A late successful payment on the original order can conflict with the replacement. The ledger retains the true payment records and marks `retry_payment_conflict_at`; the UI requests bill review and private support and blocks further payment/retry controls. Account responses expose conflict orders separately from pending unpaid orders, including paid and closed conflicts. Reconcile both provider order/payment references and any subscriptions manually. Never hide a charge, assume there was only one payment, grant a second term to make totals look right, or record a refund that has not been verified.

The provider's Back recovery can create several Waffo order IDs for one merchant order reference. Each attempt is registered only after full merchant ownership/product/environment verification. Only the first real payment selects the canonical order; all genuine charges remain in the ledger. Fixed cancellation uses the actual merchant-provided buyer identity, followed by exact customer-visible order/store/product verification. The customer GraphQL schema does not expose merchant metadata; do not request it or replace merchant ownership checks with a guessed email.

Actual annual test renewal failure exposed a short collection-grace window. Unpaid grace is not cached as a purchased term. The subsequent successful test simulation also returned a precise13-minute paid window. Sandbox accounting preserves those provider-confirmed dates, never invents a year or grants access before a future period starts. Live requires a full purchased month/year, and its lower bound remains unchanged. The simulator differs from the documented full-period advance; verify a genuine live renewal cycle with the vendor before launch. See [Waffo Test Mode](https://docs.waffo.ai/features/test-mode).

### Historical payment providers

New purchases use Waffo. Existing Paddle, direct WeChat and Alipay orders, events, payments and subscriptions retain their original provider and currency. Keep the legacy verification credentials and handlers only where historical transactions require reconciliation, refunds or cancellation. Do not rewrite those records as Waffo, redirect an unresolved legacy purchase into a new Waffo charge, or require new direct merchant registrations for this Waffo rollout.

## Deployment sequence

These commands describe the full reviewed rollout. The existing-project sandbox stage above deploys only its two new handlers. Check `current` before any mutation; record the project privately. Do not apply unrelated pending migrations. Rehearse schema changes locally before the authorized hosted acceptance.

```bash
npx @insforge/cli current
npx @insforge/cli db migrations list
node --test test/cloud-billing-*.test.js
node scripts/build-cloud-functions.cjs
```

1. Save the target database backup, current policy values, deployed function sources, relevant schedule states, and frontend version to a private recovery location. Verify the backup is readable and test restoration on the isolated backend.
2. Apply the reviewed financial and device/access migrations, then the Waffo and safe-retry migrations, rechecking remote history, RLS, grants, indexes and both policy rows. Apply the archive migration only under its separate schema/parity/backup gate. These are incremental migrations for an existing TokenTracker backend, not a blank self-hosted schema bootstrap. They do not activate charging or install a historical deletion schedule.

```bash
npx @insforge/cli db migrations up 20261003120000_cloud-subscriptions.sql
npx @insforge/cli db migrations up 20261004120000_cloud-machine-access.sql
npx @insforge/cli db migrations up 20261007120000_cloud-waffo.sql
npx @insforge/cli db migrations up 20261007130000_cloud-waffo-retry.sql
npx @insforge/cli db migrations up 20261007140000_cloud-waffo-attempts.sql
npx @insforge/cli db migrations up 20261007150000_cloud-waffo-authorizations.sql
npx @insforge/cli db migrations up 20261007160000_cloud-waffo-sandbox-periods.sql
npx @insforge/cli db migrations up 20261008120000_self-hosted-access.sql
npx @insforge/cli db migrations up 20261008120001_validate-cloud-token-environment.sql
npx @insforge/cli db migrations up 20261008150000_cloud-pro-badges.sql
```

3. Set target secrets through secure backend configuration. Verify names and active status without printing values. Deploy all 18 reviewed handler artifacts enumerated by `build-cloud-functions.cjs`, including billing, Waffo webhook, issue/grant/poll/ingest, personal account and public leaderboard/profile handlers. Preserve required historical payment handlers. Use built artifacts containing the reviewed SDK runtime and resolved relative modules; do not deploy shared modules separately. Live Waffo also requires the DER SHA256 pin of the independently verified production private key in `WAFFO_LIVE_PRIVATE_KEY_SHA256`; a matching pin alone does not prove provider environment.

```bash
npx @insforge/cli functions deploy tokentracker-billing --file .tmp/cloud-functions/tokentracker-billing.js
npx @insforge/cli functions deploy tokentracker-waffo-webhook --file .tmp/cloud-functions/tokentracker-waffo-webhook.js
npx @insforge/cli functions list --json
```

4. Read back each function with `functions code <slug>` and compare it with its built artifact. Confirm status `active`. Independently request the catalog and an authenticated account. Check HTTP status and body; an unavailable secret or authentication failure is not a passing smoke test.
5. Deploy the tested UI and any upload/read/device enforcement changes in preview. Preview must preserve existing Cloud access and block paid checkout/trial activation. Verify the migration and frontend do not start historical deletion. Client changes also require the CLI and all desktop releases described in [CLAUDE.md](../CLAUDE.md).
6. Activate only the sandbox policy after authentication and environment isolation are verified, then complete the financial and UI gates against it. Keep production `live` in preview. Record real callback, ledger, membership, and provider receipt evidence.
7. After owner approval, choose and announce one launch time. Read back final production secrets/provider flags/catalog, and set the `live` policy to `active` with that `launch_at`. Preserve the exact launch timestamp; existing-device transition eligibility and end dates depend on it. Independently verify checkout remains closed before launch and opens at the intended time.
8. Keep history archival/deletion off until its separate gate passes. Record every live change and recheck free/community behavior, checkout, account expiration, and private support links. Publish the reviewed announcement only within its own authorization.

## Launch gates

| Gate | Evidence required | Result |
|---|---|---|
| Financial state in PostgreSQL | Real PostgreSQL concurrency/transaction tests, grants/RLS, one fulfillment per payment, cumulative refunds, stale events, environment isolation | Local SQL/HTTP passed; hosted multi-connection acceptance pending |
| Signed provider events | Genuine Waffo test notifications; mode/store/amount/signature mismatch rejected; API-bound order and period verified | Four test SKUs, failure/recovery and four refunds verified; production events pending |
| Checkout and recovery UI | New-tab/system-browser checkout and return on CLI/macOS/Windows/Linux/web; explicit declined-order replacement, stable retry after timeout, no hidden second subscription, Waffo cancellation and purchase-email portal login | Browser sandbox verified; packaged-client and Windows acceptance pending |
| Retry collisions and provider back flow | Real late-payment reconciliation; both charges remain visible; conflict blocks new checkout; multiple provider attempts verified independently, safely canceled/recovered without hiding real payments | Actual two-pending cancel/restart verified; SQL/HTTP race and replay tests passed; hosted concurrency pending |
| Entitlements and free use | Server gates personal cloud upload/read and registered synchronization devices; 5 slots; shared CLI/app identity; unchanged ranking formula; local/free community intact | Local SQL/HTTP passed, including future-period denial and explicit free self-hosting; deployed acceptance pending |
| Trial and transition | Explicit no-card 7-day start, existing-device 30-day transition, no implicit renewal, accurate dates and 30-day read-only export | Pending |
| Retention | Validated hourly-to-daily aggregation, 90 days/24 months boundaries, complete export, dry-run impact list, backup restore; no early data deletion | Pending |
| Live payment/refund | Owner manually pays; provider transaction matches immutable order, ledger and entitlement; full/partial refund handling independently checked | Pending |
| Settlement and terms | Approved payout account; provider statement and bank receipt; fees/revenue reconciliation; final renewal/refund/privacy/support terms | Pending |
| Public launch | Owner approves live activation time, final pricing, announced transition/retention dates, and publication | Pending |

Latest evidence and remaining owner/deployment actions are recorded in [the delivery handoff](cloud-delivery.md). The previous integrated `npm run ci:local` passed with 3,743 tests passing and two skipped. The new hosted-sandbox changes passed targeted groups of 63 financial SQL tests, 37 access/self-host tests and 43 sandbox/SDK tests. These are targeted groups, not a new full-repository CI result; the final full CI for this stage remains pending.

Local tests do not complete genuine provider, UI, or settlement gates. Every offered route needs its own evidence. A failed or unavailable route must remain unavailable in checkout.

## Rollback and incident handling

1. Read and preserve the live policy and incident timeline, then set its `phase` back to `preview` while retaining `launch_at`. Read back the catalog and confirm new checkout and trial requests are refused. In the current policy, preview restores legacy free personal Cloud access; it does not erase paid terms.
2. Stop only deployed archival/deletion jobs recorded in release evidence. Verify their active flags and subsequent execution logs. Do not delete usage, orders, events, payments, or subscriptions as a rollback step.
3. Keep valid webhook handlers and their verification secrets available so completed payments, refunds, and cancellations can still arrive. If a handler is faulty, restore its reviewed predecessor only if it understands the current schema and preserves payment verification; otherwise fix it forward and reconcile undelivered events. Never grant access from a success-page screenshot or weaken signature/amount checks.
4. Restore the frontend/account gate behavior tested in preview. Preserve local operation, exports and access to already-paid terms. Verify HTTP responses and account state independently after restoration.
5. Compare provider transaction/refund/subscription statements with the ledger. Use provider redelivery or authenticated provider reconciliation with stable IDs; retain duplicate protection. Do not manually duplicate payments or extend terms to compensate for a delayed webhook.
   `POST billing?action=reconcile` accepts the owner's order UUID as `{id}` and queries the provider, with a 30-second per-order cooldown. A new recurring checkout is refused while an earlier created checkout remains unresolved. A provider-confirmed canceled transaction can close an unpaid order. Use the explicit restart endpoint for its unique successor; do not create unrelated replacement orders manually. Any `retry_payment_conflict_at` requires reviewing both payment paths and resolving refunds/subscriptions privately before new checkout is allowed. Full refunds are separate from membership and renewal status; a refund does not itself cancel recurring billing. Account removal must handle recurring subscriptions and retained financial records first; financial FKs prevent silent cascading deletion. The usage erasure runner leaves auth and billing records intact.
6. Decide with the owner how to handle current recurring subscriptions, including any historical provider subscriptions. Setting TokenTracker to preview does not stop provider renewals or refund payments. Any provider cancellation/refund must have its own authorization and independently verified result.
7. Before reactivation, close the incident cause, repeat affected gates, and review transition impact. Do not silently move `launch_at`, shorten export windows, or replay an announcement with obsolete dates.

## Owner actions to collect at the end

- [ ] Complete Waffo KYB and production/product/site approval with the identity and settlement details requested by the provider. Supply sensitive records only in its portal or an approved private channel.
- [ ] Confirm separate test/live products, private keys, webhook configuration and payout settings; verify `prodEnabled` and actual live product eligibility.
- [ ] Confirm global base prices, checkout tax display, payment-method availability, renewal/cancellation/refund terms, private billing support, and the separate retention/deletion announcement.
- [ ] Manually pay the agreed pilot transactions and approve refunds; provide statement and bank settlement confirmation privately when due.
- [ ] Approve production activation and the public announcement after all applicable gates pass.

Waffo SDK 0.25.0, its integration skill, official MoR information, developer terms and privacy links were checked on 2026-10-07. Recheck eligibility, contract fees and settlement terms before launch; merchant approval and genuine payment/refund/settlement evidence remain to be recorded.
