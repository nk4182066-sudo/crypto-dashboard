// Kelly Criterion is a mathematical formula for
// optimal position sizing. Educational tool only.
import React from "react";

interface KellyInputs {
  balance: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

interface KellyResult {
  kellyPct: number;
  positionSize: number;
  riskPerTrade: number;
  safeKellyPct: number;
  warning: string | null;
}

const DEFAULTS: KellyInputs = {
  balance: 1000,
  winRate: 50,
  avgWin: 200,
  avgLoss: 100,
};

// Kelly = W - ((1 - W) / R), W = win rate decimal, R = avg win / avg loss.
function computeKelly({
  balance,
  winRate,
  avgWin,
  avgLoss,
}: KellyInputs): KellyResult {
  const W = winRate / 100;
  const R = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kellyRaw = R > 0 ? W - (1 - W) / R : -1;
  const kellyPct = Math.max(0, Math.min(100, kellyRaw)) * 100;

  let warning: string | null = null;
  if (kellyRaw < 0) warning = "Negative edge, trading na karein";
  else if (kellyRaw > 0.25) warning = "Bohot aggressive, careful raho";

  return {
    kellyPct,
    positionSize: (kellyPct / 100) * balance,
    riskPerTrade: (kellyPct / 100) * balance,
    safeKellyPct: kellyPct / 2,
    warning,
  };
}

const FIELD_CLASS =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none";

const KellyCriterion: React.FC = () => {
  const [inputs, setInputs] = React.useState<KellyInputs>(DEFAULTS);
  const result = React.useMemo(() => computeKelly(inputs), [inputs]);

  const update = (key: keyof KellyInputs) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      setInputs((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
    };

  const fields: { key: keyof KellyInputs; label: string }[] = [
    { key: "balance", label: "Account Balance ($)" },
    { key: "winRate", label: "Win Rate (%)" },
    { key: "avgWin", label: "Average Win ($)" },
    { key: "avgLoss", label: "Average Loss ($)" },
  ];

  return (
    <section
      aria-label="Kelly Criterion position sizing"
      className="border border-zinc-800 bg-zinc-950/60 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Kelly Criterion</h3>
        <span className="text-xs text-zinc-500">Position sizing</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="text-xs text-zinc-400">
            {f.label}
            <input
              type="number"
              min={0}
              value={inputs[f.key]}
              onChange={update(f.key)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </label>
        ))}
      </div>

      <dl className="mt-3 space-y-1 border-t border-zinc-800 pt-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Kelly % (optimal risk)</dt>
          <dd className="font-semibold text-emerald-400">{result.kellyPct.toFixed(2)}%</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Recommended position size ($)</dt>
          <dd className="text-white">${result.positionSize.toFixed(2)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Recommended risk per trade ($)</dt>
          <dd className="text-white">${result.riskPerTrade.toFixed(2)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400">Safe Kelly (conservative, half)</dt>
          <dd className="text-amber-300">{result.safeKellyPct.toFixed(2)}%</dd>
        </div>
      </dl>

      {result.warning && (
        <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">
          ⚠ {result.warning}
        </p>
      )}
    </section>
  );
};

export { computeKelly };
export default KellyCriterion;
