// GET /api/track-signals — server-side auto-tracking cron (MASLA 5).
//
// Vercel calls this every 15 minutes (see vercel.json `crons`). It reads every
// stored setup from Firestore, fetches the CURRENT price for each market, and
// resolves the outcome (Quality spec, item 4):
//   - price reaches TP1/2/3 -> status = "WIN"   (SUCCESS — records which target)
//   - price hits SL         -> status = "LOSS"  (FAILED)
//   - older than 24 hours   -> status = "EXPIRED"
// Every resolution is ALSO merge-patched into the signals_history twin
// (updateHistoryDoc) so the append-only history keeps the outcome. Nothing is
// ever deleted (no deleteDoc) — signals stop staying "PENDING" forever even
// when no browser is open.
//
// Price sources per market (all free, no key, geo-safe on Vercel's US edge):
//   - crypto  -> Bybit linear tickers (USDT perps)
//   - forex / stocks / metals -> Yahoo chart meta (the stored symbols ARE Yahoo
//     symbols: "EURUSD=X", "AAPL", "GC=F") — Yahoo accepts them directly.
// Educational analysis only — not financial advice.
import { readAllSignals, updateSignal, updateHistoryDoc, type CloudDoc } from "@/src/lib/signalCloud";
import { refresh } from "@/src/lib/signalsLive";
import { type ScanMarket } from "@/src/scanner/universe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Quality spec: a setup older than 24 HOURS is EXPIRED (was 30 days). */
const SETUP_TTL_MS = 24 * 60 * 60 * 1000;

type Outcome = "WIN" | "LOSS" | "EXPIRED" | "PENDING";
type HitTarget = "TP1" | "TP2" | "TP3" | "SL" | null;

/** Statuses that are already settled and must not be re-evaluated. */
const SETTLED = new Set(["WIN", "LOSS", "EXPIRED"]);

/** Yahoo chart endpoint (one symbol per request). */
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * Map a stored symbol to a Bybit USDT-linear pair, or null for non-crypto
 * (forex/stocks/metals) — those are priced by Yahoo instead. Bybit only lists
 * crypto. "BTC-USD"/"BTCUSDT" -> "BTCUSDT"; "EURUSD=X"/"GC=F"/"AAPL" -> null.
 */
function toBybitPair(symbol: string): string | null {
  const raw = String(symbol ?? "").toUpperCase();
  // Forex (…=X) and futures/metals (…=F) are not Bybit crypto pairs.
  if (raw.endsWith("=X") || raw.endsWith("=F")) return null;
  const base = raw.replace(/-USD$/, "").replace(/USDT$/, "").replace(/-/g, "");
  if (!/^[A-Z0-9]{1,15}$/.test(base)) return null;
  // A pure 6-letter fiat pair (e.g. EURUSD) is forex, not crypto.
  if (/^[A-Z]{6}$/.test(base) && /^(EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY)/.test(base)) return null;
  return `${base}USDT`;
}

/** True when a stored symbol is a non-crypto instrument priced by Yahoo. */
function isYahooSymbol(symbol: string): boolean {
  return toBybitPair(symbol) === null;
}

/** Live USDT-perp prices from Bybit, keyed by pair (e.g. "BTCUSDT"). */
async function cryptoPrices(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const response = await fetch("https://api.bybit.com/v5/market/tickers?category=linear", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: { list?: Array<{ symbol?: string; lastPrice?: string }> } };
    for (const row of payload.result?.list ?? []) {
      const price = Number(row?.lastPrice);
      if (row?.symbol && Number.isFinite(price) && price > 0) map.set(row.symbol, price);
    }
  } catch (error) {
    console.warn("[track-signals] Bybit price fetch failed:", error instanceof Error ? error.message : error);
  }
  return map;
}

