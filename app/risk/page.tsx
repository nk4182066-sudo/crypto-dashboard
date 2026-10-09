"use client";

// Risk Manager — simple educational position-size calculator.
// 3 inputs (balance, leverage, risk %), auto-computed as you type.
// Educational calculator only — not "Signal"/"advice". Not financial advice.
import { useMemo, useState } from "react";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";
const RED = "#F6465D";

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50] as const;

function money(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskPage() {
  const [balance, setBalance] = useState<string>("1000");
  const [leverage, setLeverage] = useState<number>(1);
  const [riskPercent, setRiskPercent] = useState<string>("1");

  const calc = useMemo(() => {
    const bal = Number(balance);
    const risk = Number(riskPercent);
    const safeBalance = Number.isFinite(bal) && bal > 0 ? bal : 0;
    const safeRisk = Number.isFinite(risk) && risk >= 0 ? risk : 0;
    const safeLeverage = Number.isFinite(leverage) && leverage > 0 ? leverage : 1;

    const maxLoss = (safeBalance * safeRisk) / 100;
    const positionSize = safeBalance * safeLeverage;
    const safeTrade = maxLoss;
    // Approx isolated-margin liquidation distance in dollar terms.
    const liquidation = safeBalance - safeBalance / safeLeverage;

    return { maxLoss, positionSize, safeTrade, liquidation };
  }, [balance, leverage, riskPercent]);

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

      {/* Calculate (values update in real time; button confirms the snapshot) */}
      <button
        type="button"
        className="mt-4 w-full rounded-xl py-3 text-sm font-bold transition-colors"
        style={{ backgroundColor: GREEN, color: BG }}
      >
        Calculate
      </button>

      {/* Divider */}
      <div className="my-5 border-t" style={{ borderColor: BORDER }} />

      {/* Results */}
      <section aria-label="Risk results" className="rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-3 text-sm font-bold" style={{ color: TEXT }}>📊 RESULTS:</h2>
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Max Loss" value={money(calc.maxLoss)} valueColor={RED} />
          <Row label="Position Size" value={money(calc.positionSize)} />
          <Row label="Safe Trade" value={money(calc.safeTrade)} />
          <Row label="Liquidation" value={money(calc.liquidation)} valueColor={MUTED} />
        </div>
      </section>

      {/* Roman Urdu summary */}
      <section aria-label="Roman Urdu summary" className="mt-3 rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
        <h2 className="mb-2 text-sm font-bold" style={{ color: TEXT }}>💬 Roman Urdu:</h2>
        <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
          Is trade mein aap {money(calc.maxLoss)} lose kar sakte hain. Total position{" "}
          {money(calc.positionSize)}. Safe raho.
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

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold" style={{ color: MUTED }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: valueColor ?? TEXT }}>{value}</span>
    </div>
  );
}

