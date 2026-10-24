/**
 * dailyQuota.ts — "Max 10 signals per market per 24h" Firestore counter
 * (Quality with Quantity spec, item 2). NO FALLBACK: once a market has emitted
 * MAX_SIGNALS_PER_MARKET_PER_DAY setups today (Asia/Karachi day), the engine
 * stops emitting for that market until the Karachi midnight reset.
 *
 * Quota counts signals directly from Firestore `signals` collection —
 * NOT `signals_history`, NOT `signal_daily_counts`. Only docs with
 * dateKey === today and matching market are counted.
 *
 * All functions never throw; when Firestore is unavailable the quota fails OPEN.
 * Educational analysis only — not financial advice.
 */
import { initializeApp, getApps } from "firebase/app";
import { collection, doc, getDocs, getFirestore, query, type Firestore, where } from "firebase/firestore";
import { karachiDateKey } from "./signalCloud";
import type { ScanMarket } from "@/src/scanner/universe";

/** Hard daily cap per market (spec: 10 — crypto / forex / stocks / metals each). */
export const MAX_SIGNALS_PER_MARKET_PER_DAY = 10;

/** Quota counts signals directly from Firestore `signals` collection (not `signals_history`). */
/** Mirrors src/lib/signalCloud.ts — kept local so this module stays import-light. */
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

/** Count today's emitted signals for a market from the `signals` collection.
 *  Only counts docs with dateKey === today and market match — never signals_history. */
async function countTodaySignals(db: Firestore, market: ScanMarket): Promise<number> {
  const today = karachiDateKey();
  try {
    const q = query(
      collection(db, "signals"),
      where("market", "==", market),
      where("dateKey", "==", today),
    );
    const snap = await getDocs(q);
    return snap.docs.length;
  } catch (error) {
    console.warn(`[dailyQuota] countTodaySignals failed for ${market}:`, error instanceof Error ? error.message : error);
    return 0;
  }
}

/** How many signals this market may still emit today. Never throws. */
export async function remainingEmitSlots(market: ScanMarket): Promise<number> {
  const db = getDb();
  if (!db) {
    console.info(`[dailyQuota] quota off (${initReason}) — ${market} unlimited.`);
    return MAX_SIGNALS_PER_MARKET_PER_DAY;
  }
  try {
    const used = await countTodaySignals(db, market);
    console.log(`[dailyQuota] ${market}: used=${used} limit=${MAX_SIGNALS_PER_MARKET_PER_DAY} remaining=${Math.max(0, MAX_SIGNALS_PER_MARKET_PER_DAY - used)}`);
    return Math.max(0, MAX_SIGNALS_PER_MARKET_PER_DAY - used);
  } catch (error) {
    console.warn(`[dailyQuota] read failed for ${market} (fail-open):`, error instanceof Error ? error.message : error);
    return MAX_SIGNALS_PER_MARKET_PER_DAY;
  }
}

/** Reserve ONE emit slot — checks signals collection count, returns false when today's 10 are used up. */
export async function reserveEmitSlot(market: ScanMarket): Promise<boolean> {
  const db = getDb();
  if (!db) return true; // fail-open without Firestore
  try {
    const used = await countTodaySignals(db, market);
    if (used >= MAX_SIGNALS_PER_MARKET_PER_DAY) {
      console.log(`[dailyQuota] ${market} quota FULL: ${used}/${MAX_SIGNALS_PER_MARKET_PER_DAY}`);
      return false;
    }
    console.log(`[dailyQuota] ${market}: slot reserved (${used + 1}/${MAX_SIGNALS_PER_MARKET_PER_DAY})`);
    return true;
  } catch (error) {
    console.warn(`[dailyQuota] reserve failed for ${market} (fail-open):`, error instanceof Error ? error.message : error);
    return true;
  }
}
