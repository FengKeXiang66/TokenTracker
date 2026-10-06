import {
  formatChineseNumber,
  formatCompactNumber,
  toDisplayNumberWithOptions,
} from "./format";

export const TOKEN_FORMAT_MODES = Object.freeze({
  COMPACT: "compact",
  FULL: "full",
});

export const TOKEN_UNIT_SYSTEMS = Object.freeze({
  ENGLISH: "english",
  CHINESE: "chinese",
});

export const TOKEN_FORMAT_STORAGE_KEY = "tt.tokenFormat";
export const TOKEN_UNIT_SYSTEM_STORAGE_KEY = "tt.tokenUnitSystem";
export const TOKEN_GROUPING_STORAGE_KEY = "tt.tokenGrouping";

export const TOKEN_GROUPINGS = Object.freeze({
  THOUSAND: "thousand",
  WAN: "wan",
});

export function normalizeTokenFormatMode(value) {
  // Pre-0.96.3 releases stored the Wan/Yi display as a third mode value;
  // map it onto compact + Chinese unit system.
  if (value === TOKEN_UNIT_SYSTEMS.CHINESE) return TOKEN_FORMAT_MODES.COMPACT;
  return value === TOKEN_FORMAT_MODES.FULL ? TOKEN_FORMAT_MODES.FULL : TOKEN_FORMAT_MODES.COMPACT;
}

export function normalizeTokenUnitSystem(value) {
  return value === TOKEN_UNIT_SYSTEMS.CHINESE
    ? TOKEN_UNIT_SYSTEMS.CHINESE
    : TOKEN_UNIT_SYSTEMS.ENGLISH;
}

export function normalizeTokenGrouping(value) {
  return value === TOKEN_GROUPINGS.WAN ? TOKEN_GROUPINGS.WAN : TOKEN_GROUPINGS.THOUSAND;
}

export function readTokenFormatMode() {
  if (typeof window === "undefined") return TOKEN_FORMAT_MODES.COMPACT;
  try {
    return normalizeTokenFormatMode(window.localStorage?.getItem(TOKEN_FORMAT_STORAGE_KEY));
  } catch (_error) {
    return TOKEN_FORMAT_MODES.COMPACT;
  }
}

export function persistTokenFormatMode(value) {
  const mode = normalizeTokenFormatMode(value);
  if (typeof window === "undefined") return mode;
  try {
    window.localStorage?.setItem(TOKEN_FORMAT_STORAGE_KEY, mode);
  } catch (_error) {
    // localStorage can be unavailable in private/locked-down browser contexts.
  }
  return mode;
}

export function readTokenUnitSystem() {
  if (typeof window === "undefined") return TOKEN_UNIT_SYSTEMS.ENGLISH;
  try {
    const stored = window.localStorage?.getItem(TOKEN_UNIT_SYSTEM_STORAGE_KEY);
    if (stored) return normalizeTokenUnitSystem(stored);
    // Fall back to the legacy third-mode value until migration rewrites it.
    if (window.localStorage?.getItem(TOKEN_FORMAT_STORAGE_KEY) === TOKEN_UNIT_SYSTEMS.CHINESE) {
      return TOKEN_UNIT_SYSTEMS.CHINESE;
    }
    return TOKEN_UNIT_SYSTEMS.ENGLISH;
  } catch (_error) {
    return TOKEN_UNIT_SYSTEMS.ENGLISH;
  }
}

export function readTokenGrouping() {
  if (typeof window === "undefined") return TOKEN_GROUPINGS.THOUSAND;
  try {
    return normalizeTokenGrouping(window.localStorage?.getItem(TOKEN_GROUPING_STORAGE_KEY));
  } catch (_error) {
    return TOKEN_GROUPINGS.THOUSAND;
  }
}

export function persistTokenUnitSystem(value) {
  const unitSystem = normalizeTokenUnitSystem(value);
  if (typeof window === "undefined") return unitSystem;
  try {
    window.localStorage?.setItem(TOKEN_UNIT_SYSTEM_STORAGE_KEY, unitSystem);
  } catch (_error) {
    // localStorage can be unavailable in private/locked-down browser contexts.
  }
  return unitSystem;
}

export function persistTokenGrouping(value) {
  const grouping = normalizeTokenGrouping(value);
  if (typeof window === "undefined") return grouping;
  try {
    window.localStorage?.setItem(TOKEN_GROUPING_STORAGE_KEY, grouping);
  } catch (_error) {
    // localStorage can be unavailable in private/locked-down browser contexts.
  }
  return grouping;
}

export function migrateLegacyChineseTokenFormat() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem(TOKEN_FORMAT_STORAGE_KEY) !== TOKEN_UNIT_SYSTEMS.CHINESE) {
      return false;
    }
    window.localStorage?.setItem(TOKEN_UNIT_SYSTEM_STORAGE_KEY, TOKEN_UNIT_SYSTEMS.CHINESE);
    window.localStorage?.setItem(TOKEN_FORMAT_STORAGE_KEY, TOKEN_FORMAT_MODES.COMPACT);
    return true;
  } catch (_error) {
    return false;
  }
}

export function formatTokenCount(
  value,
  {
    mode = TOKEN_FORMAT_MODES.COMPACT,
    unitSystem,
    grouping,
    forceFull = false,
    decimals = 1,
    thousandSuffix = "K",
    millionSuffix = "M",
    billionSuffix = "B",
    trillionSuffix = "T",
  } = {},
) {
  if (forceFull || normalizeTokenFormatMode(mode) === TOKEN_FORMAT_MODES.FULL) {
    return toDisplayNumberWithOptions(value, {
      groupSize: grouping === TOKEN_GROUPINGS.WAN ? 4 : 3,
    });
  }
  if (
    mode === TOKEN_UNIT_SYSTEMS.CHINESE ||
    normalizeTokenUnitSystem(unitSystem) === TOKEN_UNIT_SYSTEMS.CHINESE
  ) {
    return formatChineseNumber(value, { decimals });
  }
  return formatCompactNumber(value, {
    decimals,
    thousandSuffix,
    millionSuffix,
    billionSuffix,
    trillionSuffix,
  });
}

export function formatTokenTooltip(value, options = {}) {
  const full = formatTokenCount(value, {
    ...options,
    mode: TOKEN_FORMAT_MODES.FULL,
    forceFull: true,
  });
  const display = formatTokenCount(value, options);
  if (display === full || display === "-" || full === "-") return full;
  return `${display} · ${full}`;
}
