"use client";

/**
 * Position Size Calculator uses Kelly Criterion for
 * optimal risk management. Educational tool only.
 */

import { useState } from "react";

interface FormState {
  balance: string;
  risk: string;
  entry: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  winRate: string;
  rr: string;
}

interface Result {
  size: number;
  value: number;
  riskAmount: number;
  profit: number;
  rr: number;
  kelly: number;
}

const EMPTY: FormState = { balance: "1000", risk: "1", entry: "", stop: "", tp1: "", tp2: "", tp3: "", winRate: "50", rr: "2" };

const INPUT = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white";

const money = (value: number) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const qty = (value: number) => (value >= 1 ? value.toFixed(2) : value.toFixed(4));

export default function PositionSizeCalculator() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  // Keeps R:R in sync with TP1 whenever the price inputs change.
  const update = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "entry" || key === "stop" || key === "tp1") {
        const entry = Number(next.entry);
        const priceRisk = Math.abs(entry - Number(next.stop));
        const reward = Math.abs(Number(next.tp1) - entry);
        if (priceRisk > 0 && reward > 0) next.rr = (reward / priceRisk).toFixed(2);
      }
      return next;
    });
  };

  function calculate() {
    setError("");
    setResult(null);

    const balance = Number(form.balance);
    const risk = Number(form.risk);
    const entry = Number(form.entry);
    const stop = Number(form.stop);
    const tp1 = Number(form.tp1);
    const winRate = Number(form.winRate);
    const optional = [form.tp2, form.tp3].filter((value) => value.trim() !== "").map(Number);
    const required = [balance, risk, entry, stop, tp1, winRate];

    if (!required.every((value) => Number.isFinite(value) && value > 0)) {
      setError("Sab required fields mein positive numbers daliye.");
      return;
    }
    if (optional.some((value) => !Number.isFinite(value) || value <= 0)) {
      setError("TP2 aur TP3 khali chhorein ya positive number daliye.");
      return;
    }
    if (winRate >= 100) {
      setError("Win Rate 0 aur 100 ke darmiyan hona chahiye.");
      return;
    }
    if (entry === stop) {
      setError("Entry aur Stop Loss same nahi ho sakte");
      return;
    }
    if (entry === tp1) {
      setError("Entry aur TP1 same nahi ho sakte");
      return;
    }

    const priceRisk = Math.abs(entry - stop);
    const reward = Math.abs(tp1 - entry);
    const riskAmount = balance * (risk / 100);
    const size = riskAmount / priceRisk;
    const rr = reward / priceRisk;
    const w = winRate / 100;

    setResult({ size, value: size * entry, riskAmount, profit: size * reward, rr, kelly: w - (1 - w) / rr });
  }

  const field = (label: string, key: keyof FormState, min = "0.000001", max?: string, placeholder?: string) => (
    <label className="block text-xs text-zinc-400">
      {label}
      <input type="number" min={min} max={max} step="any" placeholder={placeholder} value={form[key]} onChange={update(key)} className={INPUT} />
    </label>
  );

  const row = (label: string, helper: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-white">{label}</p>
        <p className="text-[11px] text-zinc-600">{helper}</p>
      </div>
      <p className="text-sm font-semibold text-purple-200">{value}</p>
    </div>
  );

  const kellySuggestion = result && result.kelly > 0 ? Math.min(Math.max(result.kelly * 50, 0.1), 10) : null;

  return (
    <section className="rounded-xl border border-purple-500/40 bg-zinc-900/70 p-4" aria-label="Position size calculator">
      <h3 className="text-sm font-bold tracking-wide text-purple-200">📊 POSITION SIZE CALCULATOR</h3>
      <p className="mt-1 text-xs text-zinc-400">Apni trade ka size aur R:R calculate karein</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("Account Balance ($)", "balance", "1", undefined, "1000")}
        {field("Risk Percentage (%)", "risk", "0.1", "10", "1")}
        {field("Entry Price", "entry")}
        {field("Stop Loss Price", "stop")}
        {field("Take Profit 1 (TP1)", "tp1")}
        {field("Take Profit 2 (TP2) — optional", "tp2", "0.000001", undefined, "khali")}
        {field("Take Profit 3 (TP3) — optional", "tp3", "0.000001", undefined, "khali")}
        {field("Win Rate (%)", "winRate", "1", "99", "50")}
        {field("Reward/Risk Ratio (auto)", "rr", "0.01", undefined, "2")}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={calculate} className="rounded bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:from-purple-400 hover:to-fuchsia-400">
          Calculate
        </button>
        <button type="button" onClick={() => { setForm(EMPTY); setResult(null); setError(""); }} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
          Reset
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {row("Position Size", "Kitni quantity khareedni hai", `${qty(result.size)} units`)}
          {row("Position Value", "Position ki total value", money(result.value))}
          {row("Risk Amount", "Kitna risk ho raha hai", money(result.riskAmount))}
          {row("Potential Profit", "Agar TP hit ho to profit", `${money(result.profit)} (TP1)`)}
          {row("R:R Ratio", "Reward aur risk ka ratio", `1 : ${result.rr.toFixed(2)}`)}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
            <div className="h-full bg-red-500" style={{ width: `${100 / (1 + result.rr)}%` }} />
            <div className="h-full bg-emerald-500" style={{ width: `${100 * (result.rr / (1 + result.rr))}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500"><span>Risk</span><span>Reward</span></div>
          {result.rr < 1.5
            ? <p className="text-sm font-semibold text-orange-400">⚠️ Low R:R. Careful raho.</p>
            : result.rr >= 2
              ? <p className="text-sm font-semibold text-emerald-400">✅ Achi R:R hai.</p>
              : null}
          {kellySuggestion
            ? row("Kelly Suggestion", "Optimal risk percentage", `Use ${kellySuggestion.toFixed(1)}% risk`)
            : row("Kelly Suggestion", "Optimal risk percentage", "Kelly negative — trade skip karein")}
        </div>
      )}

      <p className="mt-4 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">⚠️ Ye sirf calculator hai. Trading advice nahi.</p>
    </section>
  );
}

