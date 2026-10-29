export async function fetchHistoryUnified(
  market: string,
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ symbol: string, data: Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>, source: string, count: number }> {
  const normalized = symbol.toUpperCase().replace(/-/g, "").replace(/\//g, "");

  try {
    return { symbol: normalized, data: [], source: "none", count: 0 };
  } catch (e: any) {
    console.error(`[DATA] Unified fetch crashed for ${market}/${symbol}: ${e?.message || e}`);
    return { symbol: normalized, data: [], source: "none", count: 0 };
  }
}