/**
 * Normalises the many shapes a symbol can arrive in into the one the market
 * API expects.
 *
 *   "btc/usd" · "BTC-USD" · "BTCUSD" · "BTC/USDT"  ->  "BTC-USD"
 *
 * Quote suffixes are normalised to `-USD` because that is the internal
 * contract; the server then maps it to the exchange pair it needs
 * (`BTC-USD` -> Binance `BTCUSDT`, Yahoo `BTC-USD`). Doing the exchange-pair
 * mapping here would hard-code one provider into the browser.
 */
const FIAT_SUFFIXES = ["USDT", "USDC", "BUSD", "USD", "EUR", "GBP", "JPY"];

export function normalizeSymbol(raw: string, market: "crypto" | "forex" | "stocks" | "" = ""): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    // Yahoo-style suffixes such as "=X" or "=F" are dropped; the quote is
    // re-added below in the canonical form.
    .replace(/[=]([A-Z])$/, "")
    .replace(/[^A-Z0-9./-]/g, "");

  if (!cleaned) return "";

  // Equities are addressed by their bare ticker. Appending a quote turns
  // "AAPL" into "AAPL-USD", which Yahoo does not recognise (404).
  if (market === "stocks") {
    const separators = cleaned.split(/[./-]/).filter(Boolean);
    return separators[0] ?? cleaned;
  }

  const separators = cleaned.split(/[./-]/).filter(Boolean);
  if (separators.length === 0) return "";

  // Already canonical (BASE-QUOTE) and not an all-in-one ticker.
  if (separators.length === 2) {
    const [base, quote] = separators;
    return quote === "USDT" || quote === "USDC" ? `${base}-USD` : `${base}-${quote}`;
  }

  // Single token: peel off a known fiat suffix if one is present.
  const single = separators[0];
  for (const fiat of FIAT_SUFFIXES) {
    if (single.length > fiat.length && single.endsWith(fiat)) {
      return `${single.slice(0, -fiat.length)}-USD`;
    }
  }
  // No quote present — assume a USD pair.
  return `${single}-USD`;
}

/** Seconds each candle spans, used to timestamp generated fallback candles. */
export function intervalSecondsFor(timeframe: string): number {
  switch (timeframe) {
    case "15m":
      return 15 * 60;
    case "1h":
      return 60 * 60;
    case "4h":
      return 4 * 60 * 60;
    case "1d":
      return 24 * 60 * 60;
    case "max":
      return 24 * 60 * 60;
    default:
      return 60 * 60;
  }
}