// Write the remaining functions to the file
const fs = require('fs');

const content = `
// ----------------------------------------------------------------------
// 5. METALS - TwelveData + Bybit fallback
// ----------------------------------------------------------------------
export async function fetchMetalHistory(
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ candles: Array<{ time: number, open: number, high: number, low: number, volume: number }>; source: string }> {
  const tdSymbol = METAL_TWELVEDATA_MAP[symbol] || symbol;
  let candles: Array<{ time: number, open: number, high: number, low: number, volume: number }> = [];
  let source = "none";

  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();

  if (apiKey) {
    const url = "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(tdSymbol) + "&interval=" + timeframe + "&outputsize=" + limit + "&apikey=" + apiKey;
    const res = await fetchWithErrorLog(url, "twelvedata", {});
    if (res) {
      try {
        const j = await res.json();
        if (j?.status === "error" || !Array.isArray(j?.values)) {
          console.error("[DATA] twelvedata error for " + symbol + " (" + tdSymbol + "): " + (j?.message || "unknown error"));
        } else {
          const data = j.values.map((v: any) => ({
            time: new Date(v.datetime).getTime(),
            open: Number(v.open),
            high: Number(v.high),
            low: Number(v.low),
            close: Number(v.close),
            volume: Number(v.volume ?? 0),
          })).filter((c: any) => Number.isFinite(c.close)).reverse();
          if (data.length > 0) { console.log("[DATA] twelvedata Success: " + symbol + " (" + tdSymbol + ") Length: " + data.length); return { candles: data, source: "twelvedata" }; }
          console.error("[DATA] twelvedata returned empty data for " + symbol + " (" + tdSymbol + ")");
        }
      } catch (e: any) { console.error("[DATA] twelvedata parse failed for " + symbol + " (" + tdSymbol + "): " + (e?.message || e)); }
    }
  } else {
    console.error("[DATA] twelvedata skipped for " + symbol + " - no API key");
  }

  // If TwelveData fails, try Bybit for Gold PAXG and Silver XAGUSDT
  if (symbol === "XAUUSD" || symbol === "XAGUSD") {
    const bybitSymbol = symbol === "XAUUSD" ? "PAXGUSDT" : "XAGUSDT";
    const url = "https://api.bybit.com/v5/market/kline?category=spot&symbol=" + bybitSymbol + "&interval=60&limit=" + limit;
    const res = await fetchWithErrorLog(url, "bybit-" + bybitSymbol, {});
    if (res) {
      try {
        const j = await res.json();
        const rows = j?.result?.list ?? [];
        candles = rows.map((k: any[]) => ({
          time: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5] ?? 0),
        })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
        if (candles.length > 0) { console.log("[DATA] bybit-" + bybitSymbol + " Success: " + symbol + " Length: " + candles.length); return { candles, source: "bybit-" + bybitSymbol }; }
        console.error("[DATA] bybit-" + bybitSymbol + " returned empty data for " + symbol);
      } catch (e: any) { console.error("[DATA] bybit-" + bybitSymbol + " parse failed for " + symbol + ": " + (e?.message || e)); }
    }
  }

  console.error("[DATA] Metal history failed for " + symbol + " - all providers exhausted");
  return { candles: [], source: "none" };
}
`;

fs.appendFileSync('src/lib/data/marketData.ts', content);
console.log('Part 2 written');
