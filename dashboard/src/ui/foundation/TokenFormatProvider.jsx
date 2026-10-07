import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../hooks/useLocale.js";
import { copy } from "../../lib/copy";
import { isNativeEmbed, isNativeWindowsApp, setNativeSetting } from "../../lib/native-bridge.js";
import {
  TOKEN_FORMAT_MODES,
  TOKEN_FORMAT_STORAGE_KEY,
  TOKEN_GROUPINGS,
  TOKEN_GROUPING_STORAGE_KEY,
  TOKEN_UNIT_SYSTEMS,
  TOKEN_UNIT_SYSTEM_STORAGE_KEY,
  formatTokenCount,
  formatTokenTooltip,
  migrateLegacyChineseTokenFormat,
  normalizeTokenGrouping,
  normalizeTokenFormatMode,
  normalizeTokenUnitSystem,
  persistTokenFormatMode,
  persistTokenGrouping,
  persistTokenUnitSystem,
  readTokenFormatMode,
  readTokenGrouping,
  readTokenUnitSystem,
} from "../../lib/token-format.js";

export const TokenFormatContext = createContext(null);

export function TokenFormatProvider({ children }) {
  const { resolvedLocale } = useLocale();
  const [mode, setModeState] = useState(() => {
    migrateLegacyChineseTokenFormat();
    return readTokenFormatMode();
  });
  const [unitSystem, setUnitSystemState] = useState(readTokenUnitSystem);
  const [grouping, setGroupingState] = useState(readTokenGrouping);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === TOKEN_FORMAT_STORAGE_KEY) {
        setModeState(normalizeTokenFormatMode(event.newValue));
        if (event.newValue === TOKEN_UNIT_SYSTEMS.CHINESE) {
          setUnitSystemState(TOKEN_UNIT_SYSTEMS.CHINESE);
        }
      }
      if (event.key === TOKEN_UNIT_SYSTEM_STORAGE_KEY) {
        setUnitSystemState(normalizeTokenUnitSystem(event.newValue));
      }
      if (event.key === TOKEN_GROUPING_STORAGE_KEY) {
        setGroupingState(normalizeTokenGrouping(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The macOS menu bar formats its own numbers; mirror the unit choice there on
  // every change and on mount, since UserDefaults may predate the setting.
  useEffect(() => {
    if (isNativeEmbed() || isNativeWindowsApp()) setNativeSetting("tokenUnitSystem", unitSystem);
  }, [unitSystem]);

  const setMode = useCallback((value) => {
    const next = persistTokenFormatMode(value);
    setModeState(next);
  }, []);

  const setUnitSystem = useCallback((value) => {
    const next = persistTokenUnitSystem(value);
    setUnitSystemState(next);
  }, []);

  const setGrouping = useCallback((value) => {
    const next = persistTokenGrouping(value);
    setGroupingState(next);
  }, []);

  const suffixes = useMemo(
    () => ({
      thousandSuffix: copy("shared.unit.thousand_abbrev"),
      millionSuffix: copy("shared.unit.million_abbrev"),
      billionSuffix: copy("shared.unit.billion_abbrev"),
      trillionSuffix: copy("shared.unit.trillion_abbrev"),
    }),
    [resolvedLocale],
  );

  const formatTokens = useCallback(
    (value, options = {}) =>
      formatTokenCount(value, { mode, unitSystem, grouping, ...suffixes, ...options }),
    [grouping, mode, suffixes, unitSystem],
  );
  const formatTokensTooltip = useCallback(
    (value, options = {}) =>
      formatTokenTooltip(value, { mode, unitSystem, grouping, ...suffixes, ...options }),
    [grouping, mode, suffixes, unitSystem],
  );

  const value = useMemo(
    () => ({
      grouping,
      mode,
      setGrouping,
      setMode,
      setUnitSystem,
      unitSystem,
      formatTokens,
      formatTokensTooltip,
    }),
    [formatTokens, formatTokensTooltip, grouping, mode, setGrouping, setMode, setUnitSystem, unitSystem],
  );

  return <TokenFormatContext.Provider value={value}>{children}</TokenFormatContext.Provider>;
}

export function TokenFormatModeOverride({ children, mode }) {
  const parent = useContext(TokenFormatContext);
  const scopedMode = normalizeTokenFormatMode(mode);
  const unitSystem = parent?.unitSystem ?? readTokenUnitSystem();
  const grouping = parent?.grouping ?? readTokenGrouping();

  const formatTokens = useCallback(
    (value, options = {}) => {
      if (parent) return parent.formatTokens(value, { ...options, mode: scopedMode });
      return formatTokenCount(value, { unitSystem, grouping, ...options, mode: scopedMode });
    },
    [parent, scopedMode, unitSystem],
  );
  const formatTokensTooltip = useCallback(
    (value, options = {}) => {
      if (parent) return parent.formatTokensTooltip(value, { ...options, mode: scopedMode });
      return formatTokenTooltip(value, { unitSystem, grouping, ...options, mode: scopedMode });
    },
    [parent, scopedMode, unitSystem],
  );
  const value = useMemo(
    () => ({
      mode: scopedMode,
      unitSystem,
      grouping,
      setMode: parent?.setMode ?? (() => {}),
      setGrouping: parent?.setGrouping ?? (() => {}),
      setUnitSystem: parent?.setUnitSystem ?? (() => {}),
      formatTokens,
      formatTokensTooltip,
    }),
    [
      formatTokens,
      formatTokensTooltip,
      parent?.setGrouping,
      parent?.setMode,
      parent?.setUnitSystem,
      grouping,
      unitSystem,
      scopedMode,
    ],
  );

  return <TokenFormatContext.Provider value={value}>{children}</TokenFormatContext.Provider>;
}

export { TOKEN_FORMAT_MODES };
