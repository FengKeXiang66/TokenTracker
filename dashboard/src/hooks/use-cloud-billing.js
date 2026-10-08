import { useCallback, useEffect, useRef, useState } from "react";
import { useInsforgeAuth } from "../contexts/InsforgeAuthContext.jsx";
import { cloudBillingRequest } from "../lib/cloud-billing";

export function useCloudCatalog() {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    cloudBillingRequest("catalog", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setCatalog(value);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setCatalog(null);
          setError({ ...reason, code: "billing_catalog_unavailable" });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return {
    catalog,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}

export function useCloudAccount({ enabled = true } = {}) {
  const auth = useInsforgeAuth();
  const [accountRecord, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const userId = auth?.signedIn ? auth.user?.id : null;
  const account = accountRecord?.userId === userId ? accountRecord.value : null;
  const getAccessToken = auth?.getAccessToken;
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    if (!enabled || !userId) {
      setAccount(null);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const value = await cloudBillingRequest("account", {
        auth: getAccessToken,
      });
      if (id === generation.current) {
        setAccount({ userId, value });
        setError(null);
      }
      return value;
    } catch (reason) {
      if (id === generation.current) setError(reason);
      return null;
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [enabled, userId, getAccessToken]);
  useEffect(() => {
    setAccount(null);
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);
  useEffect(() => {
    if (!enabled || !userId) return;
    const onReturn = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [enabled, userId, refresh]);
  return { account, loading, error, refresh, auth };
}
