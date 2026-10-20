// GET /api/signals/stats — historical performance of the emitted setups.
//
// Reads the append-only Firestore archive (`signals_archive`) — the same store
// the /api/track-signals cron resolves — and returns the win/loss statistics
// per market, symbol, direction, score tier, target level and day.
//
// GET /api/signals/stats                  → default 90-day window
// GET /api/signals/stats?days=30          → custom window (1..365)
// GET /api/signals/stats?market=crypto    → filter one market
// GET /api/signals/stats?include=daily    → include the per-day series
//
// Educational analysis only — not financial advice.

import { readAllSignals } from "@/src/lib/signalCloud";
import { computeSignalStats, DEFAULT_RETENTION_DAYS, type StatsDoc } from "@/src/lib/signalStats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_DAYS = 365;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const rawDays = Number(searchParams.get("days"));
  const retentionDays =
    Number.isFinite(rawDays) && rawDays > 0
      ? Math.min(MAX_DAYS, Math.max(1, Math.floor(rawDays)))
      : DEFAULT_RETENTION_DAYS;

  const marketFilter = String(searchParams.get("market") ?? "").trim().toLowerCase();
  const include = String(searchParams.get("include") ?? "").trim().toLowerCase();

  const docs = (await readAllSignals()) as StatsDoc[];
  const filtered = marketFilter
    ? docs.filter((doc) => String(doc?.market ?? "").trim().toLowerCase() === marketFilter)
    : docs;

  const stats = computeSignalStats(filtered, { retentionDays });

  // The per-day series can be long — only ship it when explicitly asked for.
  const payload = {
    ok: true,
    stats: include === "daily" ? stats : { ...stats, daily: [] },
    source: "firestore:signals_archive",
    docsScanned: docs.length,
    docsConsidered: filtered.length,
    market: marketFilter || "all",
    at: new Date().toISOString(),
  };

  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
