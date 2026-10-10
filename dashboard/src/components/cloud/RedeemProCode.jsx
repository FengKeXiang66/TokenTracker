import React, { useEffect, useId, useRef, useState } from "react";
import { CloudBillingError, cloudBillingRequest } from "../../lib/cloud-billing";
import { resolveAuthAccessToken } from "../../lib/auth-token";
import { getInsforgeRemoteUrl } from "../../lib/insforge-config";
import { copy } from "../../lib/copy";
import { Button } from "../../ui/components/Button.jsx";
import { BillingNotice, formatCloudDate } from "./CloudBillingParts.jsx";

function normalizedCode(value) { return value.replace(/[\t\n\r\f\v -]/g, "").toUpperCase(); }

export function RedeemProCode({ account, auth, refresh }) {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const inputId = useId();
  const operation = useRef(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const accountKey = `${getInsforgeRemoteUrl()}.${account?.environment || "unknown"}.${auth?.signedIn ? auth.user?.id : ""}`;
  const currentAccount = useRef(accountKey);
  currentAccount.current = accountKey;
  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    operation.current = null;
    lock.current = false;
    setExpanded(false);
    setCode("");
    setBusy(false);
    setError(null);
    setReceipt(null);
    setConfirmed(false);
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [accountKey]);
  const selfHosted = account?.membership?.status === "self_hosted" ||
    account?.membership?.hosting_mode === "self_hosted";
  if (!auth?.signedIn || selfHosted || account?.gift_redemption_available !== true) return null;
  const restriction = account.redemption_restriction;
  const confirmReceipt = async (gift, valid) => {
    const latest = await refresh();
    if (!valid()) return;
    // Account reload supplies access and gift state, never the optimistic POST result.
    setConfirmed(Boolean(latest?.gifts?.some((item) => item.id === gift?.id)));
  };
  const perform = async (redeem) => {
    if (lock.current || (redeem && (restriction || !code.trim()))) return;
    lock.current = true;
    const id = ++generation.current;
    const owner = accountKey;
    const valid = () => mounted.current && generation.current === id && currentAccount.current === owner;
    setBusy(true);
    setError(null);
    try {
      if (redeem) {
        const value = code.trim();
        if (!operation.current || normalizedCode(operation.current.code) !== normalizedCode(value))
          operation.current = { code: value, request_id: crypto.randomUUID() };
        const response = await cloudBillingRequest("redeem-gift", {
          auth: async () => {
            const token = await resolveAuthAccessToken(auth.getAccessToken);
            if (!valid()) throw new CloudBillingError("authentication_required", 401);
            return token;
          },
          body: operation.current,
        });
        if (!valid()) return;
        if (!response?.gift?.id) throw new CloudBillingError("billing_operation_failed");
        setReceipt(response);
        setConfirmed(false);
        setCode("");
        operation.current = null;
        await confirmReceipt(response.gift, valid);
      } else {
        await confirmReceipt(receipt?.gift, valid);
      }
    } catch (reason) {
      if (valid()) setError(reason);
    } finally {
      if (valid()) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <div className="mt-4">
      <Button type="button" variant="ghost" aria-expanded={expanded}
        aria-controls={expanded ? `${inputId}-panel` : undefined}
        onClick={() => setExpanded((value) => !value)} disabled={busy}>
        {copy("cloud.gift.redeem_action")}
      </Button>
      {expanded ? (
        <div id={`${inputId}-panel`} className="mt-3 space-y-3">
          <p id={`${inputId}-detail`} className="text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">
            {copy("cloud.gift.detail")}
          </p>
          {restriction ? <BillingNotice error={{ code: restriction }} context="gift" /> : null}
          {!receipt ? (
            <form onSubmit={(event) => { event.preventDefault(); void perform(true); }} aria-busy={busy}>
              <label htmlFor={inputId} className="text-sm font-medium">{copy("cloud.gift.code_label")}</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input id={inputId} value={code} disabled={busy || Boolean(restriction)} maxLength={128}
                  autoComplete="off" spellCheck={false} autoCapitalize="characters"
                  data-ph-no-capture="true"
                  aria-describedby={`${inputId}-detail${error ? ` ${inputId}-error` : ""}`}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    if (normalizedCode(event.target.value) !== normalizedCode(code)) operation.current = null;
                    setCode(event.target.value);
                    setError(null);
                  }}
                  className="min-h-10 min-w-0 flex-1 rounded-md border border-oai-gray-300 bg-transparent px-3 font-mono text-sm outline-none focus:border-oai-brand focus:ring-2 focus:ring-inset focus:ring-oai-brand/30 dark:border-oai-gray-700" />
                <Button type="submit" variant="secondary" disabled={busy || !code.trim() || Boolean(restriction)}>
                  {copy(busy ? "cloud.gift.redeeming" : "cloud.gift.confirm")}
                </Button>
              </div>
            </form>
          ) : (
            <div role="status" className="space-y-2 text-sm leading-6">
              <p>{copy(confirmed ? receipt.already_redeemed ? "cloud.gift.already_redeemed" : "cloud.gift.redeemed" : "cloud.gift.refresh_needed")}</p>
              {receipt.gift ? <p className="text-xs text-oai-gray-600 dark:text-oai-gray-300">
                {copy("cloud.gift.term", { days: receipt.gift.duration_days,
                  start: formatCloudDate(receipt.gift.starts_at), end: formatCloudDate(receipt.gift.ends_at) })}
              </p> : null}
              {!confirmed ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void perform(false)}>
                {copy("cloud.action.refresh_membership")}
              </Button> : <Button type="button" variant="ghost" onClick={() => { setReceipt(null); setConfirmed(false); }}>
                {copy("cloud.gift.redeem_another")}
              </Button>}
            </div>
          )}
          {error ? <div id={`${inputId}-error`}><BillingNotice error={error} context="gift" /></div> : null}
        </div>
      ) : null}
    </div>
  );
}
