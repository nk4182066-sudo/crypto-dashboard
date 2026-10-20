/**
 * lib/signalCloud.ts — persistence for the /signals pipeline (MASLA 2).
 *
 * Layer 1 — Firestore (collection `signals_archive`), shared across devices:
 *   - The market-signals API writes every emitted setup via `persistSignals()`.
 *   - One document per signal, NEVER deleted (no deleteDoc, no TTL sweep).
 *   - Each doc carries `dateKey` = Asia/Karachi date string (YYYY-MM-DD).
 *   - Today's signals: where dateKey == today. Previous: orderBy createdAt.
 *   - The Signals page subscribes with `subscribeSignals()` (real-time).
 *   - Requires the NEXT_PUBLIC_FIREBASE_* env vars (mirrors src/lib/firebase.ts).
 *     When they are missing the whole cloud layer is a silent no-op — the
 *     localStorage backup below keeps the page working.
 *
 * Layer 2 — localStorage backup (`signals-cloud-backup`), always available:
 *   the page restores the last snapshot instantly after a reload and keeps
 *   working offline / without Firebase.
 *
 * Educational analysis only — not financial advice.
 */
import { getApps, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";

/** Same symbol+timeframe inside this window is skipped (dedupe, not expiry). */
export const DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000;
/** Signals older than 30 days are marked EXPIRED but never deleted. */
export const SIGNAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Firestore archive collection — signals are appended, never deleted. */
export const SIGNALS_COLLECTION = "signals_archive";
export const SIGNALS_HISTORY_COLLECTION = "signals_history";

/** localStorage backup key (always-on fallback when Firebase is absent). */
export const SIGNAL_BACKUP_KEY = "signals-cloud-backup";

/** A stored setup — full MarketSignal payload + persistence metadata. */
export type CloudDoc = Record<string, unknown> & {
  symbol: string;
  market: string;
  timeframe?: string;
  createdAt?: number;
  /** Asia/Karachi date string YYYY-MM-DD for today/previous split. */
  dateKey?: string;
};

// Mirrors src/lib/firebase.ts — kept local so this module works in the API
// route without importing the auth UI helpers.
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
function getCloudDb(): Firestore | null {
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

/** Firestore doc ids cannot contain / . # [ ] */
function docId(signal: CloudDoc): string {
  const safe = (value: string) => value.replace(/[/\\.#\[\]]/g, "_");
  return [signal.market, signal.symbol, signal.timeframe ?? "1h"].map(safe).join("_");
}

/** JSON round-trip drops undefined/functions and maps NaN/Infinity to null — all invalid in Firestore. */
function cleanDoc(signal: CloudDoc, now: number): Record<string, unknown> {
  const pakistanOffset = 5 * 60; // UTC+5 (PKT)
  const pakistanMs = now + pakistanOffset * 60 * 1000;
  const dateKey = new Date(pakistanMs).toISOString().slice(0, 10);
  const payload = { ...signal, dateKey, timeframe: signal.timeframe ?? "1h", createdAt: now };
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

/** Asia/Karachi date string YYYY-MM-DD for a given epoch ms. */
export function karachiDateKey(ms = Date.now()): string {
  const pakistanOffset = 5 * 60; // UTC+5 (PKT)
  const pakistanMs = ms + pakistanOffset * 60 * 1000;
  return new Date(pakistanMs).toISOString().slice(0, 10);
}

/**
 * Read today's signals (dateKey == Asia/Karachi today). Used by the live page.
 * Never throws.
 */
export async function readTodaySignals(): Promise<Array<CloudDoc & { id: string }>> {
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] readTodaySignals off (${initReason}).`);
    return [];
  }
  try {
    const today = karachiDateKey();
    const q = query(
      collection(db, SIGNALS_COLLECTION),
      where("dateKey", "==", today),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as CloudDoc) }));
  } catch (error) {
    console.warn("[signalCloud] readTodaySignals failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Read previous signals ordered by createdAt (all signals not from today).
 * Used by the Results page history view. Never throws.
 */
export async function readPreviousSignals(): Promise<Array<CloudDoc & { id: string }>> {
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] readPreviousSignals off (${initReason}).`);
    return [];
  }
  try {
    const today = karachiDateKey();
    const q = query(
      collection(db, SIGNALS_COLLECTION),
      where("dateKey", "!=", today),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as CloudDoc) }));
  } catch (error) {
    console.warn("[signalCloud] readPreviousSignals failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Server-side save (market-signals API). Skips documents already younger than
 * 4h (dedupe), refreshes older ones. NEVER deletes — signals accumulate in
 * signals_archive with dateKey for today/previous split.
 * Never throws — a cloud failure must not break the signal response.
 */
export async function persistSignals(signals: CloudDoc[]): Promise<void> {
  if (signals.length === 0) return;
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] Firestore off (${initReason}) — ${signals.length} signal(s) kept in localStorage backup only.`);
    return;
  }
  const now = Date.now();
  let saved = 0;
  let skipped = 0;
  for (const signal of signals) {
    const id = docId(signal);
    try {
      const ref = doc(db, SIGNALS_COLLECTION, id);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const previous = existing.data() as { createdAt?: number };
        if (typeof previous.createdAt === "number" && now - previous.createdAt < DEDUPE_WINDOW_MS) {
          skipped += 1; // dedupe: same symbol+timeframe inside 4h → skip
          continue;
        }
      }
      await setDoc(ref, cleanDoc(signal, now));
      saved += 1;
      console.info(`[signalCloud] Firestore save: ${id}`);
    } catch (error) {
      console.warn(`[signalCloud] save failed (${id}):`, error instanceof Error ? error.message : error);
      return;
    }
  }
  if (saved > 0) console.info(`[signalCloud] ${saved} saved, ${skipped} skipped (dedupe <4h).`);
}
/**
 * Save signals to the signals_history collection (chart source + persistence).
 * Append-only write to a separate history collection so the signal history
 * store is never overwritten by archive status updates.
 */
export async function persistToHistory(signals: CloudDoc[]): Promise<void> {
  if (signals.length === 0) return;
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] history off (no db) — ${signals.length} signal(s) not persisted to signals_history.`);
    return;
  }
  const now = Date.now();
  let saved = 0;
  for (const signal of signals) {
    const id = docId(signal);
    try {
      const ref = doc(db, SIGNALS_HISTORY_COLLECTION, id);
      await setDoc(ref, cleanDoc(signal, now));
      saved += 1;
    } catch (error) {
      console.warn(`[signalCloud] history save failed (${id}):`, error instanceof Error ? error.message : error);
    }
  }
  if (saved > 0) console.info(`[signalCloud] signals_history saved: ${saved} document(s)`);
}