/** One symbol's latest price from Yahoo chart meta, or null on any failure. */
async function yahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = payload.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
  } catch (error) {
    console.warn(`[track-signals] Yahoo price failed for ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Prices for every non-crypto symbol still awaiting resolution, keyed by the
 * stored symbol. Fetched in parallel with a bounded per-request timeout so a
 * few slow symbols never blow past the function's maxDuration.
 */
async function yahooPrices(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols)];
  const map = new Map<string, number>();
  await Promise.all(
    unique.map(async (symbol) => {
      const price = await yahooPrice(symbol);
      if (price != null) map.set(symbol, price);
    }),
  );
  return map;
}

/** Resolve one signal's outcome against the current price (incl. which target). */
function resolve(signal: CloudDoc, price: number | undefined): { status: Outcome; hitTarget: HitTarget } {
  const bearish = String(signal.direction) === "bearish";
  const sl = Number(signal.stopLoss);
  const tp1 = Number(signal.tp1);
  const tp2 = Number(signal.tp2);
  const tp3 = Number(signal.tp3);
  if (price === undefined) return { status: "PENDING", hitTarget: null };

  const slHit = Number.isFinite(sl) && sl > 0 ? (bearish ? price >= sl : price <= sl) : false;
  // Stop loss takes priority so a loss is never reported as a win.
  if (slHit) return { status: "LOSS", hitTarget: "SL" };

  // Highest target reached: lowest TP for a short, highest TP for a long.
  const targets: Array<[HitTarget, number]> = [
    ["TP1", tp1],
    ["TP2", tp2],
    ["TP3", tp3],
  ];
  const reached = targets.filter(([, v]) => Number.isFinite(v) && v > 0 && (bearish ? price <= v : price >= v));
  if (reached.length === 0) return { status: "PENDING", hitTarget: null };
  reached.sort((a, b) => (bearish ? a[1] - b[1] : b[1] - a[1]));
  return { status: "WIN", hitTarget: reached[0][0] };
}

export async function GET(request: Request) {
  // Optional auth: when CRON_SECRET is set, Vercel sends it as a Bearer token.
  // When it is not set the cron (and manual hits) still run, matching the rest
  // of the app's public-API style.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const signals = await readAllSignals();
  if (signals.length === 0) {
    return Response.json({ ok: true, tracked: 0, wins: 0, losses: 0, expired: 0, pending: 0 });
  }

  const now = Date.now();

  // Which signals still need a live price? Only PENDING, not-yet-expired ones.
  // Everything else (settled or expiring) is handled without any price fetch.
  const needsPrice = signals.filter(
    (s) =>
      !SETTLED.has(String(s.status ?? "")) &&
      !(typeof s.createdAt === "number" && s.createdAt > 0 && now - s.createdAt > SETUP_TTL_MS),
  );

  // Only pay for the price sources we actually need this run.
  const needsCrypto = needsPrice.some((s) => !isYahooSymbol(s.symbol));
  const yahooSymbols = needsPrice.filter((s) => isYahooSymbol(s.symbol)).map((s) => String(s.symbol));

  const [cryptoMap, yahooMap] = await Promise.all([
    needsCrypto ? cryptoPrices() : Promise.resolve(new Map<string, number>()),
    yahooSymbols.length > 0 ? yahooPrices(yahooSymbols) : Promise.resolve(new Map<string, number>()),
  ]);

  let wins = 0;
  let losses = 0;
  let expired = 0;
  let pending = 0;

  for (const signal of signals) {
    const alreadySettled = SETTLED.has(String(signal.status ?? ""));

    // 24h expiry applies even to already-resolved records (marks them EXPIRED).
    const createdAt = typeof signal.createdAt === "number" ? signal.createdAt : 0;
    const tooOld = createdAt > 0 && now - createdAt > SETUP_TTL_MS;

    if (tooOld) {
      if (!alreadySettled || String(signal.status) !== "EXPIRED") {
        await updateSignal(signal.id, { status: "EXPIRED" });
        // Spec item 4 — expired setups are pushed to signals_history too.
        await updateHistoryDoc(signal.id, { status: "EXPIRED", resolvedAt: now });
      }
      expired += 1;
      continue;
    }

    if (alreadySettled) continue; // leave WIN/LOSS untouched

    // Price lookup: crypto via Bybit, everything else via Yahoo.
    const pair = toBybitPair(signal.symbol);
    const price = pair ? cryptoMap.get(pair) : yahooMap.get(String(signal.symbol));
    const { status: outcome, hitTarget } = resolve(signal, price);

    await updateSignal(signal.id, {
      status: outcome,
      hitTarget,
      ...(price !== undefined ? { currentPrice: price } : {}),
    });
    // Mirror the resolution into signals_history (append-only record).
    if (outcome !== "PENDING") {
      await updateHistoryDoc(signal.id, {
        status: outcome,
        hitTarget,
        currentPrice: price ?? null,
        resolvedAt: now,
      });
    }
    // Auto-refill: on win/loss/expiry, slot the next best 8/8+4/4 candidate
    // back into the same market to maintain the live pool.
    if (outcome !== "PENDING") {
      try {
        void refresh(signal.market as ScanMarket, new URL(request.url).origin);
      } catch (error) {
        console.warn("[track-signals] auto-refill failed:", error instanceof Error ? error.message : error);
      }
    }

    if (outcome === "WIN") wins += 1;
    else if (outcome === "LOSS") losses += 1;
    else pending += 1;
  }

  return Response.json({
    ok: true,
    tracked: signals.length,
    wins,
    losses,
    expired,
    pending,
    at: new Date(now).toISOString(),
  });
}
