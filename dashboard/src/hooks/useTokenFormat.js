import { useContext } from "react";
import { TokenFormatContext } from "../ui/foundation/TokenFormatProvider.jsx";
import {
  TOKEN_FORMAT_MODES,
  TOKEN_GROUPINGS,
  formatTokenCount,
  formatTokenTooltip,
} from "../lib/token-format.js";

const FALLBACK_VALUE = Object.freeze({
  mode: TOKEN_FORMAT_MODES.COMPACT,
  setMode: () => {},
  grouping: TOKEN_GROUPINGS.THOUSAND,
  setGrouping: () => {},
  formatTokens: (value, options = {}) => formatTokenCount(value, options),
  formatTokensTooltip: (value, options = {}) => formatTokenTooltip(value, options),
});

export function useTokenFormat() {
  return useContext(TokenFormatContext) ?? FALLBACK_VALUE;
}
