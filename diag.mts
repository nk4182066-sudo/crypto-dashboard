// Diagnostic: run analyzeCoin on live Bybit candles for several coins and
// print per-condition pass/fail so we can see exactly why 0 signals emit.
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "TRXUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "XLMUSDT", "SUIUSDT", "TONUSDT"];

async function klines(symbol: string, interval: string, limit = 200): Promise<any[]> {
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(json.retMsg || "retCode!=0");
  return json.result.list.map((r: string[]) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

async function main() {
  const { analyzeCoin } = await import("./src/lib/analyzeCoin.ts");
  for (const symbol of SYMBOLS) {
    try {
      const [h1, h4, d1] = await Promise.all([
        klines(symbol, "60"),
        klines(symbol, "240"),
        klines(symbol, "D"),
      ]);
      const a = analyzeCoin({ symbol, market: "crypto", primary: h1, h1, h4, d1 });
      const fails = a.conditions.filter((c) => !c.pass).map((c) => `${c.id}: ${c.detail}`);
      console.log(`\n=== ${symbol} === score=${a.score} dir=${a.direction} passed=${a.conditionsPassed}/8 chartPat=${a.chartPattern}(${a.chartPatternConfidence}) candle=${a.candlestick}(${a.candlestickType})`);
      console.log(`  price=${a.price}`);
      for (const f of fails) console.log(`  FAIL ${f}`);
    } catch (e) {
      console.log(`\n=== ${symbol} === ERROR ${(e as Error).message}`);
    }
  }
}
main();
