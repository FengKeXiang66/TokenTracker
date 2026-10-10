import React, { useEffect, useId, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useInsforgeAuth } from "../../contexts/InsforgeAuthContext.jsx";
import { INSFORGE_INSTANCE_CHANGED_EVENT, isCurrentInsforgeClient } from "../../lib/insforge-config";
import { CloudUsageExportError, fetchCloudUsageExport, downloadCloudUsageExport } from "../../lib/cloud-usage-export";
import { copy } from "../../lib/copy";
import { Button } from "../../ui/components/Button.jsx";

function errorText(error) {
  if (error?.status === 401) return copy("cloud.export.error_auth");
  if (error?.status === 402 || error?.status === 403) return copy("cloud.export.error_access");
  if (error?.code === "export_invalid_dates") return copy("cloud.export.error_dates");
  if (error?.status === 409) return copy("cloud.export.error_changed");
  return copy("cloud.export.error_failed");
}

export function CloudUsageExport({ from, to, deviceId = null, auth: providedAuth }) {
  const contextAuth = useInsforgeAuth();
  const auth = providedAuth || contextAuth;
  const userId = auth?.signedIn ? auth.user?.id : null;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(from || defaultFrom);
  const [end, setEnd] = useState(to || today);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const id = useId();
  const owner = useRef(null);
  const generation = useRef(0);
  const controller = useRef(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  owner.current = { userId, client: auth?.client, start, end, deviceId, from, to };
  useEffect(() => {
    mounted.current = true;
    const changed = () => { ++generation.current; controller.current?.abort(); lock.current = false;
      setBusy(false); setNotice(null); setError(null); };
    window.addEventListener(INSFORGE_INSTANCE_CHANGED_EVENT, changed);
    return () => { mounted.current = false; ++generation.current; controller.current?.abort();
      window.removeEventListener(INSFORGE_INSTANCE_CHANGED_EVENT, changed); };
  }, []);
  useEffect(() => {
    ++generation.current; controller.current?.abort(); lock.current = false;
    setBusy(false); setError(null); setNotice(null);
    if (from) setStart(from);
    if (to) setEnd(to);
  }, [userId, auth?.client, from, to, deviceId]);
  if (!userId || auth?.enabled === false) return null;

  function updateDate(setDate, value) {
    ++generation.current; controller.current?.abort(); lock.current = false;
    setBusy(false); setError(null); setNotice(null); setDate(value);
  }

  async function download(format) {
    if (lock.current) return;
    lock.current = true;
    const captured = owner.current;
    const operation = ++generation.current;
    const signalController = new AbortController();
    controller.current = signalController;
    setBusy(true); setError(null); setNotice(null);
    const check = () => {
      const current = owner.current;
      if (!mounted.current || operation !== generation.current || !current ||
          Object.keys(captured).some(key => captured[key] !== current[key]) ||
          captured.client && !isCurrentInsforgeClient(captured.client))
        throw new CloudUsageExportError("export_cancelled", 409);
    };
    try {
      const data = await fetchCloudUsageExport({ userId: captured.userId, auth: auth.getAccessToken,
        from: captured.start, to: captured.end, deviceId: captured.deviceId,
        signal: signalController.signal, assertCurrent: check });
      check();
      await downloadCloudUsageExport(data, format, { signal: signalController.signal, assertCurrent: check });
      check();
      const range = data.metadata.effective_range;
      const message = data.rows.length ? copy("cloud.export.success", { count: data.rows.length, from: range.from, to: range.to })
        : copy("cloud.export.empty");
      setNotice(range.from !== captured.start || range.to !== captured.end
        ? `${message} ${copy("cloud.export.truncated", { from: range.from, to: range.to })}` : message);
    } catch (reason) {
      if (mounted.current && operation === generation.current) setError(errorText(reason));
    } finally {
      if (operation === generation.current) { lock.current = false; if (mounted.current) setBusy(false); }
    }
  }
  const neutral = "hover:!text-oai-black dark:hover:!text-oai-white hover:!bg-oai-gray-100 dark:hover:!bg-oai-gray-800 focus:!ring-oai-gray-500/40";
  return <section className="tt-cloud-theme" aria-label={copy("cloud.export.open")}>
    <Button type="button" variant="ghost" size="sm" className={neutral} aria-expanded={expanded}
      aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <Download className="mr-2 h-4 w-4" aria-hidden="true" />{copy("cloud.export.open")}
    </Button>
    {expanded ? <div id={id} className="mt-2 border-l-2 border-oai-gray-200 pl-3 dark:border-oai-gray-700" aria-busy={busy}>
      <p className="max-w-prose text-xs leading-5 text-oai-gray-600 dark:text-oai-gray-300">{copy("cloud.export.description")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-oai-gray-700 dark:text-oai-gray-200">{copy("cloud.export.from")}
          <input type="date" value={start} onChange={event => updateDate(setStart, event.target.value)}
            className="mt-1 block rounded-md border border-oai-gray-300 bg-white px-2 py-1.5 text-sm text-oai-black focus:outline-none focus:ring-2 focus:ring-inset focus:ring-oai-gray-500/40 dark:border-oai-gray-700 dark:bg-oai-gray-900 dark:text-oai-white" />
        </label>
        <label className="text-xs text-oai-gray-700 dark:text-oai-gray-200">{copy("cloud.export.to")}
          <input type="date" value={end} onChange={event => updateDate(setEnd, event.target.value)}
            className="mt-1 block rounded-md border border-oai-gray-300 bg-white px-2 py-1.5 text-sm text-oai-black focus:outline-none focus:ring-2 focus:ring-inset focus:ring-oai-gray-500/40 dark:border-oai-gray-700 dark:bg-oai-gray-900 dark:text-oai-white" />
        </label>
        <Button type="button" variant="ghost" size="sm" className={neutral} disabled={busy} onClick={() => download("csv")}>{copy("cloud.export.csv")}</Button>
        <Button type="button" variant="ghost" size="sm" className={neutral} disabled={busy} onClick={() => download("json")}>{copy("cloud.export.json")}</Button>
      </div>
      {busy ? <p role="status" className="mt-2 text-xs text-oai-gray-600 dark:text-oai-gray-300">{copy("cloud.export.busy")}</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
      {notice ? <p role="status" className="mt-2 text-xs text-oai-gray-600 dark:text-oai-gray-300">{notice}</p> : null}
    </div> : null}
  </section>;
}
