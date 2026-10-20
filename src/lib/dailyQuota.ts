/**
 * dailyQuota.ts — "Max 10 signals per market per 24h" Firestore counter
 * (Quality with Quantity spec, item 2). NO FALLBACK: once a market has emitted
 * MAX_SIGNALS_PER_MARKET_PER_DAY setups today (Asia/Karachi day), the engine
 * stops emitting for that market until the Karachi midnight reset.
 *
 * Doc shape (collection `signal_daily_counts`, id `today_<market>_count`):
 *   { count: number, dateKey: "YYYY-MM-DD" }   ← Asia/Karachi date
 *
 * A stale dateKey is read as count 0, so the reset needs NO cron write — the
 * first read/increment after midnight simply starts a fresh day.
 * All functions never throw; when Firestore is unavailable (local dev without
 * NEXT_PUBLIC_FIREBASE_*) the quota fails OPEN so the engine keeps working.
 * Educational analysis only — not financial advice.
 */
import { initializeApp, getApps } from "firebase/app";
import { doc, getFirestore, runTransaction, type Firestore } from "firebase/firestore";
import { karachiDateKey } from "./signalCloud";
import type { ScanMarket } from "@/src/scanner/universe";

/** Hard daily cap per market (spec: 10 — crypto / forex / stocks / metals each). */
export const MAX_SIGNALS_PER_MARKET_PER_DAY = 10;

/** Firestore collection holding one counter doc per market. */
export const QUOTA_COLLECTION = "signal_daily_counts";

// Mirrors src/lib/signalCloud.ts — kept local so this module stays import-light.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cloudDb: Firestore | null = null;
let initTried = false;
let initReason = "not initialised";

/** Lazily resolve the Firestore instance, or null when Firebase is not configured. */
function getDb(): Firestore | null {
  if (initTried) return cloudDb;
  initTried = true;
  try {
    if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
      initReason = "NEXT_PUBLIC_FIREBASE_* env vars missing";
      return null;
    }
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    cloudDb = getFirestore(app);
    initReason = "ready";
  } catch (error) {
    initReason = error instanceof Error ? error.message : String(error);
    cloudDb = null;
  }
  return cloudDb;
}

/** Counter doc id — the spec's `today_crypto_count` naming. */
function counterId(market: ScanMarket): string {
  return `today_${market}_count`;
}

/** Today's count from a stored doc; a STALE dateKey reads as 0 (midnight reset). */
function readCount(data: Record<string, unknown> | undefined, today: string): number {
  if (!data) return 0;
  if (data.dateKey !== today) return 0;
  const count = Number(data.count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** How many 85+ signals this market may still emit today. Never throws. */
export async function remainingEmitSlots(market: ScanMarket): Promise<number> {
  const db = getDb();
  if (!db) {
    console.info(`[dailyQuota] quota off (${initReason}) — ${market} unlimited.`);
    return MAX_SIGNALS_PER_MARKET_PER_DAY;
  }
  try {
    const used = await runTransaction(db, async (tx) => {
      const ref = doc(db, QUOTA_COLLECTION, counterId(market));
      const existing = await tx.get(ref);
      return readCount(existing.data() as Record<string, unknown> | undefined, karachiDateKey());
    });
    return Math.max(0, MAX_SIGNALS_PER_MARKET_PER_DAY - used);
  } catch (error) {
    // Fail-open: a broken counter must never silence the signal engine.
    console.warn(`[dailyQuota] read failed for ${market} (fail-open):`, error instanceof Error ? error.message : error);
    return MAX_SIGNALS_PER_MARKET_PER_DAY;
  }
}

/** Atomically reserve ONE emit slot. Returns false when today's 10 are used up. */
export async function reserveEmitSlot(market: ScanMarket): Promise<boolean> {
  const db = getDb();
  if (!db) return true; // fail-open without Firestore
  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, QUOTA_COLLECTION, counterId(market));
      const existing = await tx.get(ref);
      const today = karachiDateKey();
      const count = readCount(existing.data() as Record<string, unknown> | undefined, today);
      if (count >= MAX_SIGNALS_PER_MARKET_PER_DAY) return false;
      tx.set(ref, { count: count + 1, dateKey: today, updatedAt: Date.now() });
      return true;
    });
  } catch (error) {
    console.warn(`[dailyQuota] reserve failed for ${market} (fail-open):`, error instanceof Error ? error.message : error);
    return true;
  }
}