/**
 * Client-side real-time listener (Signals page). Emits ONLY today's docs
 * (dateKey == Asia/Karachi today) so the live pool never mixes days; the
 * Results page history uses `subscribeAllSignals()`. Never throws.
 */
export function subscribeSignals(onSignals: (signals: CloudDoc[]) => void): () => void {
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] listener off (${initReason}) — using localStorage backup.`);
    return () => {};
  }
  try {
    const today = karachiDateKey();
    return onSnapshot(
      collection(db, SIGNALS_COLLECTION),
      (snapshot) => {
        const fresh = snapshot.docs
          .map((entry) => entry.data() as CloudDoc)
          .filter((signal) => signal.dateKey === today);
        onSignals(fresh);
      },
      (error) => console.warn("[signalCloud] listener error:", error.message),
    );
  } catch (error) {
    console.warn("[signalCloud] listener failed:", error instanceof Error ? error.message : error);
    return () => {};
  }
}

/**
 * Real-time listener for the Results page — every doc in signals_archive
 * (append-only: nothing is ever deleted), ordered by createdAt desc, each
 * returned with its Firestore id attached. Never throws.
 */
export function subscribeAllSignals(
  onSignals: (signals: Array<CloudDoc & { id: string }>) => void,
): () => void {
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] full listener off (${initReason}) — using localStorage backup.`);
    return () => {};
  }
  try {
    return onSnapshot(
      query(collection(db, SIGNALS_COLLECTION), orderBy("createdAt", "desc")),
      (snapshot) => {
        onSignals(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as CloudDoc) })));
      },
      (error) => console.warn("[signalCloud] full listener error:", error.message),
    );
  } catch (error) {
    console.warn("[signalCloud] full listener failed:", error instanceof Error ? error.message : error);
    return () => {};
  }
}

/** Restore the last on-screen snapshot (localStorage backup layer). */
export function loadSignalBackup(): CloudDoc[] {
  try {
    const raw = localStorage.getItem(SIGNAL_BACKUP_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CloudDoc =>
        typeof entry === "object" && entry !== null && typeof (entry as CloudDoc).symbol === "string",
    );
  } catch {
    return [];
  }
}

/** Save the current snapshot (capped) so reloads restore instantly. */
export function saveSignalBackup(signals: CloudDoc[]): void {
  try {
    localStorage.setItem(SIGNAL_BACKUP_KEY, JSON.stringify(signals.slice(0, 60)));
  } catch {
    /* quota / private-mode — backup optional */
  }
}

/**
 * Server-side read of every stored signal — used by the /api/track-signals
 * cron (MASLA 5) to resolve PENDING setups even when no browser is open.
 * Each document is returned with its Firestore id attached. Empty array when
 * Firestore is not configured or the read fails — never throws.
 */
export async function readAllSignals(): Promise<Array<CloudDoc & { id: string }>> {
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] readAllSignals off (${initReason}).`);
    return [];
  }
  try {
    const snapshot = await getDocs(collection(db, SIGNALS_COLLECTION));
    return snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as CloudDoc) }));
  } catch (error) {
    console.warn("[signalCloud] readAllSignals failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Merge-patch one stored signal — used by the tracking cron to write the
 * resolved `status` ("WIN" | "LOSS" | "EXPIRED" | "PENDING") and the
 * `currentPrice` it evaluated at. Merge so all trade-plan fields are kept.
 * Returns true on success — never throws.
 */
export async function updateSignal(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const db = getCloudDb();
  if (!db) return false;
  try {
    await setDoc(doc(db, SIGNALS_COLLECTION, id), patch, { merge: true });
    return true;
  } catch (error) {
    console.warn(`[signalCloud] updateSignal failed (${id}):`, error instanceof Error ? error.message : error);
    return false;
  }
}