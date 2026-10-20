/**
 * lib/signalStats.ts — historical performance computed from the Firestore
 * archive (the append-only `signals_archive` collection).
 *
 * The archive is the ONLY trustworthy source of history: it is written by the
 * server (signalsLive → persistSignals) and resolved by the cron
 * (/api/track-signals), so it works even when no browser is open.
 *
 * Everything here is PURE — the route fetches the docs, this module turns them
 * into the numbers. That keeps the maths testable without Firestore.
 */
import { canonicalSymbol, signalDateKey } from "./signalIdentity";

/** A stored setup, as read from the archive. */
export interface StatsDoc {
  symbol: string;
  market: string;
  timeframe?: string;
  dateKey?: string;
  createdAt?: number;
  status?: string;
  score?: number;
  direction?: string;
  hitTarget?: string;
  entry1?: number;
  entry2?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  currentPrice?: number;
  price?: number;
}

/** Retention window for the statistics (days of Asia/Karachi history). */
export const DEFAULT_RETENTION_DAYS = 90;

export interface StatsBucket {
  key: string;
  total: number;
  wins: number;
  losses: number;
  expired: number;
  pending: number;
  winRate: number;
}

export interface SignalStats {
  /** Total number of documents considered (after the retention window). */
  total: number;
  wins: number;
  losses: number;
  expired: number;
  pending: number;
  /** Win rate over SETTLED setups only (wins / (wins + losses)). */
  winRate: number;
  /** Same, but counting expired setups as losses (the pessimistic view). */
  winRateWithExpired: number;
  /** Average score of the resolved setups. */
  averageScore: number;
  /** Best/worst single setup score among resolved setups. */
  highestScore: number;
  lowestScore: number;
  byMarket: StatsBucket[];
  bySymbol: StatsBucket[];
  byDirection: StatsBucket[];
  byScoreTier: StatsBucket[];
  byHitTarget: StatsBucket[];
  /** One entry per Asia/Karachi day, oldest first. */
  daily: Array<StatsBucket & { dateKey: string }>;
  /** Days of history the numbers cover. */
  retentionDays: number;
  /** Oldest / newest dateKey in the window (null when empty). */
  from: string | null;
  to: string | null;
  generatedAt: string;
}

/** Score tier names used across the app. */
export const SCORE_TIERS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: "premium", label: "PREMIUM (95+)", min: 95, max: Infinity },
  { key: "strong", label: "STRONG (88-94)", min: 88, max: 94 },
  { key: "good", label: "GOOD (85-87)", min: 85, max: 87 },
  { key: "below", label: "BELOW 85", min: -Infinity, max: 84 },
];

/** Outcome buckets — the four states a setup can be in. */
function bucketOf(status: string): "wins" | "losses" | "expired" | "pending" {
  if (status === "WIN" || status === "SUCCESS") return "wins";
  if (status === "LOSS" || status === "FAILED") return "losses";
  if (status === "EXPIRED") return "expired";
  return "pending";
}

function emptyBucket(key: string): StatsBucket {
  return { key, total: 0, wins: 0, losses: 0, expired: 0, pending: 0, winRate: 0 };
}

function finalize(bucket: StatsBucket): StatsBucket {
  const settled = bucket.wins + bucket.losses;
  bucket.winRate = settled > 0 ? Math.round((bucket.wins / settled) * 1000) / 10 : 0;
  return bucket;
}

function bump(map: Map<string, StatsBucket>, key: string, status: string): void {
  const bucket = map.get(key) ?? emptyBucket(key);
  bucket.total += 1;
  bucket[bucketOf(status)] += 1;
  map.set(key, bucket);
}

function toBuckets(map: Map<string, StatsBucket>, sort: "total" | "key" = "total"): StatsBucket[] {
  const list = [...map.values()].map(finalize);
  list.sort((a, b) =>
    sort === "total" ? b.total - a.total || a.key.localeCompare(b.key) : a.key.localeCompare(b.key),
  );
  return list;
}

/** The score tier a score belongs to. */
export function scoreTierKey(score: number): string {
  for (const tier of SCORE_TIERS) {
    if (score >= tier.min && score <= tier.max) return tier.key;
  }
  return "below";
}

/**
 * Compute the full statistics object from the archive documents.
 *
 * @param docs   every document read from the archive
 * @param options.retentionDays  how many days of history to keep (default 90)
 * @param options.now           epoch ms used as "today" (default Date.now())
 */
