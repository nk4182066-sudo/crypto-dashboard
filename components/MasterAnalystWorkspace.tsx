"use client";

import { useEffect, useMemo, useState } from "react";
import type { Language, MarketAnalysis, TimeframeKey, TrendBias } from "@/src/analysis/types";
import type { ConfluenceResult } from "@/src/analysis/confluence";
import type { BacktestSummary } from "@/src/analysis/backtest";
import { fetchWithTimeout } from "@/src/lib/fetchClient";

export interface MasterFrameCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AnalystJournalTrade {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  entry: number;
  exit: number;
  quantity: number;
  pnl: number;
  notes?: string;
  closedAt: string;
}

interface AnalystResponse {
  analysis: MarketAnalysis;
  confluence: ConfluenceResult;
  glossary: { term: string; english: string; urdu: string; romanUrdu: string }[];
  backtest: BacktestSummary | null;
  forward: { inSample: BacktestSummary | null; outOfSample: BacktestSummary | null } | null;
  error?: string;
}

interface MasterAnalystProps {
  symbol: string;
  market: "crypto" | "forex" | "stocks";
  frames: Partial<Record<TimeframeKey, MasterFrameCandle[]>>;
  journal?: AnalystJournalTrade[];
}

const languages: Language[] = ["English", "Urdu", "Roman Urdu"];

function fmt(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const resolved = Math.abs(value) < 1 && value !== 0 ? 6 : digits;
  return value.toLocaleString("en-US", { maximumFractionDigits: resolved });
}

function biasColor(bias: TrendBias | string) {
  if (bias === "Bullish" || bias === "buy") return "text-emerald-300";
  if (bias === "Bearish" || bias === "sell") return "text-rose-300";
  return "text-amber-300";
}

