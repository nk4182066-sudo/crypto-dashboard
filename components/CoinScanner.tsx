// Educational analysis only. Not financial advice.
import React from "react";

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
type Divergence = "Bullish" | "Bearish" | "None";
type Status = "Watch" | "Wait" | "Setup Detected";
type SortKey = "price" | "change" | "rsi";
type FilterKey = "All" | "Bullish" | "Bearish";
interface Row { symbol: string; price: number; change: number; rsi: number; divergence: Divergence; status: Status; bias: string }
function rsiAt(closes: number[], end: number, period = 14): number {
  let gain = 0, loss = 0;
  for (let i = Math.max(1, end - period + 1); i <= end; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta; else loss -= delta;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
// Price swing vs RSI swing: higher high with lower RSI = Bearish, lower low with higher RSI = Bullish.
function detectDivergence(closes: number[]): Divergence {
  const rsiValues = closes.map((_, i) => (i > 14 ? rsiAt(closes, i) : 50));
  const highs: number[] = [], lows: number[] = [];
  for (let i = 2; i < closes.length - 2; i++) {
    const c = closes[i];
    if (c > closes[i-1] && c > closes[i-2] && c > closes[i+1] && c > closes[i+2]) highs.push(i);
    if (c < closes[i-1] && c < closes[i-2] && c < closes[i+1] && c < closes[i+2]) lows.push(i);
  }
  const h = highs.slice(-2), l = lows.slice(-2);
  if (h.length === 2 && closes[h[1]] > closes[h[0]] && rsiValues[h[1]] < rsiValues[h[0]]) return "Bearish";
  if (l.length === 2 && closes[l[1]] < closes[l[0]] && rsiValues[l[1]] > rsiValues[l[0]]) return "Bullish";
  return "None";
}
interface ScanHit { symbol: string; market: string; price: number; bias: string; direction: string; confidence: number }
async function loadRows(): Promise<Row[]> {
  const res = await fetch("/api/market/scan");
  if (!res.ok) throw new Error(`Scan request failed (${res.status}).`);
  const snapshot = (await res.json()) as { results?: ScanHit[] };
  const coins = (snapshot.results ?? []).filter((c) => c.market === "crypto").slice(0, 10);
  return Promise.all(coins.map(async (coin) => {
    let change = 0, rsiValue = 50, divergence: Divergence = "None";
    try {
      const history = await fetch(`/api/market/history?symbol=${encodeURIComponent(coin.symbol)}&market=crypto&timeframe=1h`);
      const payload = (await history.json()) as { candles?: Candle[] };
      const closes = (payload.candles ?? []).map((c) => c.close);
      if (closes.length > 25) {
        const start = closes[closes.length - 25];
        change = ((closes[closes.length - 1] - start) / start) * 100;
        rsiValue = rsiAt(closes, closes.length - 1);
        divergence = detectDivergence(closes.slice(-120));
      }
    } catch { /* keep neutral defaults when history is unavailable */ }
    const status: Status = coin.direction === "wait" ? "Wait" : coin.confidence >= 70 ? "Setup Detected" : "Watch";
    return { symbol: coin.symbol.replace("-USD", ""), price: coin.price, change, rsi: rsiValue, divergence, status, bias: coin.bias };
  }));
}
const fmtPrice = (p: number) => (p >= 1 ? p.toFixed(2) : p.toFixed(6));
const DIVERGENCE_COLOR: Record<Divergence, string> = { Bullish: "text-emerald-400", Bearish: "text-red-400", None: "text-zinc-500" };
const STATUS_COLOR: Record<Status, string> = { "Setup Detected": "text-emerald-300", Watch: "text-amber-300", Wait: "text-zinc-400" };
const CoinScanner: React.FC = () => {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("price");
  const [filter, setFilter] = React.useState<FilterKey>("All");

  React.useEffect(() => {
    const refresh = () => {
      loadRows().then((d) => { setRows(d); setError(null); })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Scanner unavailable."));
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, []);

  const visible = rows.filter((r) => filter === "All" || r.bias === filter).sort((a, b) => b[sort] - a[sort]);

  return (
    <section aria-label="Coin scanner" className="border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Coin Scanner</h3>
        <span className="text-xs text-zinc-500">Auto-refresh 60s</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {(["price", "change", "rsi"] as SortKey[]).map((key) => (
          <button key={key} type="button" onClick={() => setSort(key)}
            className={`rounded px-2 py-1 ${sort === key ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800"}`}>
            Sort: {key === "price" ? "Price" : key === "change" ? "Change" : "RSI"}
          </button>
        ))}
        <span className="text-zinc-700">|</span>
        {(["All", "Bullish", "Bearish"] as FilterKey[]).map((key) => (
          <button key={key} type="button" onClick={() => setFilter(key)}
            className={`rounded px-2 py-1 ${filter === key ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:bg-zinc-800"}`}>
            {key}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mb-2 border-l-2 border-amber-400 pl-2 text-xs text-amber-200">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              {["Symbol", "Price", "Change % (24h)", "RSI", "Divergence", "Status"].map((heading) => (
                <th key={heading} className="max-w-[100px] truncate py-1 pr-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {visible.map((row) => (
              <tr key={row.symbol}>
                <td className="max-w-[100px] truncate py-1.5 pr-2 font-semibold text-white">{row.symbol}</td>
                <td className="max-w-[100px] truncate py-1.5 pr-2 text-zinc-200">{fmtPrice(row.price)}</td>
                <td className={`max-w-[100px] truncate py-1.5 pr-2 ${row.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>{row.change >= 0 ? "+" : ""}{row.change.toFixed(2)}%</td>
                <td className="max-w-[100px] truncate py-1.5 pr-2 text-zinc-200">{row.rsi.toFixed(1)}</td>
                <td className={`max-w-[100px] truncate py-1.5 pr-2 ${DIVERGENCE_COLOR[row.divergence]}`}>{row.divergence}</td>
                <td className={`max-w-[100px] truncate py-1.5 ${STATUS_COLOR[row.status]}`}>{row.status}</td>
              </tr>
            ))}
            {visible.length === 0 && !error && (
              <tr><td colSpan={6} className="py-4 text-center text-zinc-500">Scanning market…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default CoinScanner;

