/**
 * lib/signalCloud.ts — persistence for the /signals pipeline (MASLA 2).
 *
 * Layer 1 — Firestore (collection `signals`), shared across devices:
 *   - The market-signals API writes every emitted setup via `persistSignals()`.
 *   - One document per (market, symbol, timeframe): a document younger than
 *     SIGNAL_TTL_MS (4h) is never overwritten (dedupe window — same symbol +
 *     timeframe inside 4h is skipped), older ones refresh in place, and
 *     `sweepExpired()` deletes documents past the TTL.
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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  type Firestore,
} from "firebase/firestore";

/** Same symbol+timeframe inside this window is skipped (dedupe, not expiry). */
export const DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000;
/** Signals older than this expire and are auto-deleted (KAAM 9 — 30 days). */
export const SIGNAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Firestore collection. */
export const SIGNALS_COLLECTION = "signals";

/** localStorage backup key (always-on fallback when Firebase is absent). */
export const SIGNAL_BACKUP_KEY = "signals-cloud-backup";

/** A stored setup — full MarketSignal payload + persistence metadata. */
export type CloudDoc = Record<string, unknown> & {
  symbol: string;
  market: string;
  timeframe?: string;
  createdAt?: number;
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
  const payload = { ...signal, timeframe: signal.timeframe ?? "1h", createdAt: now };
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

/** True while the stored signal is inside the 4h window. */
export function isFresh(signal: CloudDoc, now = Date.now()): boolean {
  if (typeof signal.createdAt === "number") return now - signal.createdAt < SIGNAL_TTL_MS;
  const stamp = Date.parse(String(signal.analyzedAt ?? ""));
  return Number.isFinite(stamp) ? now - stamp < SIGNAL_TTL_MS : false;
}

/**
 * Server-side save (market-signals API). Skips documents already younger than
 * 4h (dedupe), refreshes older ones, then sweeps expired documents.
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
  if (saved > 0) await sweepExpired(db, now);
}

/** Auto-delete documents older than the 4h TTL (spec: expire → delete). */
async function sweepExpired(db: Firestore, now: number): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, SIGNALS_COLLECTION));
    const expired = snapshot.docs.filter((entry) => {
      const createdAt = (entry.data() as { createdAt?: number }).createdAt;
      return typeof createdAt === "number" && now - createdAt > SIGNAL_TTL_MS;
    });
    for (const entry of expired) {
      await deleteDoc(entry.ref);
      console.info(`[signalCloud] expired doc deleted: ${entry.id}`);
    }
  } catch (error) {
    console.warn("[signalCloud] sweep failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * Client-side real-time listener. Returns an unsubscribe function.
 * Emits only fresh (<4h) documents; never throws (errors are logged).
 */
export function subscribeSignals(onSignals: (signals: CloudDoc[]) => void): () => void {
  const db = getCloudDb();
  if (!db) {
    console.info(`[signalCloud] listener off (${initReason}) — using localStorage backup.`);
    return () => {};
  }
  try {
    return onSnapshot(
      collection(db, SIGNALS_COLLECTION),
      (snapshot) => {
        const now = Date.now();
        const fresh = snapshot.docs
          .map((entry) => entry.data() as CloudDoc)
          .filter((signal) => isFresh(signal, now));
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
 * Real-time listener for the Results page — same as `subscribeSignals()` but
 * WITHOUT the 4h freshness filter, so the full 30-day history shows up
 * (documents past the TTL are deleted by `sweepExpired()` anyway). Every doc
 * is returned with its Firestore id attached. Never throws.
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
      collection(db, SIGNALS_COLLECTION),
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