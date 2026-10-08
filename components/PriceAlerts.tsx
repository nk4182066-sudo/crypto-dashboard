"use client";

/**
 * Price Alerts watch a symbol and notify you when the target price is hit.
 * Educational tool only. Not financial advice.
 */

import { useEffect, useState } from "react";

interface Alert {
  id: number;
  symbol: string;
  target: number;
  direction: "above" | "below";
}

const STORAGE_KEY = "price-alerts-v1";
const CHECK_MS = 30_000;
const INPUT = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white";
const SYMBOL_PATTERN = /^[A-Z0-9.^=_-]{1,24}$/;

function loadAlerts(): Alert[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) ? (parsed as Alert[]) : [];
  } catch {
    return [];
  }
}

function saveAlerts(alerts: Alert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Storage full or blocked — alerts still live for this session.
  }
}

/** 3-letter pairs such as EUR-USD route to Frankfurter; everything else is a quote feed. */
function marketFor(symbol: string): string {
  return /^[A-Z]{3}-[A-Z]{3}$/.test(symbol) ? "forex" : "crypto";
}

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const query = new URLSearchParams({ market: marketFor(symbol), symbol, timeframe: "15m", quoteOnly: "1" });
    const response = await fetch(`/api/market/history?${query}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { quote?: { price?: number | null } };
    const price = payload.quote?.price;
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

/** Browser notification — only sent when the user already granted permission. */
function notify(alert: Alert, price: number): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const symbol = alert.direction === "above" ? `${alert.symbol} upar gaya` : `${alert.symbol} neeche gaya`;
  try {
    new Notification("Price Alert trigger hua", { body: `${symbol} — target ${alert.target} · abhi ${price}` });
  } catch {
    // Some browsers throw on notification outside a secure context.
  }
}

export default function PriceAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [symbol, setSymbol] = useState("BTC-USD");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Restore once on mount so the first render does not wipe stored alerts.
  // The value is applied in a microtask, matching the repo's useStoredState
  // pattern, which keeps setState out of the synchronous effect body.
  useEffect(() => {
    const restored = loadAlerts();
    queueMicrotask(() => {
      setAlerts(restored);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAlerts(alerts);
  }, [alerts, ready]);

  // 30-second sweep: one quote request per unique symbol, then trigger matching alerts.
  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = setInterval(async () => {
      const symbols = [...new Set(alerts.map((alert) => alert.symbol))];
      const quotes = new Map<string, number>();
      await Promise.all(symbols.map(async (item) => {
        const price = await fetchPrice(item);
        if (price !== null) quotes.set(item, price);
      }));

      const hit = alerts.filter((alert) => {
        const price = quotes.get(alert.symbol);
        if (price === undefined) return false;
        return alert.direction === "above" ? price >= alert.target : price <= alert.target;
      });
      if (hit.length === 0) return;

      const hitIds = new Set(hit.map((alert) => alert.id));
      setAlerts((current) => current.filter((alert) => !hitIds.has(alert.id)));
      hit.forEach((alert) => notify(alert, quotes.get(alert.symbol) ?? 0));
      setNotice(`${hit.length} alert trigger hua.`);
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [alerts]);

  function addAlert(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const normalised = symbol.trim().toUpperCase();
    const price = Number(target);

    if (!SYMBOL_PATTERN.test(normalised)) {
      setError("Sahi symbol daliye. Misal: BTC-USD ya EUR-USD");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("Target price positive number hona chahiye.");
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setAlerts((current) => [{ id: Date.now(), symbol: normalised, target: price, direction }, ...current]);
    setTarget("");
  }

  function removeAlert(id: number): void {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }

  return (
    <section className="rounded-xl border border-purple-500/40 bg-zinc-900/70 p-4" aria-label="Price alerts">
      <h3 className="text-sm font-bold tracking-wide text-purple-200">🔔 PRICE ALERTS</h3>
      <p className="mt-1 text-xs text-zinc-400">Target price touch ho to alert milega</p>

      <form onSubmit={addAlert} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-xs text-zinc-400">Symbol (coin/pair)
          <input value={symbol} onChange={(event) => setSymbol(event.target.value)} className={`${INPUT} w-32`} placeholder="BTC-USD" />
        </label>
        <label className="block text-xs text-zinc-400">Target Price
          <input type="number" min="0" step="any" value={target} onChange={(event) => setTarget(event.target.value)} className={`${INPUT} w-32`} placeholder="Price level" />
        </label>
        <label className="block text-xs text-zinc-400">Condition (upar/neeche)
          <select value={direction} onChange={(event) => setDirection(event.target.value as "above" | "below")} className={INPUT}>
            <option value="above">Upar (Above)</option>
            <option value="below">Neeche (Below)</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:from-purple-400 hover:to-fuchsia-400">
          Alert Lagao
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {notice && <p className="mt-2 text-sm text-emerald-400">{notice}</p>}

      <ul className="mt-3 space-y-2">
        {alerts.length === 0 && <li className="text-xs text-zinc-500">Koi active alert nahi. Naya alert banayein.</li>}
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
            <span>{alert.direction === "above" ? "↑" : "↓"} {alert.symbol} — {alert.direction === "above" ? "upar" : "neeche"} {alert.target}</span>
            <button type="button" onClick={() => removeAlert(alert.id)} aria-label={`Delete alert for ${alert.symbol}`} className="text-zinc-400 hover:text-white">🗑 Delete</button>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">⚠️ Ye sirf alert tool hai. Trading advice nahi.</p>
    </section>
  );
}
