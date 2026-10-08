"use client";

/**
 * Risk Calculator helps users determine safe position sizes.
 * This is a math tool only. Not financial advice.
 */

import { useState } from "react";

interface FormState {
  balance: string;
  risk: string;
  entry: string;
  stop: string;
}

interface Result {
  riskAmount: number;
  positionSize: number;
  positionValue: number;
}

const EMPTY: FormState = { balance: "1000", risk: "1", entry: "", stop: "" };

/** 2 decimals for larger values, 4 for sub-1 quantities. */
const fmt = (value: number): string => (value >= 1 ? value.toFixed(2) : value.toFixed(4));

const INPUT = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white";

export default function RiskCalculator() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const update = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function calculate() {
    setError("");
    setWarning("");
    setResult(null);

    const balance = Number(form.balance);
    const risk = Number(form.risk);
    const entry = Number(form.entry);
    const stop = Number(form.stop);

    if (![balance, risk, entry, stop].every((value) => Number.isFinite(value) && value > 0)) {
      setError("Sab fields mein positive numbers daliye.");
      return;
    }
    if (risk < 0.1 || risk > 10) {
      setError("Risk 0.1% aur 10% ke darmiyan hona chahiye.");
      return;
    }
    if (entry === stop) {
      setError("Entry aur Stop Loss same nahi ho sakte");
      return;
    }
    if (risk > 5) setWarning("Bohot zyada risk hai");
    else if (risk > 2) setWarning("High risk");

    const riskAmount = balance * (risk / 100);
    const priceDifference = Math.abs(entry - stop);
    setResult({
      riskAmount,
      positionSize: riskAmount / priceDifference,
      positionValue: (riskAmount / priceDifference) * entry,
    });
  }

  function reset() {
    setForm(EMPTY);
    setResult(null);
    setError("");
    setWarning("");
  }

  const field = (label: string, helper: string, key: keyof FormState, min: string, max?: string) => (
    <label className="block text-xs text-zinc-400">
      {label}
      <input type="number" min={min} max={max} step="any" value={form[key]} onChange={update(key)} className={INPUT} />
      <span className="mt-1 block text-[11px] text-zinc-600">{helper}</span>
    </label>
  );

  return (
    <section className="rounded-xl border border-purple-500/40 bg-zinc-900/70 p-4" aria-label="Risk calculator">
      <h3 className="text-sm font-bold tracking-wide text-purple-200">🛡️ RISK CALCULATOR</h3>
      <p className="mt-1 text-xs text-zinc-400">Apna safe position size calculate karein</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("Account Balance ($)", "Aapke account ka total balance.", "balance", "1")}
        {field("Risk (%)", "Apne account ka kitna % risk karna chahte hain?", "risk", "0.1", "10")}
        {field("Entry Price", "Trade ki entry price.", "entry", "0.000001")}
        {field("Stop Loss", "Stop loss price.", "stop", "0.000001")}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={calculate}
          className="rounded bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:from-purple-400 hover:to-fuchsia-400"
        >
          Calculate
        </button>
        <button type="button" onClick={reset} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
          Reset
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-zinc-500">Risk Amount</p><p className="font-semibold text-white">${fmt(result.riskAmount)}</p></div>
            <div><p className="text-xs text-zinc-500">Position Size</p><p className="font-semibold text-white">{fmt(result.positionSize)} units</p></div>
            <div><p className="text-xs text-zinc-500">Position Value</p><p className="font-semibold text-white">${fmt(result.positionValue)}</p></div>
          </div>
          {warning && <p className="mt-2 text-sm font-semibold text-red-400">{warning === "High risk" ? "⚠️ High risk" : `⚠️ ${warning}`}</p>}
        </div>
      )}

      <p className="mt-4 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">⚠️ Ye sirf calculator hai. Koi trading advice nahi.</p>
    </section>
  );
}
