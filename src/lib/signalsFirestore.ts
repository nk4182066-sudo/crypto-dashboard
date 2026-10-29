/**
 * src/lib/signalsFirestore.ts — Firestore-only reads for the signals dashboard.
 *
 * The frontend reads ONLY from Firestore (collection `signals`), never from a
 * direct API. Works on mobile data / Wi-Fi even when the PC is off because the
 * data lives in the cloud and is written by the Cloud Functions scanner.
 *
 * All reads use Array.isArray guards to avoid the "signals is not iterable"
 * runtime error.
 *
 * Educational analysis only — not financial advice.
 */

import { db } from "./firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

export type SignalStatus = "today" | "week" | "month";

export interface FirestoreSignal {
  id: string;
  symbol: string;
  market: string;
  date: string;
  time: string;
  status: SignalStatus;
  _identity: string;
  signalIdentity: string;
  price?: number;
  direction?: string;
  score?: number;
  conditionsPassed?: number;
  conditionsTotal?: number;
  expertsAgreed?: number;
  expertsTotal?: number;
  support?: number;
  resistance?: number;
  atr?: number;
  trend?: string;
  pattern?: string | null;
  candlestick?: string | null;
  createdAt?: unknown;
}

/** Safely convert a Firestore doc to a FirestoreSignal. Never throws. */
function docToSignal(doc: QueryDocumentSnapshot): FirestoreSignal {
  const data = doc.data();
  return {
    id: doc.id,
    symbol: typeof data.symbol === "string" ? data.symbol : "",
    market: typeof data.market === "string" ? data.market : "",
    date: typeof data.date === "string" ? data.date : "",
    time: typeof data.time === "string" ? data.time : "",
    status: (data.status === "today" || data.status === "week" || data.status === "month")
      ? data.status
      : "today",
    _identity: typeof data._identity === "string" ? data._identity : "",
    signalIdentity: typeof data.signalIdentity === "string" ? data.signalIdentity : "",
    price: typeof data.price === "number" ? data.price : undefined,
    direction: typeof data.direction === "string" ? data.direction : undefined,
    score: typeof data.score === "number" ? data.score : undefined,
    conditionsPassed: typeof data.conditionsPassed === "number" ? data.conditionsPassed : undefined,
    conditionsTotal: typeof data.conditionsTotal === "number" ? data.conditionsTotal : undefined,
    expertsAgreed: typeof data.expertsAgreed === "number" ? data.expertsAgreed : undefined,
    expertsTotal: typeof data.expertsTotal === "number" ? data.expertsTotal : undefined,
    support: typeof data.support === "number" ? data.support : undefined,
    resistance: typeof data.resistance === "number" ? data.resistance : undefined,
    atr: typeof data.atr === "number" ? data.atr : undefined,
    trend: typeof data.trend === "string" ? data.trend : undefined,
    pattern: typeof data.pattern === "string" ? data.pattern : null,
    candlestick: typeof data.candlestick === "string" ? data.candlestick : null,
    createdAt: data.createdAt,
  };
}

/** Read signals from Firestore filtered by status, ordered by time descending. */
export async function readSignalsByStatus(
  status: SignalStatus,
  maxResults: number
): Promise<FirestoreSignal[]> {
  if (!db) return [];
  try {
    const q = query(
      collection(db, "signals"),
      where("status", "==", status),
      orderBy("time", "desc"),
      limit(maxResults)
    );
    const snap = await getDocs(q);
    const signals: FirestoreSignal[] = [];
    snap.forEach((doc) => {
      signals.push(docToSignal(doc));
    });
    return signals;
  } catch (error) {
    console.warn(`[signalsFirestore] readSignalsByStatus(${status}) failed:`,
      error instanceof Error ? error.message : error);
    return [];
  }
}

/** Read today's signals (limit 10). */
export async function readTodaySignals(): Promise<FirestoreSignal[]> {
  return readSignalsByStatus("today", 10);
}

/** Read this week's signals (limit 20). */
export async function readWeekSignals(): Promise<FirestoreSignal[]> {
  return readSignalsByStatus("week", 20);
}

/** Read this month's signals (limit 30). */
export async function readMonthSignals(): Promise<FirestoreSignal[]> {
  return readSignalsByStatus("month", 30);
}

/** Safe array guard — returns [] if value is not an array. */
export function safeSignalsArray(value: unknown): FirestoreSignal[] {
  return Array.isArray(value) ? (value as FirestoreSignal[]) : [];
}