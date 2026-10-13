"use client";

// AnalysisInsights — Features 1-4 UI shared by the Trade and Signals pages:
//  1. TrendBadge       full-width BULLISH/BEARISH/NEUTRAL badge
//  2. ConfirmationSection  RSI/MACD/EMA/Volume rows + X/4 counter
//  3. ExpertPanel      4 AI educators + consensus verdict
//  4. GuidanceSection  expandable Roman Urdu + English expert quotes
// Educational only. Not financial advice.

import { useState } from "react";
import type {
  ConfirmationIndicator,
  ConfirmationReport,
  Consensus,
  EducatorVerdict,
  GuidanceQuote,
  SignalSide,
} from "@/src/lib/confirmations";
import { indicatorsAgreed, type IndicatorRow } from "@/src/lib/indicatorEngine";

const GREEN = "#00C087";
const RED = "#F6465D";
const YELLOW = "#F0B90B";
const MUTED = "#9CA3AF";
const TEXT = "#EAECEF";
const CARD = "#181A20";
const BORDER = "#2B3139";

/** Side → accent color. */
const sideColor = (side: SignalSide): string =>
  side === "bullish" ? GREEN : side === "bearish" ? RED : YELLOW;

const sideLabel = (side: SignalSide): string =>
  side === "bullish" ? "BULLISH" : side === "bearish" ? "BEARISH" : "NEUTRAL";

const iconGlyph = (icon: ConfirmationIndicator["icon"]): string =>
  icon === "confirm" ? "✅" : icon === "against" ? "❌" : "⚠️";

