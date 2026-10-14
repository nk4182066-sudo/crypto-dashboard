// Background signal watcher — polls /api/signals/check every 15 minutes and
// raises a local notification for any NEW 90+ score setup. Educational only.

import { alertsEnabled, showNotification } from "@/src/lib/notifications";
import { formatPrice } from "@/src/lib/formatPrice";

/** Only setups at or above this score raise an alert (Rule: 90+ only). */
export const ALERT_MIN_SCORE = 90;

/** How often the watcher re-checks for new setups. */
export const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** localStorage key holding the ids we have already alerted about. */
export const NOTIFIED_KEY = "notified-signals";

/** Keep only the newest ids so the list never grows without bound. */
const MAX_NOTIFIED = 200;

/** One setup returned by /api/signals/check. */
export interface AlertSignal {
  id: string;
  symbol: string;
  score: number;
  pattern: string | null;
  candlestick: string | null;
  direction: "bullish" | "bearish" | "neutral";
  entry: number;
  stopLoss: number | null;
  tp1: number | null;
}

/** Read the already-notified id list. Returns [] on any problem. */
function loadNotified(): string[] {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveNotified(ids: string[]): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(ids.slice(0, MAX_NOTIFIED)));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function money(value: number | null): string {
  return value == null ? "—" : formatPrice(value);
}

/**
 * Fetch 90+ setups and notify about any we have not alerted on yet.
 * Returns the number of new notifications raised.
 */
export async function checkForSignals(): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (!("Notification" in window) || Notification.permission !== "granted") return 0;
  // User toggled alerts off — stay silent until they turn it back on.
  if (!alertsEnabled()) return 0;

  try {
    const response = await fetch(`/api/signals/check?minScore=${ALERT_MIN_SCORE}`, { cache: "no-store" });
    if (!response.ok) return 0;
    const payload = (await response.json()) as { signals?: AlertSignal[] };
    const signals = Array.isArray(payload.signals) ? payload.signals : [];

    const already = new Set(loadNotified());
    const fresh = signals.filter((signal) => signal.score >= ALERT_MIN_SCORE && !already.has(signal.id));

    for (const signal of fresh) {
      const patternWord = signal.pattern ?? signal.candlestick ?? "Setup";
      const title = `🚨 ${signal.symbol} Alert`;
      const body = `Score ${signal.score}/100 — ${patternWord} · Entry: ${money(signal.entry)} · Tap to open →`;
      await showNotification(title, body, `/trade?symbol=${encodeURIComponent(signal.symbol)}`);
    }

    if (fresh.length > 0) {
      saveNotified([...fresh.map((signal) => signal.id), ...already]);
    }
    return fresh.length;
  } catch {
    // Network / parse failure — keep stored state, try again next interval.
    return 0;
  }
}

let timer: number | null = null;

/**
 * Start the watcher: run one check now, then re-check every 15 minutes. Safe to
 * call multiple times — a previous interval is cleared first. Only runs when the
 * user has already granted notification permission.
 */
export function initWatcher(): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  // Respect the user's on/off switch (localStorage "notifications-enabled").
  if (!alertsEnabled()) return;

  if (timer !== null) window.clearInterval(timer);
  void checkForSignals();
  timer = window.setInterval(() => void checkForSignals(), CHECK_INTERVAL_MS);
}

/** Stop the watcher (used when the tab unloads or permission is revoked). */
export function stopWatcher(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}
