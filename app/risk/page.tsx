"use client";

import AuthGuard from "@/components/AuthGuard";

// Risk Manager — simple educational position-size calculator.
// 3 inputs (balance, leverage, risk %), auto-computed as you type; the
// Calculate button re-runs the same handler and confirms the snapshot.
// Educational calculator only — not "Signal"/"advice". Not financial advice.
import { useCallback, useEffect, useState } from "react";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50] as const;

interface RiskResults {
  /** Balance × (Risk% / 100) — the amount actually at risk. */
  riskAmount: string;
  /** Max loss equals the risked amount (NOT position ÷ leverage). */
  maxLoss: string;
  /** Balance × Leverage — total position value in USDT. */
  positionSize: string;
  /** Conservative half of the risked amount (spec: risk ÷ 2). */
  safeTrade: string;
  /** Approx adverse move % that triggers liquidation (100 / leverage). */
  liquidationMovePct: string;
}

function money(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskPage() {
  return (
    <AuthGuard>
      <RiskPageContent />
    </AuthGuard>
  );
}

function RiskPageContent() {
  const [balance, setBalance] = useState<string>("1000");
  const [leverage, setLeverage] = useState<number>(1);
  const [riskPercent, setRiskPercent] = useState<string>("1");
  const [results, setResults] = useState<RiskResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = useCallback(() => {
    if (!balance || !leverage) {
      setError("Balance aur leverage daalein");
      return;
    }

    const bal = Number(balance);
    const risk = Number(riskPercent);
    if (!Number.isFinite(bal) || bal <= 0) {
      setError("Balance 0 se zyada daalein");
      return;
    }
    if (!Number.isFinite(risk) || risk < 0) {
      setError("Risk % theek daalein");
      return;
    }

    // CORRECTED (MASLA 3) — spec math:
    //   Risk Amount = Balance × (Risk% / 100)  -> 20 × 3%  = $0.60
    //   Position    = Balance × Leverage       -> 20 × 20x = $400
    //   Max Loss    = Risk Amount               (never divided by leverage)
    //   Safe Trade  = Risk Amount ÷ 2 (conservative)
    const riskAmount = (bal * risk) / 100;
    const positionSize = bal * leverage;
    const maxLoss = riskAmount;
    const safeTrade = riskAmount / 2;
    // Isolated-margin liquidation ≈ a 1/leverage move against entry
    // (ignores maintenance margin + fees — educational approximation).
    const liquidationMovePct = leverage > 0 ? 100 / leverage : 0;

    setResults({
      riskAmount: riskAmount.toFixed(2),
      maxLoss: maxLoss.toFixed(2),
      positionSize: positionSize.toFixed(2),
      safeTrade: safeTrade.toFixed(2),
      liquidationMovePct: liquidationMovePct.toFixed(2),
    });
    setError(null);
  }, [balance, leverage, riskPercent]);

  // Auto-calculate as the user types (handleCalculate changes with the inputs).
  useEffect(() => {
    handleCalculate();
  }, [handleCalculate]);

  // Display helpers for the spec Roman Urdu sentence (3% → safe 1.5%).
  const riskNum = Number(riskPercent) || 0;
  const halfRisk = Number((riskNum / 2).toFixed(2));

  return (
    <main className="mx-auto max-w-3xl px-4 py-4">
      <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Tools</p>
      <h1 className="mb-4 text-2xl font-bold" style={{ color: TEXT }}>💰 Risk Manager</h1>

      {/* Inputs */}
      <div className="flex flex-col gap-3">
        <Field label="Account Balance ($)">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="1000"
            className="w-full bg-transparent text-base font-semibold outline-none"
            style={{ color: TEXT }}
          />
        </Field>

        <Field label="Leverage">
          <select
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full bg-transparent text-base font-semibold outline-none"
            style={{ color: TEXT }}
          >
            {LEVERAGE_OPTIONS.map((lev) => (
              <option key={lev} value={lev} style={{ backgroundColor: CARD, color: TEXT }}>
                {lev}x
              </option>
            ))}
          </select>
        </Field>

        <Field label="Risk % (default 1)">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
            placeholder="1"
            className="w-full bg-transparent text-base font-semibold outline-none"
            style={{ color: TEXT }}
          />
        </Field>
      </div>

      {/* Calculate — values also update in real time; the button re-runs the handler. */}
      <button
        type="button"
        onClick={handleCalculate}
        className="mt-4 w-full rounded-xl py-3 text-sm font-bold transition-colors"
        style={{ backgroundColor: GREEN, color: BG }}
      >
        Calculate
      </button>

      {error && (
        <p className="mt-2 text-xs font-semibold" style={{ color: RED }}>{error}</p>
      )}

      {/* Divider */}
      <div className="my-5 border-t" style={{ borderColor: BORDER }} />

      {/* Results — spec panel: input echo, then the corrected metrics. */}
      <section aria-label="Risk results" className="rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-3 text-sm font-bold" style={{ color: TEXT }}>💰 RISK ANALYSIS</h2>
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Balance" value={money(Number(balance) || 0)} />
          <Row label="Leverage" value={`${leverage}x`} />
          <Row label="Risk %" value={`${riskNum}%`} />
        </div>
        <div className="my-3 border-t" style={{ borderColor: BORDER }} />
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Risk Amount" value={`${money(Number(results?.riskAmount ?? 0))} USDT`} valueColor={GREEN} />
          <Row label="Position Size" value={`${money(Number(results?.positionSize ?? 0))} USDT`} />
          <Row label="Max Loss" value={`${money(Number(results?.maxLoss ?? 0))} USDT`} valueColor={RED} />
          <Row label="Safe Trade" value={`${money(Number(results?.safeTrade ?? 0))} USDT`} valueColor={GREEN} />
          <Row
            label="Liquidation"
            value={`≈ ${results?.liquidationMovePct ?? "0.00"}% move`}
            valueColor={MUTED}
            note="against entry (isolated, approx)"
          />
        </div>
      </section>

      {/* Roman Urdu summary */}
      <section aria-label="Roman Urdu summary" className="mt-3 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-2 text-sm font-bold" style={{ color: TEXT }}>💬 Roman Urdu:</h2>
        <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
          {error
            ? "Balance aur leverage theek se bharein, phir calculate karein."
            : `Is trade mein aap ${money(Number(results?.maxLoss ?? 0))} (${riskNum}%) lose kar sakte hain. Total position ${money(Number(results?.positionSize ?? 0))} ki hai. Safe rehne ke liye ${money(Number(results?.safeTrade ?? 0))} (${halfRisk}%) use karo.`}
        </p>
      </section>

      <p className="mt-4 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational calculator only. Not financial advice.
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block rounded-2xl border p-3" style={{ backgroundColor: CARD, borderColor: BORDER }}>
      <span className="mb-1 block text-xs font-semibold" style={{ color: MUTED }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, valueColor, note }: { label: string; value: string; valueColor?: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold" style={{ color: MUTED }}>{label}</span>
      <span className="text-right text-sm font-bold" style={{ color: valueColor ?? TEXT }}>
        {value}
        {note ? <span className="ml-1 text-xs font-normal" style={{ color: MUTED }}>{note}</span> : null}
      </span>
    </div>
  );
}