/* ── Feature 1 — full-width trend badge ─────────────────────────────────── */
export function TrendBadge({ direction, score }: { direction: SignalSide; score?: number }) {
  const color = sideColor(direction);
  return (
    <div
      className="mb-3 flex w-full items-center justify-center rounded-xl"
      style={{
        height: 50,
        backgroundColor: `${color}1F`,
        border: `1px solid ${color}`,
        color,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
        {direction === "bullish" ? "▲ " : direction === "bearish" ? "▼ " : "● "}
        {sideLabel(direction)} MARKET
      </span>
      {typeof score === "number" ? (
        <span style={{ fontSize: 18, fontWeight: 800, marginLeft: 10, opacity: 0.85 }}>
          · {score}/100
        </span>
      ) : null}
    </div>
  );
}

/* ── Feature 2 — confirmation indicators + X/4 counter ──────────────────── */
export function ConfirmationSection({
  report,
}: {
  report: Pick<ConfirmationReport, "indicators" | "confirmed" | "total">;
}) {
  const ratio = `${report.confirmed}/${report.total}`;
  const ratioColor =
    report.confirmed >= 3 ? GREEN : report.confirmed === 2 ? YELLOW : RED;
  return (
    <div className="mt-3 rounded-xl border p-3" style={{ backgroundColor: "#0F131A", borderColor: BORDER }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: TEXT }}>
          ✅ CONFIRMATION INDICATORS
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ color: ratioColor, backgroundColor: `${ratioColor}1F` }}
        >
          {ratio} Confirmed
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {report.indicators.map((indicator) => (
          <div key={indicator.name} className="flex items-center justify-between text-xs">
            <span className="font-semibold" style={{ color: MUTED }}>
              {iconGlyph(indicator.icon)} {indicator.name}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono" style={{ color: TEXT }}>{indicator.value}</span>
              <span className="font-semibold" style={{ color: sideColor(indicator.side) }}>
                {indicator.signalText}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
        {report.confirmed}/{report.total} indicators confirm the setup direction — 3/4+ is delivery-grade.
      </p>
    </div>
  );
}

/* ── KAAM 4 — the 10-indicator institutional panel ───────────────────────── */
export function IndicatorPanel({ indicators }: { indicators: IndicatorRow[] }) {
  if (indicators.length === 0) return null;
  const agreed = indicatorsAgreed(indicators);
  const total = indicators.length;
  const ratioColor = agreed >= total * 0.75 ? GREEN : agreed >= total * 0.5 ? YELLOW : MUTED;
  return (
    <div className="mt-3 rounded-xl border p-3" style={{ backgroundColor: "#0F131A", borderColor: BORDER }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: TEXT }}>
          📈 INDICATORS ({total})
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ color: ratioColor, backgroundColor: `${ratioColor}1F` }}
        >
          {agreed}/{total} Agree
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {indicators.map((indicator) => (
          <div key={indicator.id} className="flex items-start justify-between gap-2 text-xs">
            <span className="shrink-0 font-semibold" style={{ color: MUTED }}>
              {iconGlyph(indicator.icon)} {indicator.name}
            </span>
            <span className="text-right">
              <span className="font-mono" style={{ color: TEXT }}>{indicator.value}</span>
              <span className="ml-2 font-semibold" style={{ color: sideColor(indicator.side) }}>
                {indicator.status}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Feature 3 — expert panel (4 educators + consensus) ─────────────────── */
export function ExpertPanel({
  educators,
  consensus,
}: {
  educators: EducatorVerdict[];
  consensus: Consensus;
}) {
  const consensusColor =
    consensus.color === "green" ? GREEN
    : consensus.color === "lightgreen" ? "#4ADE80"
    : consensus.color === "yellow" ? YELLOW
    : RED;
  return (
    <div className="mt-3 rounded-xl border p-3" style={{ backgroundColor: "#0F131A", borderColor: BORDER }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: TEXT }}>🎓 AI EXPERT PANEL</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ color: consensusColor, backgroundColor: `${consensusColor}1F` }}
        >
          {consensus.agreed}/{consensus.total} Consensus · {consensus.label}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {educators.map((educator) => (
          <div key={educator.role} className="flex items-start justify-between gap-2 text-xs">
            <span className="shrink-0 font-semibold" style={{ color: TEXT }}>
              {educator.emoji} {educator.role}
            </span>
            <span className="text-right" style={{ color: educator.confirms ? GREEN : MUTED }}>
              {educator.confirms ? "✅ " : "▫️ "}
              {educator.verdict}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: consensusColor }}>
        {consensus.deliver
          ? `🟢 ${consensus.agreed}/4 experts agree — setup delivery-grade hai.`
          : `🔴 ${consensus.agreed}/4 experts agree — 3/4 se kam, sirf watch karein.`}
      </p>
    </div>
  );
}

/* ── Feature 4 — expandable expert guidance (Roman Urdu + English) ──────── */
export function GuidanceSection({ quotes }: { quotes: GuidanceQuote[] }) {
  const [open, setOpen] = useState<string | null>(quotes[0]?.id ?? null);
  if (quotes.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl border p-3" style={{ backgroundColor: "#0F131A", borderColor: BORDER }}>
      <span className="mb-2 block text-xs font-bold" style={{ color: TEXT }}>
        💡 EXPERT GUIDANCE — tap to expand
      </span>
      <div className="flex flex-col gap-1.5">
        {quotes.map((quote) => {
          const isOpen = open === quote.id;
          return (
            <div key={quote.id} className="rounded-lg border" style={{ borderColor: isOpen ? YELLOW : BORDER }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : quote.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between px-2.5 py-2 text-left"
              >
                <span className="text-xs font-semibold" style={{ color: TEXT }}>
                  {quote.emoji} {quote.title}
                </span>
                <span className="text-xs" style={{ color: YELLOW }}>{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen ? (
                <div className="border-t px-2.5 py-2" style={{ borderColor: BORDER }}>
                  <p className="text-xs leading-relaxed" style={{ color: TEXT }}>
                    <span className="font-bold" style={{ color: YELLOW }}>UR: </span>
                    {quote.urdu}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MUTED }}>
                    <span className="font-bold">EN: </span>
                    {quote.english}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

