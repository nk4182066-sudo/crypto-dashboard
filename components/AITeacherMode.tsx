// Educational analysis only. Not financial advice.

import type { Candle } from "@/src/analysis/types";
import type { ConfluenceScoreResult } from "@/src/lib/ai/confluenceScore";

interface AITeacherModeProps {
  symbol: string;
  candles: Candle[];
  confluenceScore: ConfluenceScoreResult;
}

function getScoreColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function getVerdictLabel(score: number): string {
  if (score >= 75) return "STRONG";
  if (score >= 50) return "MODERATE";
  return "WEAK";
}

function generateTeacherText(score: ConfluenceScoreResult, symbol: string): string {
  const lines: string[] = [];
  lines.push(`Aaj ${symbol} ka analysis:`);
  const b = score.breakdown;

  // What's happening in market
  if (b.timeframes === 25) lines.push("- Sabhi 4 timeframes bullish hain, short-term aur long-term trend upar ja raha hai");
  else if (b.timeframes === 18) lines.push("- 3/4 timeframes bullish hain, short-term aur long-term trend upar ja raha hai");
  else if (b.timeframes === 10) lines.push("- 2/4 timeframes bullish hain, trend ka support kam hai");
  else lines.push("- Timeframe alignment kam hai, trend sideways ya weak hai");

  if (b.patterns === 25) lines.push("- 3+ bullish patterns detect hain, setup solid hai");
  else if (b.patterns === 15) lines.push("- 2 patterns detect hain, medium confluence hai");
  else if (b.patterns === 8) lines.push("- 1 pattern detect hua, single confirmation hai");
  else lines.push("- Koi pattern na detect ho, setup ka confidence weak hai");

  if (b.keyLevel === 20) lines.push("- Price support zone ke qareeb hai, entry favorable hai");
  else if (b.keyLevel === 10) lines.push("- Price mid-range mein hai, neutral zone");
  else lines.push("- Price resistance ke qareeb hai, entry risky hai");

  if (b.volume === 15) lines.push("- Volume high hai, trend ka strength strong hai");
  else if (b.volume === 8) lines.push("- Volume normal hai, isliye confidence medium hai");
  else lines.push("- Volume low hai, confidence weak hai");

  if (b.indicators === 15) lines.push("- RSI aur MACD dono bullish hain, setup strong hai");
  else if (b.indicators === 8) lines.push("- Ek indicator bullish hai, doosra neutral hai, wait karein");
  else lines.push("- Dono indicators neutral hain, wait karein");

  // Why score is what it is
  lines.push("- Total score: " + score.totalScore + "/100");
  lines.push("- Confluence: " + score.verdict + " (" + score.verdictText + ")");

  // What to watch for
  if (score.verdict === "STRONG") lines.push("- Entry ko leke careful socho, lagega setup strong hai");
  else if (score.verdict === "MODERATE") lines.push("- Confirmation candle ka wait karein, volume ya RSI change dekhein");
  else lines.push("- Practice karein aur wait karein, takay better setup a jaye");

  return lines.join("\n");
}

export function AITeacherMode({ symbol, candles, confluenceScore }: AITeacherModeProps) {
  const { totalScore, breakdown, verdict, verdictText } = confluenceScore;
  const scoreColor = getScoreColor(totalScore);
  const verdictLabel = getVerdictLabel(totalScore);

  return (
    <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-center mb-4">
        <div
          className={`w-32 h-32 rounded-full ${scoreColor} flex items-center justify-center text-white text-5xl font-bold`}
        >
          {totalScore}
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="text-sm text-zinc-500 uppercase tracking-wide">Verdict</p>
        <p className="text-2xl font-bold text-zinc-200">{verdictLabel}</p>
        <p className="text-zinc-400 text-sm">{verdictText}</p>
      </div>

      <div className="space-y-3 mb-6">
        {[
          { label: "Timeframes", max: 25, value: breakdown.timeframes },
          { label: "Patterns", max: 25, value: breakdown.patterns },
          { label: "Key Level", max: 20, value: breakdown.keyLevel },
          { label: "Volume", max: 15, value: breakdown.volume },
          { label: "Indicators", max: 15, value: breakdown.indicators },
        ].map((cat) => (
          <div key={cat.label}>
            <div className="flex justify-between text-sm text-zinc-400 mb-1">
              <span>{cat.label}</span>
              <span>{cat.value} / {cat.max}</span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(cat.value / cat.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-bold text-zinc-200 mb-2">Teacher Explanation</h3>
        <p className="text-zinc-300 whitespace-pre-line text-sm leading-relaxed">
          {generateTeacherText(confluenceScore, symbol)}
        </p>
      </div>

      <div className="border-t border-zinc-700 pt-4 mt-4 text-center text-xs text-zinc-500">
        Educational analysis only. Not financial advice.
      </div>
    </div>
  );
}
