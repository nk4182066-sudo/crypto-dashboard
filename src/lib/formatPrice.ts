/**
 * lib/formatPrice.ts — ONE price formatter + rounder for every screen (MASLA 5).
 *
 * The old per-page `money()`/`fmtPrice()` helpers used a flat `toFixed(4)` for
 * anything under $1, which collapsed micro-cap coins to $0.0000:
 *   SHIB $0.00001234  ->  "$0.0000"   (exactly the reported zero-price bug)
 * and `maximumFractionDigits: 0` above $1000 stripped BTC's cents:
 *   BTC  $82,571.50   ->  "$82,572"
 *
 * This formatter keeps enough precision that every asset shows a REAL, non-zero
 * price and the SL/TP levels stay distinct from the entry:
 *   BTC  $82,571.50   ->  "$82,571.50"   (2 decimals)
 *   SHIB $0.00001234  ->  "$0.00001234"  (8 decimals)
 *
 * Educational analysis only — not financial advice.
 */

/**
 * Format a USD price with magnitude-appropriate decimals so it is never
 * rounded to $0.0000. Returns "—" for missing / non-finite / non-positive.
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const abs = Math.abs(value);
  let decimals: number;
  if (abs >= 1) decimals = 2; // BTC 82571.50, ETH 3234.56
  else if (abs >= 0.01) decimals = 4; // XRP 0.5432
  else if (abs >= 0.0001) decimals = 6; // 0.000987
  else decimals = 8; // SHIB 0.00001234, PEPE
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Round a price to the same magnitude-appropriate precision used for display,
 * so SL/TP stay distinct from the entry even on micro-cap coins (SHIB). Keeps
 * full 8-decimal precision for sub-$0.0001 assets.
 */
export function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  if (abs >= 1000) return Math.round(value * 100) / 100; // 2 decimals
  if (abs >= 1) return Math.round(value * 10000) / 10000; // 4 decimals
  if (abs >= 0.01) return Math.round(value * 100000) / 100000; // 5 decimals
  if (abs >= 0.0001) return Math.round(value * 1000000) / 1000000; // 6 decimals
  return Math.round(value * 100000000) / 100000000; // 8 decimals (SHIB-like)
}