export function computeSignalStats(
  docs: StatsDoc[],
  options: { retentionDays?: number; now?: number } = {},
): SignalStats {
  const retentionDays = Math.max(1, Math.floor(options.retentionDays ?? DEFAULT_RETENTION_DAYS));
  const now = options.now ?? Date.now();
  const todayKey = signalDateKey(now);
  const cutoffKey = signalDateKey(now - (retentionDays - 1) * 86_400_000);

  // 1) Filter to the retention window and drop malformed rows.
  const inWindow: Array<StatsDoc & { key: string }> = [];
  for (const doc of docs) {
    if (!doc || typeof doc.symbol !== "string" || !doc.symbol) continue;
    const key =
      typeof doc.dateKey === "string" && doc.dateKey ? doc.dateKey : signalDateKey(doc.createdAt ?? now);
    if (key < cutoffKey || key > todayKey) continue;
    inWindow.push({ ...doc, key });
  }

  const byMarket = new Map<string, StatsBucket>();
  const bySymbol = new Map<string, StatsBucket>();
  const byDirection = new Map<string, StatsBucket>();
  const byScoreTier = new Map<string, StatsBucket>();
  const byHitTarget = new Map<string, StatsBucket>();
  const byDay = new Map<string, StatsBucket>();

  const totals = { total: 0, wins: 0, losses: 0, expired: 0, pending: 0 };
  let scoreSum = 0;
  let scored = 0;
  let highestScore = 0;
  let lowestScore = 100;

  for (const doc of inWindow) {
    const status = String(doc.status ?? "PENDING");
    const market = String(doc.market ?? "").trim().toLowerCase() || "unknown";
    const symbol = canonicalSymbol(doc.symbol, market);
    const direction = String(doc.direction ?? "").trim().toLowerCase() || "unknown";
    const score = Number.isFinite(doc.score) ? Number(doc.score) : 0;
    const tier = scoreTierKey(score);
    const hit = String(doc.hitTarget ?? "").trim().toUpperCase() || "none";

    totals.total += 1;
    totals[bucketOf(status)] += 1;

    bump(byMarket, market, status);
    bump(bySymbol, `${market}|${symbol}`, status);
    bump(byDirection, direction, status);
    bump(byScoreTier, tier, status);
    bump(byHitTarget, hit, status);
    bump(byDay, doc.key, status);

    if (status !== "PENDING" && score > 0) {
      scoreSum += score;
      scored += 1;
      if (score > highestScore) highestScore = score;
      if (score < lowestScore) lowestScore = score;
    }
  }

  const settled = totals.wins + totals.losses;
  const winRate = settled > 0 ? Math.round((totals.wins / settled) * 1000) / 10 : 0;
  const winRateWithExpired =
    settled + totals.expired > 0
      ? Math.round((totals.wins / (settled + totals.expired)) * 1000) / 10
      : 0;

  const daily = [...byDay.entries()]
    .map(([dateKey, bucket]) => ({ ...finalize(bucket), dateKey }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const from = daily.length > 0 ? daily[0].dateKey : null;
  const to = daily.length > 0 ? daily[daily.length - 1].dateKey : null;

  return {
    total: totals.total,
    wins: totals.wins,
    losses: totals.losses,
    expired: totals.expired,
    pending: totals.pending,
    winRate,
    winRateWithExpired,
    averageScore: scored > 0 ? Math.round((scoreSum / scored) * 10) / 10 : 0,
    highestScore: scored > 0 ? highestScore : 0,
    lowestScore: scored > 0 ? lowestScore : 0,
    byMarket: toBuckets(byMarket),
    bySymbol: toBuckets(bySymbol),
    byDirection: toBuckets(byDirection),
    byScoreTier: toBuckets(byScoreTier, "key"),
    byHitTarget: toBuckets(byHitTarget, "key"),
    daily,
    retentionDays,
    from,
    to,
    generatedAt: new Date(now).toISOString(),
  };
}

/**
 * One-line, bilingual summary of the stats — used by the chat assistant so it
 * can answer "how accurate are your signals?" with real numbers.
 */
export function summarizeStats(stats: SignalStats): { english: string; urdu: string } {
  if (stats.total === 0) {
    return {
      english: "No historical setups have been recorded yet.",
      urdu: "Abhi tak koi historical setup record nahi hua.",
    };
  }
  const english =
    `Across ${stats.total} setup(s) in the last ${stats.retentionDays} days: ` +
    `${stats.wins} win(s), ${stats.losses} loss(es), ${stats.expired} expired, ${stats.pending} still pending. ` +
    `Win rate on settled setups: ${stats.winRate}%.`;
  const urdu =
    `Pichle ${stats.retentionDays} din ke ${stats.total} setup(s) mein: ` +
    `${stats.wins} win, ${stats.losses} loss, ${stats.expired} expired, ${stats.pending} pending. ` +
    `Settled setups ka win rate: ${stats.winRate}%.`;
  return { english, urdu };
}

/** Days between two Asia/Karachi date keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86_400_000);
}