function card(label: string, value: string, hint?: string) {
  return (
    <div className="min-w-0 border-l-2 border-emerald-400/70 pl-3 py-1">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-zinc-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function sectionTitle(kicker: string, title: string, accent = "text-emerald-300") {
  return (
    <div className="mb-4">
      <p className={`text-xs uppercase tracking-wide ${accent}`}>{kicker}</p>
      <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
    </div>
  );
}

function journalFeedback(trades: AnalystJournalTrade[], language: Language) {
  if (trades.length === 0) {
    return language === "English"
      ? "Record a few closed trades in the Trade Journal and I will review your habits, win rate and risk here."
      : language === "Urdu"
        ? "ٹریڈ جرنل میں کچھ بند ٹریڈز درج کریں، پھر میں آپ کی عادات، کامیابی کی شرح اور رسک کا جائزہ دوں گا۔"
        : "Trade Journal mein kuch band trades darj karein, phir main aap ki aadat, win rate aur risk ka jaiza dunga.";
  }
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const winRate = (wins / trades.length) * 100;
  const netPnl = trades.reduce((total, trade) => total + trade.pnl, 0);
  const avgWin = wins > 0 ? trades.filter((trade) => trade.pnl > 0).reduce((total, trade) => total + trade.pnl, 0) / wins : 0;
  const losses = trades.length - wins;
  const avgLoss = losses > 0 ? Math.abs(trades.filter((trade) => trade.pnl <= 0).reduce((total, trade) => total + trade.pnl, 0) / losses) : 0;
  const note = winRate >= 50 && netPnl > 0
    ? "You are net positive. Protect it: keep risk per trade fixed and journal every entry reason."
    : winRate < 40
      ? "Your win rate is low. Either take fewer, higher-quality setups (score 70+) or widen reward:risk."
      : "You have an edge but let losers run. Enforce the stop loss and move to break-even at TP1.";
  return `Across ${trades.length} closed trades: win rate ${winRate.toFixed(1)}%, net P/L $${fmt(netPnl)}, average win $${fmt(avgWin)}, average loss $${fmt(avgLoss)}. ${note}`;
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Chart Analysis" },
  { id: "priceaction", label: "Price Action & Flow" },
  { id: "indicators", label: "Indicators" },
  { id: "mtf", label: "Multi-Timeframe" },
  { id: "cycles", label: "Cycles · Time · Correlation" },
  { id: "sentiment", label: "Sentiment & On-Chain" },
  { id: "risk", label: "Risk Manager" },
  { id: "setup", label: "Trade Setup" },
  { id: "quant", label: "Quant · Psychology" },
  { id: "regime", label: "Regime" },
  { id: "backtest", label: "Backtest & Journal" },
  { id: "simple", label: "Simple Language" },
] as const;

type TabId = typeof tabs[number]["id"];

interface SentimentData {
  fearGreed?: { value: number; label: string; source: string };
  trends?: { keyword: string; interest: number; changePercent: number; source: string };
  social?: { mentions: number; bullish: number; bearish: number; score: number; source: string };
  news?: {
    items: { title: string; url: string; source: string; category: "Crypto" | "Forex"; publishedAt: string }[];
    unavailable?: string[];
    updatedAt?: string;
  };
  calendar?: {
    events: { title: string; country: string; date: string; impact: string; forecast: string; previous: string }[];
    source?: string;
    updatedAt?: string;
  };
  onchain?: {
    total?: number;
    previous?: number;
    top?: { symbol: string; supply: number }[];
    whale?: { transactions: { btc: number }[]; source: string; thresholdBtc: number };
    sections?: { title: string; status: string }[];
    source?: string;
  };
}

interface LearningRecord {
  symbol: string;
  direction: "buy" | "sell" | "wait";
  confidence: number;
  price: number;
  time: number;
  outcome: "win" | "loss" | null;
}

interface LearningStats {
  total: number;
  resolved: number;
  wins: number;
  hitRate: number | null;
  adjustedConfidence: number | null;
}

export default function MasterAnalystWorkspace({ symbol, market, frames, journal = [] }: MasterAnalystProps) {
  const [language, setLanguage] = useState<Language>("English");
  const [primaryTimeframe, setPrimaryTimeframe] = useState<TimeframeKey>("1h");
  const [balance, setBalance] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1");
  const [winRate, setWinRate] = useState("");
  const [runBacktest, setRunBacktest] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [data, setData] = useState<AnalystResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [memory, setMemory] = useState<string[]>([]);
  const [benchmarks, setBenchmarks] = useState<Record<string, MasterFrameCandle[]> | null>(null);
  const [learning, setLearning] = useState<LearningStats | null>(null);

  const framesKey = useMemo(() => Object.entries(frames).map(([key, value]) => `${key}:${value?.length ?? 0}`).join("|"), [frames]);
  const benchmarksKey = useMemo(() => (benchmarks ? Object.keys(benchmarks).sort().join("|") : ""), [benchmarks]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Part 5 — one benchmark per asset class, plus the dollar and long rates
      // so correlation and the macro block are always populated.
      const targets: { key: string; market: string; symbol: string }[] = [
        { key: "BTC", market: "crypto", symbol: "BTC-USD" },
        { key: "EURUSD", market: "forex", symbol: "EURUSD=X" },
        { key: "S&P 500", market: "stocks", symbol: "^GSPC" },
        { key: "Crude Oil", market: "stocks", symbol: "CL=F" },
        { key: "Gold", market: "stocks", symbol: "GC=F" },
        { key: "DXY", market: "stocks", symbol: "DX-Y.NYB" },
        { key: "US 10Y", market: "stocks", symbol: "^TNX" },
      ];
      const loaded = await Promise.all(targets.map(async (target) => {
        try {
          const response = await fetchWithTimeout(`/api/market/history?market=${target.market}&symbol=${encodeURIComponent(target.symbol)}&timeframe=1d`);
          if (!response.ok) return null;
          const payload = await response.json() as { candles?: MasterFrameCandle[] };
          if (!Array.isArray(payload.candles) || payload.candles.length < 20) return null;
          return [target.key, payload.candles.slice(-180)] as const;
        } catch {
          return null;
        }
      }));
      if (!active) return;
      const map: Record<string, MasterFrameCandle[]> = {};
      for (const entry of loaded) if (entry) map[entry[0]] = entry[1];
      setBenchmarks(Object.keys(map).length ? map : {});
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetchWithTimeout("/api/market/analyst", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            market,
            primaryTimeframe,
            frames,
            balance: Number(balance) || 10000,
            riskPercent: Number(riskPercent) || 1,
            winRate: winRate.trim() ? Math.min(0.95, Math.max(0.05, Number(winRate) / 100)) : null,
            runBacktest,
            benchmarks: benchmarks ?? undefined,
          }),
        });
        const result = await response.json() as AnalystResponse;
        if (!active) return;
        if (!response.ok) throw new Error(result.error || "Analysis unavailable.");
        setData(result);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Analysis failed.");
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [symbol, market, primaryTimeframe, framesKey, benchmarksKey, balance, riskPercent, winRate, runBacktest, benchmarks]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setSentimentLoading(true);
      const read = async (url: string) => {
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      };
      const base = symbol.split(/[-/]/)[0];
      const [fng, trends, social, onchain, news, calendar] = await Promise.allSettled([
        read("/api/market/phase3?type=sentiment"),
        read(`/api/market/phase3?type=trends&q=${encodeURIComponent(base)}`),
        read(`/api/market/phase3?type=social&q=${encodeURIComponent(base)}`),
        read("/api/market/onchain"),
        read("/api/market/phase3?type=news"),
        read("/api/market/phase3?type=calendar"),
      ]);
      if (!active) return;
      const next: SentimentData = {};
      if (fng.status === "fulfilled") next.fearGreed = fng.value;
      if (trends.status === "fulfilled") next.trends = trends.value;
      if (social.status === "fulfilled") next.social = social.value;
      if (onchain.status === "fulfilled") next.onchain = onchain.value;
      if (news.status === "fulfilled") next.news = news.value;
      if (calendar.status === "fulfilled") next.calendar = calendar.value;
      setSentiment(next);
      setSentimentLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => {
    if (!data) return;
    const recognised = [
      ...data.analysis.chartPatterns.harmonics.map((item) => item.name),
      ...data.analysis.chartPatterns.classical.map((item) => item.name),
      ...data.analysis.smartMoney.orderBlocks.map((block) => `${block.direction} order block`),
    ];
    if (recognised.length === 0) return;
    const timer = window.setTimeout(() => {
      try {
        const key = "master-analyst-pattern-memory-v1";
        const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
        const merged = Array.from(new Set([...recognised, ...stored])).slice(0, 40);
        localStorage.setItem(key, JSON.stringify(merged));
        setMemory(merged);
      } catch {
        // storage unavailable — memory stays in-session only
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data]);

  // Self-improvement: resolve earlier predictions against the latest price and
  // blend the measured hit rate back into the displayed confidence.
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => {
      try {
        const key = "master-analyst-learning-v1";
        const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as LearningRecord[];
        const now = Date.now();
        const resolved = stored.map((record): LearningRecord => {
          if (record.outcome !== null) return record;
          if (record.symbol !== data.analysis.symbol) return record;
          if ((now - record.time) < 4 * 60 * 60 * 1000) return record;
          const move = (data.analysis.price - record.price) / record.price;
          if (record.direction === "buy") return { ...record, outcome: move > 0.002 ? "win" : move < -0.002 ? "loss" : record.outcome };
          if (record.direction === "sell") return { ...record, outcome: move < -0.002 ? "win" : move > 0.002 ? "loss" : record.outcome };
          return record;
        });
        const entry: LearningRecord = {
          symbol: data.analysis.symbol,
          direction: data.analysis.setup.direction,
          confidence: data.analysis.confidence,
          price: data.analysis.price,
          time: now,
          outcome: null,
        };
        const next = [entry, ...resolved].slice(0, 60);
        localStorage.setItem(key, JSON.stringify(next));
        const finals = next.filter((record) => record.outcome !== null);
        const wins = finals.filter((record) => record.outcome === "win").length;
        const hitRate = finals.length >= 3 ? wins / finals.length : null;
        setLearning({
          total: next.length,
          resolved: finals.length,
          wins,
          hitRate,
          adjustedConfidence: hitRate === null ? null : Math.round(data.analysis.confidence * 0.5 + hitRate * 100 * 0.5),
        });
      } catch {
        setLearning(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data]);

  const analysis = data?.analysis ?? null;
  const confluence = data?.confluence ?? null;

  return (
    <section className="min-w-0 text-zinc-100">
      <header className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">Master Analyst</p>
            <h2 className="mt-1 text-xl font-semibold text-white">AI trading analysis master · {symbol || "Asset"}</h2>
            <p className="mt-1 text-sm text-zinc-400">Harmonics, Elliott, Smart Money, multi-timeframe confluence, risk and simple-language guidance in one place.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-zinc-400">Language
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white">
                {languages.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-xs text-zinc-400">Primary timeframe
              <select value={primaryTimeframe} onChange={(event) => setPrimaryTimeframe(event.target.value as TimeframeKey)} className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white">
                {(["15m", "1h", "4h", "1d", "1w"] as TimeframeKey[]).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </div>
        <nav aria-label="Master analyst sections" className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined}
              className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${tab === item.id ? "border-fuchsia-400 text-fuchsia-200" : "border-transparent text-zinc-400 hover:text-white"}`}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <p role="alert" className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {loading && !analysis && <p role="status" className="mt-4 text-sm text-zinc-400">Running the full analysis engine...</p>}

      {analysis && data && (
        <div className="mt-5 space-y-6">
          {tab === "overview" && (
            <OverviewTab analysis={analysis} confluence={confluence} language={language} />
          )}
          {tab === "chart" && <ChartTab analysis={analysis} />}
          {tab === "priceaction" && <PriceActionTab analysis={analysis} />}
          {tab === "indicators" && <IndicatorsTab analysis={analysis} />}
          {tab === "mtf" && <MultiTimeframeTab confluence={confluence} />}
          {tab === "cycles" && <CyclesTab analysis={analysis} />}
          {tab === "sentiment" && <SentimentTab sentiment={sentiment} loading={sentimentLoading} />}
          {tab === "risk" && (
            <RiskTab analysis={analysis} balance={balance} setBalance={setBalance} riskPercent={riskPercent} setRiskPercent={setRiskPercent} winRate={winRate} setWinRate={setWinRate} />
          )}
          {tab === "setup" && <SetupTab analysis={analysis} />}
          {tab === "quant" && <QuantTab analysis={analysis} />}
          {tab === "regime" && <RegimeTab analysis={analysis} />}
          {tab === "backtest" && <BacktestTab data={data} journal={journal} language={language} runBacktest={runBacktest} setRunBacktest={setRunBacktest} memory={memory} learning={learning} />}
          {tab === "simple" && <SimpleLanguageTab analysis={analysis} language={language} glossary={data.glossary} />}
        </div>
      )}
    </section>
  );
}

function OverviewTab({ analysis, confluence, language }: { analysis: MarketAnalysis; confluence: ConfluenceResult | null; language: Language }) {
  const steps = analysis.whatToDo[language] ?? analysis.whatToDo.English;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
        {card("Overall bias", analysis.bias, `Confidence ${analysis.confidence}/100`)}
        {card("Setup", analysis.setup.direction === "wait" ? "Wait" : analysis.setup.direction === "buy" ? "Buy (long)" : "Sell (short)", `Quality ${analysis.setup.qualityScore}/100`)}
        {card("Price", fmt(analysis.price), `${analysis.symbol} · ${analysis.timeframe}`)}
        {card("Regime", `${analysis.regime.type} · ${analysis.regime.volatility} vol`, analysis.regime.cycle)}
      </div>

      <p className="text-sm leading-relaxed text-zinc-300">{analysis.summary}</p>
      {confluence && <p className="text-sm leading-relaxed text-fuchsia-200">{confluence.note}</p>}

      <section>
        {sectionTitle("Simple language", "What to do now?", "text-fuchsia-300")}
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.step} className="flex gap-3 border border-zinc-800 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-400 text-xs font-bold text-zinc-950">{step.step}</span>
              <div>
                <p className="font-semibold text-white">{step.action}</p>
                <p className="mt-1 text-sm text-zinc-400">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Risk at a glance</p>
          <p className="mt-1 text-xs text-zinc-400">{analysis.setup.rewardRisk ? `Reward:Risk ≈ ${analysis.setup.rewardRisk.toFixed(2)} on TP1.` : "No valid reward:risk until a setup forms."}</p>
          {analysis.risk.warnings.map((warning) => <p key={warning} className="mt-1 text-xs text-amber-300">⚠ {warning}</p>)}
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Structure snapshot</p>
          <p className="mt-1 text-xs text-zinc-400">{analysis.structure.events.at(-1)?.note ?? "No recent break of structure detected."}</p>
        </div>
      </div>
    </div>
  );
}

function ChartTab({ analysis }: { analysis: MarketAnalysis }) {
  const { structure, chartPatterns, smartMoney, volume } = analysis;
  return (
    <div className="space-y-6">
      <section>
        {sectionTitle("Market structure", "Break of Structure & Change of Character")}
        <p className="mb-3 text-sm text-zinc-400">Current structural trend: <span className={`font-semibold ${biasColor(structure.trend)}`}>{structure.trend}</span></p>
        <div className="divide-y divide-zinc-800 border-y border-zinc-800">
          {structure.events.length === 0 && <p className="py-3 text-sm text-zinc-500">No BOS or CHoCH in the sampled window.</p>}
          {[...structure.events].reverse().map((event, index) => (
            <div key={`${event.time}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className={`font-semibold ${biasColor(event.direction === "bullish" ? "Bullish" : "Bearish")}`}>{event.type} · {event.direction}</span>
              <span className="text-zinc-400">broke level {fmt(event.level)} at {fmt(event.price)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        {sectionTitle("Harmonic patterns", "Gartley · Bat · Butterfly · Crab")}
        {chartPatterns.harmonics.length === 0
          ? <p className="text-sm text-zinc-500">No completed XABCD harmonic pattern in the recent swings.</p>
          : <div className="grid gap-3 sm:grid-cols-2">
            {chartPatterns.harmonics.map((item) => (
              <div key={item.name} className="border border-zinc-800 p-3">
                <p className={`font-semibold ${biasColor(item.direction === "bullish" ? "Bullish" : "Bearish")}`}>{item.name}</p>
                <p className="mt-1 text-xs text-zinc-400">Completion {fmt(item.completionPrice)} · match {item.score}%</p>
                <p className="mt-1 text-[11px] text-zinc-500">XAB {item.ratios.xab} · ABC {item.ratios.abc} · BCD {item.ratios.bcd} · XAD {item.ratios.xad}</p>
              </div>
            ))}
          </div>}
      </section>

      <section>
        {sectionTitle("Classical price patterns", "Broadening · Diamond · Cup & Handle · Three Drives · Triangles · H&S", "text-sky-300")}
        {chartPatterns.classical.length === 0
          ? <p className="text-sm text-zinc-500">No confirmed classical pattern in the sampled swings.</p>
          : <div className="grid gap-3 sm:grid-cols-2">
            {chartPatterns.classical.map((pattern) => (
              <div key={`${pattern.name}-${pattern.points[0]?.time ?? 0}`} className="border border-zinc-800 p-3">
                <div className="flex items-center justify-between">
                  <p className={`font-semibold ${biasColor(pattern.direction)}`}>{pattern.name}</p>
                  <span className="text-xs text-zinc-500">{pattern.confidence}% confidence</span>
                </div>
                {pattern.neckline !== null && <p className="mt-1 text-xs text-zinc-400">Neckline / trigger: {fmt(pattern.neckline)}</p>}
                <p className="mt-1 text-xs text-zinc-500">{pattern.note}</p>
              </div>
            ))}
          </div>}
      </section>

      <section>
        {sectionTitle("Elliott Wave", "Wave count")}
        {chartPatterns.elliott
          ? <div className="border border-zinc-800 p-3">
            <p className="font-semibold text-white">{chartPatterns.elliott.label}</p>
            <p className="mt-1 text-xs text-zinc-400">{chartPatterns.elliott.note}</p>
            <p className="mt-2 text-[11px] text-zinc-500">Waves: {chartPatterns.elliott.count.map((point) => `${point.label}@${fmt(point.price)}`).join(" · ")}</p>
          </div>
          : <p className="text-sm text-zinc-500">Not enough clean swings to label an Elliott count.</p>}
      </section>

      <section>
        {sectionTitle("Fibonacci mastery", "Retracement · extension · fan · golden pocket", "text-amber-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("Trend", analysis.fibonacci.trend, `Swing ${fmt(analysis.fibonacci.swingLow)} → ${fmt(analysis.fibonacci.swingHigh)}`)}
          {card("Golden pocket", `${fmt(analysis.fibonacci.goldenPocket.low)} – ${fmt(analysis.fibonacci.goldenPocket.high)}`, "0.618–0.705 zone")}
          {card("Retracements", String(analysis.fibonacci.retracement.length), "0 → 100%")}
          {card("Extensions", String(analysis.fibonacci.extension.length), "1.272 → 2.618")}
        </div>
        <div className="grid gap-x-8 md:grid-cols-3">
          <div>
            {analysis.fibonacci.retracement.map((level) => (
              <div key={level.label} className="flex justify-between border-b border-zinc-800 py-1.5 text-sm"><span className="text-zinc-400">{level.label}</span><span className="font-semibold text-white">{fmt(level.price)}</span></div>
            ))}
          </div>
          <div>
            {analysis.fibonacci.extension.map((level) => (
              <div key={level.label} className="flex justify-between border-b border-zinc-800 py-1.5 text-sm"><span className="text-zinc-400">{level.label}</span><span className="font-semibold text-white">{fmt(level.price)}</span></div>
            ))}
          </div>
          <div>
            {analysis.fibonacci.fan.map((level) => (
              <div key={level.label} className="flex justify-between border-b border-zinc-800 py-1.5 text-sm"><span className="text-zinc-400">{level.label}</span><span className="font-semibold text-white">{fmt(level.price)}</span></div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">{analysis.fibonacci.note}</p>
      </section>

      <section>
        {sectionTitle("Smart Money Concepts", "Order Blocks · Fair Value Gaps · Liquidity")}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Order Blocks</p>
            <div className="space-y-2">
              {smartMoney.orderBlocks.length === 0 && <p className="text-xs text-zinc-500">None active.</p>}
              {smartMoney.orderBlocks.map((block, index) => (
                <div key={`${block.time}-${index}`} className="border border-zinc-800 p-2 text-xs">
                  <p className={`font-semibold ${biasColor(block.direction === "bullish" ? "Bullish" : "Bearish")}`}>{block.direction}</p>
                  <p className="text-zinc-400">{fmt(block.low)} – {fmt(block.high)}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Fair Value Gaps</p>
            <div className="space-y-2">
              {smartMoney.fairValueGaps.length === 0 && <p className="text-xs text-zinc-500">None open.</p>}
              {smartMoney.fairValueGaps.map((gap, index) => (
                <div key={`${gap.time}-${index}`} className="border border-zinc-800 p-2 text-xs">
                  <p className={`font-semibold ${biasColor(gap.direction === "bullish" ? "Bullish" : "Bearish")}`}>{gap.direction}{gap.filled ? " · filled" : ""}</p>
                  <p className="text-zinc-400">{fmt(gap.low)} – {fmt(gap.high)}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Liquidity zones</p>
            <div className="space-y-2">
              {smartMoney.liquidityZones.length === 0 && <p className="text-xs text-zinc-500">No equal highs/lows cluster.</p>}
              {smartMoney.liquidityZones.map((zone, index) => (
                <div key={`${zone.time}-${index}`} className="border border-zinc-800 p-2 text-xs">
                  <p className="font-semibold text-amber-300">{zone.kind === "equalHighs" ? "Equal highs" : "Equal lows"}{zone.swept ? " · swept" : ""}</p>
                  <p className="text-zinc-400">{fmt(zone.price)} · {zone.touches} touches</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        {sectionTitle("Volume analysis", "Volume Profile & VWAP")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("POC", fmt(volume.poc), "Highest-volume price")}
          {card("Value area", `${fmt(volume.valueAreaLow)} – ${fmt(volume.valueAreaHigh)}`, "70% of volume")}
          {card("VWAP", fmt(volume.vwap), volume.vwapBias)}
          {card("Price vs POC", fmt(analysis.price - volume.poc), analysis.price >= volume.poc ? "Above value" : "Below value")}
        </div>
      </section>
    </div>
  );
}

function PriceActionTab({ analysis }: { analysis: MarketAnalysis }) {
  const { priceAction, orderFlow, wyckoff, smartMoney } = analysis;
  return (
    <div className="space-y-6">
      <section>
        {sectionTitle("Price action mastery", "Candlestick psychology & wick analysis", "text-amber-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("Bull/bear pressure", `${priceAction.pressure > 0 ? "+" : ""}${priceAction.pressure}`, priceAction.pressure >= 0 ? "Buyers in control" : "Sellers in control")}
          {card("Last body", `${(priceAction.wick.bodyRatio * 100).toFixed(0)}% of range`, `${(priceAction.wick.upperRatio * 100).toFixed(0)}% upper wick · ${(priceAction.wick.lowerRatio * 100).toFixed(0)}% lower wick`)}
          {card("Setups found", String(priceAction.signals.length), "Last 12 candles")}
          {card("Phase", wyckoff.phase, "Wyckoff read")}
        </div>
        <p className="mb-3 text-sm leading-relaxed text-zinc-300">{priceAction.psychology}</p>
        <p className="mb-3 text-sm text-zinc-400">{priceAction.wick.reading}</p>
        <div className="divide-y divide-zinc-800 border-y border-zinc-800">
          {priceAction.signals.length === 0 && <p className="py-3 text-sm text-zinc-500">No named candlestick patterns in the recent candles.</p>}
          {priceAction.signals.map((signal, index) => (
            <div key={`${signal.time}-${index}`} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <span className={`font-semibold ${biasColor(signal.direction)}`}>{signal.name} · {signal.strength}/100</span>
              <span className="max-w-xl text-right text-xs text-zinc-400">{signal.explanation}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        {sectionTitle("Order flow", "Delta · cumulative delta · footprint", "text-sky-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("Candle delta", fmt(orderFlow.candleDelta, 0), "Estimated buy − sell volume")}
          {card("Cumulative delta", fmt(orderFlow.cumulativeDelta, 0), `Last 120 candles`)}
          {card("Flow", orderFlow.deltaTrend, orderFlow.deltaTrend === "buyers" ? "Aggressive buyers" : orderFlow.deltaTrend === "sellers" ? "Aggressive sellers" : "Two-sided")}
          {card("Absorption", orderFlow.absorption ? "Detected" : "None", orderFlow.absorption ?? "No passive absorption today")}
        </div>
        <p className="mb-3 text-xs text-zinc-500">{orderFlow.note}</p>
        {orderFlow.imbalance && <p className="mb-3 text-sm text-amber-300">⚠ {orderFlow.imbalance}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500"><th className="py-2">Price</th><th className="py-2">Buy</th><th className="py-2">Sell</th><th className="py-2">Delta</th></tr></thead>
            <tbody>
              {orderFlow.footprint.map((row) => (
                <tr key={row.price} className="border-b border-zinc-900">
                  <td className="py-1.5 font-medium text-white">{fmt(row.price)}</td>
                  <td className="py-1.5 text-emerald-300">{fmt(row.buy, 0)}</td>
                  <td className="py-1.5 text-rose-300">{fmt(row.sell, 0)}</td>
                  <td className={`py-1.5 font-semibold ${row.delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{row.delta >= 0 ? "+" : ""}{fmt(row.delta, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        {sectionTitle("Institutional concepts", "Wyckoff · Power of 3 · stop hunts", "text-fuchsia-300")}
        <div className="mb-3 grid grid-cols-3 gap-3 border-y border-zinc-800 py-3">
          {card("Accumulation", `${wyckoff.powerOf3.accumulation}%`, "Power of 3 · phase one")}
          {card("Manipulation", `${wyckoff.powerOf3.manipulation}%`, "Power of 3 · phase two")}
          {card("Distribution", `${wyckoff.powerOf3.distribution}%`, "Power of 3 · phase three")}
        </div>
        <p className="mb-3 text-sm leading-relaxed text-zinc-300">{wyckoff.note}</p>
        {smartMoney.stopHunts.length === 0
          ? <p className="text-sm text-zinc-500">No confirmed stop hunt (liquidity sweep + reclaim) in the sampled window.</p>
          : <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            {smartMoney.stopHunts.map((hunt, index) => (
              <div key={`${hunt.time}-${index}`} className="py-2 text-sm">
                <p className={`font-semibold ${biasColor(hunt.direction)}`}>{hunt.direction === "bullish" ? "Bullish" : "Bearish"} stop hunt at {fmt(hunt.level)} (raided to {fmt(hunt.sweptTo)})</p>
                <p className="mt-1 text-xs text-zinc-400">{hunt.note}</p>
              </div>
            ))}
          </div>}
      </section>
    </div>
  );
}

function CyclesTab({ analysis }: { analysis: MarketAnalysis }) {
  const { cycle, time, correlation, assetClass } = analysis;
  return (
    <div className="space-y-6">
      <section>
        {sectionTitle("Cycle analysis", "Bitcoin halving · 4-year cycle · seasonality", "text-amber-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("Last halving", cycle.bitcoin?.lastHalving ?? "—", "Bitcoin mainnet")}
          {card("Next halving", cycle.bitcoin ? `${cycle.bitcoin.nextHalving} (${cycle.bitcoin.daysToNext} days)` : "—", "Estimated")}
          {card("Cycle position", `${cycle.fourYear.percent}%`, `Day ${cycle.fourYear.day} of 1460`)}
          {card("Phase", cycle.fourYear.phase.split("—")[0].trim(), "Heuristic")}
        </div>
        <p className="mb-3 text-sm leading-relaxed text-zinc-300">{cycle.fourYear.phase}.</p>
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-3">
          {card(`${cycle.seasonality.monthName} history`, cycle.seasonality.historicalReturn === null ? "—" : `${cycle.seasonality.historicalReturn >= 0 ? "+" : ""}${cycle.seasonality.historicalReturn}%`, "Average return this month in loaded data")}
          {card("Best month", cycle.seasonality.bestMonth, "Seasonal tendency")}
          {card("Weekday bias", cycle.seasonality.weekdayBias, "Strongest vs weakest day")}
        </div>
        <p className="text-xs text-zinc-500">{cycle.note}</p>
      </section>

      <section>
        {sectionTitle("Time-based analysis", "Sessions · kill zones · opening range", "text-sky-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("UTC hour", `${time.utcHour}:00`, time.session)}
          {card("Kill zone", time.killZone ? "ACTIVE" : "Off", time.killZoneName)}
          {card("Opening range", time.openingRange ? `${fmt(time.openingRange.low)} – ${fmt(time.openingRange.high)}` : "—", time.openingRange ? `Price is ${time.openingRange.status}` : "No candles for today yet")}
          {card("Best / worst hour", time.bestHour !== null ? `${time.bestHour}:00 / ${time.worstHour}:00` : "—", "By average return in loaded data")}
        </div>
        <p className="text-sm leading-relaxed text-zinc-300">{time.note}</p>
      </section>

      <section>
        {sectionTitle("Cross-market correlation & macro", "Crypto · Forex · Stocks · Commodities · Metals", "text-emerald-300")}
        {!correlation || correlation.pairs.length === 0
          ? <p className="text-sm text-zinc-500">Benchmark data is unavailable right now — correlations appear once the benchmark fetch succeeds.</p>
          : <>
            <p className="mb-2 text-xs text-zinc-500">Tracking {correlation.coverage.length} asset class(es): {correlation.coverage.join(", ")}</p>
            <div className="divide-y divide-zinc-800 border-y border-zinc-800">
              {correlation.pairs.map((pair) => (
                <div key={pair.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-semibold text-white">vs {pair.key}</span>
                  <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] uppercase text-zinc-400">{pair.assetClass}</span>
                  <span className={`font-semibold ${pair.correlation >= 0.4 ? "text-emerald-300" : pair.correlation <= -0.4 ? "text-rose-300" : "text-amber-300"}`}>r = {pair.correlation}</span>
                  <span className="text-zinc-400">beta {pair.beta}</span>
                  <span className="max-w-md text-right text-xs text-zinc-500">{pair.note}</span>
                </div>
              ))}
            </div>
          </>}
        <p className="mt-2 text-xs text-zinc-500">{correlation?.note}</p>

        {correlation && correlation.macro.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Global macro indicators</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {correlation.macro.map((indicator) => (
                <div key={indicator.key} className="border border-zinc-800 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{indicator.label}</span>
                    <span className={indicator.stance === "tailwind" ? "text-emerald-300" : indicator.stance === "headwind" ? "text-rose-300" : "text-zinc-400"}>
                      {indicator.stance}
                      {indicator.changePercent !== null && ` · ${indicator.changePercent >= 0 ? "+" : ""}${indicator.changePercent}%`}
                    </span>
                  </div>
                  <p className="mt-1 text-zinc-500">{indicator.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        {sectionTitle("Multi-asset class", assetClass.assetClass, "text-fuchsia-300")}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Trading hours</p><p className="mt-1 text-xs text-zinc-400">{assetClass.hours}</p></div>
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Volatility profile</p><p className="mt-1 text-xs text-zinc-400">{assetClass.volatilityProfile}</p></div>
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Primary drivers</p><p className="mt-1 text-xs text-zinc-400">{assetClass.primaryDriver}</p></div>
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Class notes</p><p className="mt-1 text-xs text-zinc-400">{assetClass.note}</p></div>
        </div>
      </section>
    </div>
  );
}

function QuantTab({ analysis }: { analysis: MarketAnalysis }) {
  const { quant, volatility, psychology } = analysis;
  const flag = (label: string, data: typeof psychology.fomo) => (
    <div className="border border-zinc-800 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{label}</p>
        <span className={`text-xs font-semibold ${data.active ? "text-rose-300" : "text-emerald-300"}`}>{data.active ? "ACTIVE" : "Calm"} · {data.score}/100</span>
      </div>
      <p className="mt-1 text-xs text-zinc-400">{data.evidence}</p>
    </div>
  );
  return (
    <div className="space-y-6">
      <section>
        {sectionTitle("Quantitative analysis", "Sharpe · Sortino · expectancy · Monte Carlo", "text-emerald-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("Sharpe", quant.sharpe === null ? "—" : quant.sharpe.toFixed(2), "Annualized, risk-free = 0")}
          {card("Sortino", quant.sortino === null ? "—" : quant.sortino.toFixed(2), "Downside deviation only")}
          {card("Expectancy", quant.expectancyPercent === null ? "—" : `${quant.expectancyPercent}%`, "Per candle, loaded window")}
          {card("Max drawdown", `${quant.maxDrawdownPercent}%`, `Profit factor ${quant.profitFactor ?? "—"}`)}
        </div>
        {quant.monteCarlo && (
          <div className="grid grid-cols-3 gap-3 border-b border-zinc-800 pb-4">
            {card("Monte Carlo P5", `${quant.monteCarlo.p5}%`, "5% of simulated paths did worse")}
            {card("Monte Carlo P50", `${quant.monteCarlo.p50}%`, "Median simulated outcome")}
            {card("Monte Carlo P95", `${quant.monteCarlo.p95}%`, "95th percentile best case")}
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">{quant.note}</p>
      </section>

      <section>
        {sectionTitle("Volatility analysis", "Realized vol · Bollinger squeeze · VIX-style proxy", "text-amber-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          {card("Realized vol", `${volatility.realizedPercent}%`, "Per candle")}
          {card("Annualized", `${volatility.annualizedPercent}%`, `Percentile ${volatility.percentile}`)}
          {card("Vol regime", volatility.regime, `VIX-style proxy ${volatility.vixProxy}`)}
          {card("BB squeeze", volatility.bollingerSqueeze ? "YES" : "No", volatility.bollingerSqueeze ? "Expansion due" : "Bands normal")}
        </div>
        <p className="mb-2 text-sm leading-relaxed text-zinc-300">{volatility.squeezeNote}</p>
        <p className="text-xs text-zinc-500">{volatility.note}</p>
      </section>

      <section>
        {sectionTitle("Psychology & discipline", "FOMO · capitulation · euphoria", "text-rose-300")}
        <div className="grid gap-3 sm:grid-cols-3">
          {flag("FOMO", psychology.fomo)}
          {flag("Capitulation", psychology.capitulation)}
          {flag("Euphoria", psychology.euphoria)}
        </div>
        <ul className="mt-3 space-y-1.5 border-y border-zinc-800 py-3 text-sm text-zinc-300">
          {psychology.discipline.map((rule) => <li key={rule}>• {rule}</li>)}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">{psychology.note}</p>
      </section>
    </div>
  );
}

function indicatorRow(label: string, value: string, note?: string) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 py-2 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-white">{value}{note && <span className="ml-2 text-xs font-normal text-zinc-500">{note}</span>}</span>
    </div>
  );
}

function IndicatorsTab({ analysis }: { analysis: MarketAnalysis }) {
  const i = analysis.indicators;
  return (
    <div className="space-y-4">
      {sectionTitle("Advanced indicators", "Full indicator stack")}
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          {indicatorRow("RSI (14)", i.rsi14 === null ? "—" : i.rsi14.toFixed(1), i.rsi14 !== null ? (i.rsi14 > 70 ? "overbought" : i.rsi14 < 30 ? "oversold" : "neutral") : "")}
          {indicatorRow("MACD", i.macd ? `${i.macd.line.toFixed(3)} / ${i.macd.signal.toFixed(3)}` : "—", i.macd ? `${i.macd.histogram >= 0 ? "+" : ""}${i.macd.histogram.toFixed(3)} hist` : "")}
          {indicatorRow("Stochastic RSI", i.stochasticRsi ? `K ${i.stochasticRsi.k.toFixed(1)} · D ${i.stochasticRsi.d.toFixed(1)}` : "—")}
          {indicatorRow("ATR (14)", i.atr14 === null ? "—" : fmt(i.atr14), i.atrPercent !== null ? `${i.atrPercent.toFixed(2)}% of price` : "")}
          {indicatorRow("ADX (14)", i.adx ? i.adx.adx.toFixed(1) : "—", i.adx ? `+DI ${i.adx.plusDI.toFixed(1)} / -DI ${i.adx.minusDI.toFixed(1)}` : "")}
          {indicatorRow("OBV", i.obv === null ? "—" : fmt(i.obv, 0), i.obvTrend)}
          {indicatorRow("CMF (20)", i.cmf === null ? "—" : i.cmf.toFixed(3), i.cmf !== null ? (i.cmf > 0 ? "buying pressure" : "selling pressure") : "")}
        </div>
        <div>
          {indicatorRow("Ichimoku Tenkan", i.ichimoku?.tenkan === null || !i.ichimoku ? "—" : fmt(i.ichimoku.tenkan))}
          {indicatorRow("Ichimoku Kijun", i.ichimoku?.kijun === null || !i.ichimoku ? "—" : fmt(i.ichimoku.kijun))}
          {indicatorRow("Senkou A / B", i.ichimoku ? `${fmt(i.ichimoku.senkouA)} / ${fmt(i.ichimoku.senkouB)}` : "—", i.ichimoku?.cloudBias ?? "")}
          {indicatorRow("Supertrend", i.supertrend ? fmt(i.supertrend.value) : "—", i.supertrend?.direction === "up" ? "uptrend" : "downtrend")}
          {indicatorRow("Parabolic SAR", i.parabolicSar ? fmt(i.parabolicSar.value) : "—", i.parabolicSar?.direction === "up" ? "bullish" : "bearish")}
          {indicatorRow("Bollinger width", i.bollinger ? `${i.bollinger.widthPercent.toFixed(2)}%` : "—", i.bollinger ? `${fmt(i.bollinger.lower)} – ${fmt(i.bollinger.upper)}` : "")}
          {indicatorRow("SMA 20 / 50 / 200", `${fmt(i.movingAverages.sma20)} / ${fmt(i.movingAverages.sma50)} / ${fmt(i.movingAverages.sma200)}`)}
        </div>
      </div>

      {i.pivotPoints && (
        <section className="pt-2">
          {sectionTitle("Pivot points", "Classic floor pivots")}
          <div className="grid grid-cols-3 gap-3 border-y border-zinc-800 py-3 sm:grid-cols-7">
            {(["s3", "s2", "s1", "pivot", "r1", "r2", "r3"] as const).map((key) => (
              <div key={key} className="text-center">
                <p className="text-[11px] uppercase text-zinc-500">{key === "pivot" ? "Pivot" : key.toUpperCase()}</p>
                <p className={`mt-1 text-sm font-semibold ${key.startsWith("r") ? "text-rose-300" : key.startsWith("s") ? "text-emerald-300" : "text-white"}`}>{fmt(i.pivotPoints![key])}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MultiTimeframeTab({ confluence }: { confluence: ConfluenceResult | null }) {
  if (!confluence) return <p className="text-sm text-zinc-500">Load at least two timeframes to build confluence.</p>;
  return (
    <div className="space-y-4">
      {sectionTitle("Multi-timeframe confluence", "Higher-timeframe bias · Lower-timeframe entry", "text-sky-300")}
      <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-3">
        {card("Higher-timeframe bias", confluence.higherTimeframeBias, "4h · 1d · 1w weight")}
        {card("Confluence score", `${confluence.score}/100`, confluence.aligned ? "Aligned" : "Mixed")}
        {card("Timeframes", String(confluence.frames.length), "Sampled")}
      </div>
      <p className="text-sm leading-relaxed text-zinc-300">{confluence.lowerTimeframeEntry}</p>

      <div className="divide-y divide-zinc-800 border-y border-zinc-800">
        {confluence.frames.map((frame) => (
          <div key={frame.timeframe} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="w-12 font-semibold text-white">{frame.timeframe}</span>
            <span className={`w-24 font-semibold ${biasColor(frame.bias)}`}>{frame.bias}</span>
            <span className="text-zinc-400">{frame.setupDirection === "wait" ? "no entry" : frame.setupDirection}</span>
            <span className="text-zinc-400">quality {frame.qualityScore}/100</span>
            <span className="text-zinc-500">{frame.regime}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SentimentTab({ sentiment, loading }: { sentiment: SentimentData | null; loading: boolean }) {
  if (loading && !sentiment) return <p className="text-sm text-zinc-400">Loading sentiment, trends and on-chain data...</p>;
  if (!sentiment) return <p className="text-sm text-zinc-500">Sentiment feeds are unavailable right now.</p>;
  return (
    <div className="space-y-5">
      {sectionTitle("Sentiment & news", "Crowd mood and search interest", "text-amber-300")}
      <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-3">
        {card("Fear & Greed", sentiment.fearGreed ? `${sentiment.fearGreed.value} (${sentiment.fearGreed.label})` : "—", sentiment.fearGreed?.source)}
        {card("Search interest", sentiment.trends ? `${sentiment.trends.interest}/100` : "—", sentiment.trends ? `${sentiment.trends.changePercent >= 0 ? "+" : ""}${sentiment.trends.changePercent.toFixed(1)}% vs prior` : "Wikipedia pageviews proxy")}
        {card("Social sentiment", sentiment.social ? `${sentiment.social.score}/100` : "—", sentiment.social ? `${sentiment.social.bullish} bullish · ${sentiment.social.bearish} bearish of ${sentiment.social.mentions}` : "Reddit proxy for Crypto Twitter")}
      </div>
      {sentiment.trends && <p className="text-xs text-zinc-500">Source: {sentiment.trends.source}. Google Trends has no free official API, so public search interest is proxied with Wikipedia pageviews for the same keyword.</p>}

      <section>
        {sectionTitle("On-chain data", "Crypto flows and whale activity", "text-sky-300")}
        <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-3">
          {card("Stablecoin supply", sentiment.onchain?.total ? `$${(sentiment.onchain.total / 1e9).toFixed(1)}B` : "—", sentiment.onchain?.previous ? `${sentiment.onchain.total! >= sentiment.onchain.previous ? "+" : ""}${((sentiment.onchain.total! - sentiment.onchain.previous) / 1e9).toFixed(2)}B 24h` : sentiment.onchain?.source)}
          {card("Whale transfers", sentiment.onchain?.whale ? String(sentiment.onchain.whale.transactions.length) : "—", sentiment.onchain?.whale ? `≥ ${sentiment.onchain.whale.thresholdBtc} BTC · ${sentiment.onchain.whale.source}` : "")}
          {card("MVRV", "Requires provider", "Glassnode / CryptoQuant key")}
        </div>
        {sentiment.onchain?.top && sentiment.onchain.top.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            {sentiment.onchain.top.slice(0, 6).map((item) => <span key={item.symbol} className="border border-zinc-800 px-2 py-1">{item.symbol} ${(item.supply / 1e9).toFixed(1)}B</span>)}
          </div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Exchange inflows / outflows</p><p className="mt-1 text-xs text-zinc-500">Requires an authenticated on-chain provider (CryptoQuant / Glassnode). Not shown to avoid inventing numbers.</p></div>
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Miner reserves</p><p className="mt-1 text-xs text-zinc-500">Requires an authenticated on-chain provider. Not fabricated.</p></div>
        </div>
      </section>

      <section>
        {sectionTitle("News & event analysis", "FOMC · CPI · NFP · earnings · geopolitical", "text-rose-300")}
        {sentiment.calendar && sentiment.calendar.events.length > 0 ? (
          <div className="mb-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Upcoming economic events</p>
            <div className="divide-y divide-zinc-800 border-y border-zinc-800">
              {sentiment.calendar.events.slice(0, 10).map((event) => {
                const title = event.title.toLowerCase();
                const kind = /fomc|fed|rate/.test(title) ? "Central bank"
                  : /cpi|inflation|ppi/.test(title) ? "Inflation"
                    : /nonfarm|payroll|nfp|employment/.test(title) ? "Labour (NFP)"
                      : /earnings|revenue/.test(title) ? "Earnings"
                        : /geopolit|war|tariff|sanction/.test(title) ? "Geopolitical"
                          : "Macro";
                return (
                  <div key={`${event.title}-${event.date}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium text-white">{event.title}</span>
                    <span className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className="border border-zinc-700 px-1.5 py-0.5">{kind}</span>
                      <span className={event.impact === "High" ? "text-rose-300" : event.impact === "Medium" ? "text-amber-300" : "text-zinc-500"}>{event.impact} impact</span>
                      <span>{new Date(event.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      {event.country && <span>{event.country}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-500">{sentiment.calendar.source} · high-impact events (FOMC, CPI, NFP) usually invalidate technical levels — reduce size around them.</p>
          </div>
        ) : <p className="mb-4 text-sm text-zinc-500">Economic calendar feed unavailable right now.</p>}

        {sentiment.news && sentiment.news.items.length > 0 ? (
          <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            {sentiment.news.items.slice(0, 8).map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:text-white">
                <span className="text-zinc-300">{item.title}</span>
                <span className="text-xs text-zinc-500">{item.source} · {item.category}</span>
              </a>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-500">News feed unavailable right now.</p>}
      </section>
    </div>
  );
}

function RiskTab({ analysis, balance, setBalance, riskPercent, setRiskPercent, winRate, setWinRate }: {
  analysis: MarketAnalysis;
  balance: string; setBalance: (value: string) => void;
  riskPercent: string; setRiskPercent: (value: string) => void;
  winRate: string; setWinRate: (value: string) => void;
}) {
  const risk = analysis.risk;
  return (
    <div className="space-y-5">
      {sectionTitle("Risk management master", "Position sizing · Kelly · Risk of ruin", "text-rose-300")}
      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-800 pb-4">
        <label className="text-xs text-zinc-400">Account balance ($)
          <input type="number" min="0" step="any" value={balance} onChange={(event) => setBalance(event.target.value)} className="mt-1 block w-36 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-400">Risk per trade (%)
          <input type="number" min="0.1" step="0.1" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)} className="mt-1 block w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-400">Assumed win rate (%)
          <input type="number" min="5" max="95" step="1" placeholder="auto" value={winRate} onChange={(event) => setWinRate(event.target.value)} className="mt-1 block w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {card("Risk cash", risk.positionSizing ? `$${fmt(risk.positionSizing.riskCash)}` : "—", `at ${riskPercent}%`)}
        {card("Position size", risk.positionSizing ? fmt(risk.positionSizing.positionSize) : "—", risk.positionSizing ? `notional $${fmt(risk.positionSizing.notional, 0)}` : "no valid stop")}
        {card("Reward:Risk", risk.positionSizing?.riskReward ? risk.positionSizing.riskReward.toFixed(2) : analysis.setup.rewardRisk?.toFixed(2) ?? "—")}
        {card("Kelly (half)", risk.kelly ? `${(risk.kelly.half * 100).toFixed(2)}%` : "—", risk.kelly ? `edge ${risk.kelly.edgePercent.toFixed(1)}%` : "")}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Kelly criterion</p>
          <p className="mt-1 text-xs text-zinc-400">{risk.kelly?.note ?? "Enter a valid stop loss to compute Kelly sizing."}</p>
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Risk of ruin</p>
          <p className="mt-1 text-xs text-zinc-400">{risk.riskOfRuin ? `Monte Carlo chance of a 50% drawdown: ${(risk.riskOfRuin.probability * 100).toFixed(2)}%. ${risk.riskOfRuin.note}` : "Not enough inputs yet."}</p>
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Drawdown analysis</p>
          <p className="mt-1 text-xs text-zinc-400">{risk.drawdown?.note ?? "Run a backtest in the Backtest & Journal tab to measure historical drawdown."}</p>
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Warnings</p>
          {risk.warnings.length === 0 ? <p className="mt-1 text-xs text-zinc-400">No red flags at this size.</p> : risk.warnings.map((warning) => <p key={warning} className="mt-1 text-xs text-amber-300">⚠ {warning}</p>)}
        </div>
      </div>
    </div>
  );
}

function SetupTab({ analysis }: { analysis: MarketAnalysis }) {
  const setup = analysis.setup;
  return (
    <div className="space-y-5">
      {sectionTitle("Advanced trade setup", "Zones · scaling · trailing stops", "text-emerald-300")}
      {setup.direction === "wait" ? (
        <p className="text-sm text-zinc-400">{setup.reason}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
            {card("Direction", setup.direction === "buy" ? "Long (buy)" : "Short (sell)", `Quality ${setup.qualityScore}/100`)}
            {card("Entry zone", setup.entryZone ? `${fmt(setup.entryZone.low)} – ${fmt(setup.entryZone.high)}` : "—", setup.entryZone?.label)}
            {card("Stop loss", fmt(setup.stopLoss), "Invalidation")}
            {card("R:R (TP1)", setup.rewardRisk ? setup.rewardRisk.toFixed(2) : "—")}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {setup.takeProfits.map((tp) => (
              <div key={tp.label} className="border border-zinc-800 p-3">
                <p className="text-sm font-semibold text-white">{tp.label} <span className="text-xs font-normal text-zinc-500">({tp.portionPercent}% out)</span></p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">{fmt(tp.price)}</p>
                <p className="text-xs text-zinc-500">{tp.rewardRisk.toFixed(2)}R</p>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Scaling in</p>
          <ul className="mt-1 space-y-1 text-xs text-zinc-400">{setup.scalingIn.map((item) => <li key={item}>• {item}</li>)}</ul>
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Scaling out</p>
          <ul className="mt-1 space-y-1 text-xs text-zinc-400">{setup.scalingOut.map((item) => <li key={item}>• {item}</li>)}</ul>
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Break-even stop</p>
          <p className="mt-1 text-xs text-zinc-400">{setup.breakEven}</p>
        </div>
        <div className="border border-zinc-800 p-3">
          <p className="text-sm font-semibold text-white">Trailing stop</p>
          <p className="mt-1 text-xs text-zinc-400">{setup.trailingStop}</p>
        </div>
      </div>
    </div>
  );
}

function RegimeTab({ analysis }: { analysis: MarketAnalysis }) {
  const regime = analysis.regime;
  return (
    <div className="space-y-4">
      {sectionTitle("Market regime detection", "Trend vs range · volatility · cycle", "text-sky-300")}
      <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
        {card("Type", regime.type, regime.type === "Trending" ? "Trade with the trend" : "Trade the range edges")}
        {card("Volatility", regime.volatility, `${(regime.efficiencyRatio * 100).toFixed(0)}% efficiency`)}
        {card("Cycle", regime.cycle, "vs 200-period average")}
        {card("Playbook", regime.type === "Trending" ? "Trend following" : "Mean reversion")}
      </div>
      <p className="text-sm leading-relaxed text-zinc-300">{regime.note}</p>
    </div>
  );
}

function summaryRow(label: string, value: string) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 py-1.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function BacktestTab({ data, journal, language, runBacktest, setRunBacktest, memory, learning }: {
  data: AnalystResponse;
  journal: AnalystJournalTrade[];
  language: Language;
  runBacktest: boolean;
  setRunBacktest: (value: boolean) => void;
  memory: string[];
  learning: LearningStats | null;
}) {
  const backtest = data.backtest;
  const forward = data.forward;
  return (
    <div className="space-y-5">
      {sectionTitle("Backtest & forward test", "Test the logic on history", "text-sky-300")}
      <button type="button" onClick={() => setRunBacktest(!runBacktest)} className={`rounded px-4 py-2 text-sm font-semibold ${runBacktest ? "border border-zinc-700 text-zinc-200" : "bg-emerald-400 text-zinc-950"}`}>
        {runBacktest ? "Backtest enabled — click to turn off" : "Run backtest on this timeframe"}
      </button>
      {!runBacktest && <p className="text-xs text-zinc-500">Enable to run the built-in trend-following test with ATR stops and 2R targets on the loaded candles.</p>}

      {backtest && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="border border-zinc-800 p-3">
            <p className="mb-2 text-sm font-semibold text-white">Full sample · {backtest.strategy}</p>
            {summaryRow("Trades", String(backtest.trades))}
            {summaryRow("Win rate", `${backtest.winRate}%`)}
            {summaryRow("Net P/L", `${backtest.netPnlPercent >= 0 ? "+" : ""}${backtest.netPnlPercent}%`)}
            {summaryRow("Max drawdown", `${backtest.maxDrawdownPercent}%`)}
            {summaryRow("Profit factor", String(backtest.profitFactor))}
          </div>
          <div className="border border-zinc-800 p-3">
            <p className="mb-2 text-sm font-semibold text-white">Walk-forward</p>
            {forward?.inSample && forward.outOfSample ? (
              <>
                {summaryRow("In-sample net", `${forward.inSample.netPnlPercent >= 0 ? "+" : ""}${forward.inSample.netPnlPercent}%`)}
                {summaryRow("Out-of-sample net", `${forward.outOfSample.netPnlPercent >= 0 ? "+" : ""}${forward.outOfSample.netPnlPercent}%`)}
                {summaryRow("Out-of-sample win rate", `${forward.outOfSample.winRate}%`)}
                <p className="mt-2 text-xs text-zinc-500">{forward.outOfSample.netPnlPercent > 0 ? "The edge held on unseen data — a good sign." : "The edge faded out of sample, so treat it with caution."}</p>
              </>
            ) : <p className="text-xs text-zinc-500">Not enough candles for a walk-forward split (need 120+).</p>}
          </div>
        </div>
      )}

      <section>
        {sectionTitle("Trade journal · AI feedback", "Your habits reviewed", "text-amber-300")}
        <p className="text-sm leading-relaxed text-zinc-300">{journalFeedback(journal, language)}</p>
      </section>

      <section>
        {sectionTitle("Pattern recognition memory", "Patterns the AI has logged", "text-fuchsia-300")}
        {memory.length === 0
          ? <p className="text-sm text-zinc-500">No patterns stored yet. They are remembered in this browser as the engine detects them.</p>
          : <div className="flex flex-wrap gap-2 text-xs text-zinc-300">{memory.map((item) => <span key={item} className="border border-zinc-800 px-2 py-1">{item}</span>)}</div>}
      </section>

      <section>
        {sectionTitle("AI learning & adaptation", "Outcome tracking · self-adjusted confidence", "text-emerald-300")}
        {learning === null ? (
          <p className="text-sm text-zinc-500">Learning storage is unavailable in this browser session.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
              {card("Calls stored", String(learning.total), "This browser only")}
              {card("Resolved", String(learning.resolved), `${learning.wins} correct`)}
              {card("Hit rate", learning.hitRate === null ? "Need 3+" : `${(learning.hitRate * 100).toFixed(0)}%`, "Measured, not promised")}
              {card("Adjusted confidence", learning.adjustedConfidence === null ? "—" : `${learning.adjustedConfidence}/100`, "Raw confidence blended with hit rate")}
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">
              {learning.hitRate === null
                ? "Each analysis is stored with its direction and price. Once at least 3 calls are at least 4 hours old, the engine scores them against the later price and blends the measured hit rate into the displayed confidence — the AI grades itself instead of claiming accuracy."
                : `Across ${learning.resolved} scored calls the engine was right ${learning.wins} times (${(learning.hitRate * 100).toFixed(0)}%). Confidence shown elsewhere is blended toward that record: past performance never guarantees future results.`}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SimpleLanguageTab({ analysis, language, glossary }: {
  analysis: MarketAnalysis;
  language: Language;
  glossary: { term: string; english: string; urdu: string; romanUrdu: string }[];
}) {
  const steps = analysis.whatToDo[language] ?? analysis.whatToDo.English;
  const meaningOf = (entry: { english: string; urdu: string; romanUrdu: string }) =>
    language === "Urdu" ? entry.urdu : language === "Roman Urdu" ? entry.romanUrdu : entry.english;
  return (
    <div className="space-y-5">
      {sectionTitle("Simple language", `Explained in ${language}`, "text-fuchsia-300")}
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.step} className="flex gap-3 border border-zinc-800 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-400 text-xs font-bold text-zinc-950">{step.step}</span>
            <div>
              <p className="font-semibold text-white">{step.action}</p>
              <p className="mt-1 text-sm text-zinc-400">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Term dictionary</p>
        <div className="grid gap-x-8 md:grid-cols-2">
          {glossary.map((entry) => (
            <div key={entry.term} className="border-b border-zinc-800 py-2 text-sm">
              <span className="font-semibold text-white">{entry.term}</span>
              <span className="ml-2 text-zinc-400">{meaningOf(entry)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}










