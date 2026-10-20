/** Scanner rotation — Quality with Quantity spec.
 *
 * Every market scans at most WINDOW_SIZE coins per pass, and the window
 * rotates on each call so the scanner never keeps re-scanning the same 50
 * coins (which would otherwise force low-quality filler signals on quiet
 * markets). Crypto currently has exactly 50 universe members, so the window
 * covers all of them; the rotation matters when a market's universe grows
 * beyond 50 and on cold starts across serverless instances.
 */
import { scanUniverse, type ScanTarget, type ScanMarket } from "./universe";

export const SCAN_WINDOW_SIZE = 50;

const MARKETS: ScanMarket[] = ["crypto", "forex", "stocks", "metals"];
/** Per-market rotation offset (in-memory; resets on cold start). */
const rotationOffset = new Map<ScanMarket, number>(
  MARKETS.map((m) => [m, 0])
);

/** Up to 50 targets for `market`, rotating the start index each call. */
export function rotationWindow(market: ScanMarket): ScanTarget[] {
  const all = scanUniverse.filter((t) => t.market === market);
  if (all.length <= SCAN_WINDOW_SIZE) return all;
  const start = (rotationOffset.get(market) ?? 0) % all.length;
  rotationOffset.set(market, (start + SCAN_WINDOW_SIZE) % all.length);
  return all.slice(start, start + SCAN_WINDOW_SIZE);
}

/** Symbols currently in the rotation window for `market`. */
export function rotationWindowSymbols(market: ScanMarket): Set<string> {
  return new Set(rotationWindow(market).map((t) => t.symbol));
}

/** Reset rotation (used by tests). */
export function resetRotation(): void {
  MARKETS.forEach((m) => rotationOffset.set(m, 0));
}
