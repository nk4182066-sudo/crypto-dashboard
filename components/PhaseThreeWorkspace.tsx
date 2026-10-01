"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import TradingChart, { type ChartDrawing, type IndicatorOverlay } from "@/components/TradingChart";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Coin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  total_volume?: number;
}

interface NewsItem {
  title: string;
  url: string;
  source: string;
  category: "Crypto" | "Forex";
  publishedAt: string;
}

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

interface WhaleTransaction {
  txid: string;
  btc: number;
  outputs: number;
}

interface PortfolioPosition {
  id: string;
  coinId: string;
  quantity: number;
  averageCost: number;
}

interface JournalTrade {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  entry: number;
  exit: number;
  quantity: number;
  pnl: number;
  notes: string;
  closedAt: string;
}

interface PaperTrade {
  id: string;
  coinId: string;
  side: "Long" | "Short";
  entry: number;
  quantity: number;
  reserved: number;
  openedAt: string;
  exit?: number;
  pnl?: number;
}

interface BacktestResult {
  trades: number;
  wins: number;
  netPnl: number;
  returnPercent: number;
  maxDrawdown: number;
  strategy: string;
}

interface WorkspaceProps {
  coins: Coin[];
  initialCoin?: string;
  initialPanel?: "chart" | "insights";
}

type WorkspacePanel = "chart" | "insights" | "scanner" | "portfolio" | "journal" | "paper" | "backtest";
type Timeframe = "15m" | "1h" | "4h" | "1d" | "max";
type DrawingMode = ChartDrawing["kind"] | null;
type SeriesPoint = { time: number; value: number };

const persistenceKeys = {
  drawings: "phase3-drawings-v1",
  portfolio: "phase3-portfolio-v1",
  journal: "phase3-journal-v1",
  paperTrades: "phase3-paper-trades-v1",
  paperCash: "phase3-paper-cash-v1",
} as const;

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let restored: T | undefined;
    let hasStoredValue = false;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        restored = JSON.parse(stored) as T;
        hasStoredValue = true;
      }
    } catch {
      // Keep the in-memory value when browser storage is unavailable.
    }
    queueMicrotask(() => {
      if (hasStoredValue) setValue(restored as T);
      setReady(true);
    });
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The current session remains usable when storage is full.
    }
  }, [key, value, ready]);

  return [value, setValue] as const;
}

function averageSeries(candles: Candle[], period: number) {
  const values: (number | null)[] = Array(candles.length).fill(null);
  const points: SeriesPoint[] = [];
  let sum = 0;
  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) {
      const value = sum / period;
      values[index] = value;
      points.push({ time: candle.time, value });
    }
  });
  return { values, points };
}

function calculateRsi(candles: Candle[], period = 14) {
  const values: (number | null)[] = Array(candles.length).fill(null);
  const points: SeriesPoint[] = [];
  for (let index = period; index < candles.length; index += 1) {
    let gains = 0;
    let losses = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      const change = candles[offset].close - candles[offset - 1].close;
      gains += Math.max(change, 0);
      losses += Math.max(-change, 0);
    }
    const value = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    values[index] = value;
    points.push({ time: candles[index].time, value });
  }
  return { values, points };
}

function calculateEma(candles: Candle[], period: number) {
  const values: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length < period) return values;
  let current = candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period;
  values[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < candles.length; index += 1) {
    current = (candles[index].close - current) * multiplier + current;
    values[index] = current;
  }
  return values;
}

function calculateMacd(candles: Candle[]) {
  const fast = calculateEma(candles, 12);
  const slow = calculateEma(candles, 26);
  const line = candles.map((_, index) => fast[index] !== null && slow[index] !== null ? fast[index]! - slow[index]! : null);
  const valid = line.flatMap((value) => value === null ? [] : [value]);
  const signalValues: (number | null)[] = Array(candles.length).fill(null);
  if (valid.length >= 9) {
    let current = valid.slice(0, 9).reduce((sum, value) => sum + value, 0) / 9;
    const firstIndex = line.findIndex((value) => value !== null) + 8;
    signalValues[firstIndex] = current;
    const multiplier = 2 / 10;
    for (let index = firstIndex + 1; index < candles.length; index += 1) {
      if (line[index] === null) continue;
      current = (line[index]! - current) * multiplier + current;
      signalValues[index] = current;
    }
  }
  return candles.flatMap((candle, index) => line[index] !== null && signalValues[index] !== null
    ? [{ time: candle.time, line: line[index]!, signal: signalValues[index]!, histogram: line[index]! - signalValues[index]! }]
    : []);
}

function detectDivergence(candles: Candle[], rsiValues: (number | null)[]) {
  const highs: number[] = [];
  const lows: number[] = [];
  const start = Math.max(2, candles.length - 120);
  for (let index = start; index < candles.length - 2; index += 1) {
    const window = candles.slice(index - 2, index + 3);
    if (candles[index].high === Math.max(...window.map((candle) => candle.high)) && rsiValues[index] !== null) highs.push(index);
    if (candles[index].low === Math.min(...window.map((candle) => candle.low)) && rsiValues[index] !== null) lows.push(index);
  }
  const highPair = highs.slice(-2);
  const lowPair = lows.slice(-2);
  if (highPair.length === 2 && candles[highPair[1]].high > candles[highPair[0]].high && rsiValues[highPair[1]]! < rsiValues[highPair[0]]!) {
    return "Bearish RSI divergence: price made a higher swing high while RSI made a lower high.";
  }
  if (lowPair.length === 2 && candles[lowPair[1]].low < candles[lowPair[0]].low && rsiValues[lowPair[1]]! > rsiValues[lowPair[0]]!) {
    return "Bullish RSI divergence: price made a lower swing low while RSI made a higher low.";
  }
  return "No confirmed RSI divergence in the recent 120 candles.";
}

function money(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits }).format(value);
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m ${minutes < 0 ? "ago" : "from now"}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `${Math.abs(hours)}h ${hours < 0 ? "ago" : "from now"}`;
  return new Date(timestamp).toLocaleDateString();
}

function metricCard(label: string, value: string, hint?: string) {
  return <div className="min-w-0 border-l-2 border-emerald-400/70 pl-3 py-1">
    <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
    <p className="mt-1 truncate text-lg font-semibold text-zinc-100">{value}</p>
    {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
  </div>;
}

function chartPath(points: SeriesPoint[], min: number, max: number) {
  if (points.length < 2) return "";
  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * 1000;
    const y = 150 - ((point.value - min) / (max - min || 1)) * 140;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function PhaseThreeWorkspace({ coins, initialCoin, initialPanel = "chart" }: WorkspaceProps) {
  const [panel, setPanel] = useState<WorkspacePanel>(initialPanel);
  const [selectedCoin, setSelectedCoin] = useState(initialCoin ?? coins[0]?.id ?? "bitcoin");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [showSma, setShowSma] = useState({ sma50: true, sma100: true, sma200: true, bollinger: true });
  const [strategy, setStrategy] = useState<"sma" | "rsi">("sma");
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [feedError, setFeedError] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [fearGreed, setFearGreed] = useState<{ value: number; label: string; timestamp: number; source: string } | null>(null);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [whales, setWhales] = useState<WhaleTransaction[]>([]);
  const [newsSourcesUnavailable, setNewsSourcesUnavailable] = useState<string[]>([]);
  const [calendarSource, setCalendarSource] = useState("");
  const [whaleSource, setWhaleSource] = useState("");
  const [portfolioForm, setPortfolioForm] = useState({ coinId: initialCoin ?? coins[0]?.id ?? "bitcoin", quantity: "", averageCost: "" });
  const [journalForm, setJournalForm] = useState({ symbol: "", side: "Long" as "Long" | "Short", entry: "", exit: "", quantity: "", notes: "" });
  const [paperForm, setPaperForm] = useState({ side: "Long" as "Long" | "Short", quantity: "" });
  const [portfolio, setPortfolio] = useStoredState<PortfolioPosition[]>(persistenceKeys.portfolio, []);
  const [journal, setJournal] = useStoredState<JournalTrade[]>(persistenceKeys.journal, []);
  const [paperTrades, setPaperTrades] = useStoredState<PaperTrade[]>(persistenceKeys.paperTrades, []);
  const [paperCash, setPaperCash] = useStoredState<number>(persistenceKeys.paperCash, 10_000);
  const [drawings, setDrawings] = useStoredState<ChartDrawing[]>(persistenceKeys.drawings, []);

  const selectedCoinData = coins.find((coin) => coin.id === selectedCoin);
  const selectedTicker = selectedCoinData?.symbol.toUpperCase() ?? "BTC";
  const selectedPrice = selectedCoinData?.current_price ?? candles.at(-1)?.close ?? 0;
  const historyKey = selectedCoinData ? `${selectedTicker}-USD` : "";

  useEffect(() => {
    if (!historyKey) return;
    let active = true;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const query = new URLSearchParams({ market: "crypto", symbol: historyKey, timeframe });
        const response = await fetch(`/api/market/history?${query}`);
        const result = await response.json() as { candles?: Candle[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Historical candles could not be loaded.");
        if (active) {
          setCandles(result.candles ?? []);
          setHistoryError("");
        }
      } catch (error) {
        if (active) setHistoryError(error instanceof Error ? error.message : "Historical candles could not be loaded.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void loadHistory();
    const interval = window.setInterval(() => void loadHistory(), timeframe === "max" ? 300_000 : 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [historyKey, timeframe]);

  useEffect(() => {
    let active = true;
    const readFeed = async <T,>(type: string): Promise<T> => {
      const response = await fetch(`/api/market/phase3?type=${type}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${type} feed unavailable`);
      return result as T;
    };
    const refresh = async () => {
      const [newsResult, sentimentResult, calendarResult, whaleResult] = await Promise.allSettled([
        readFeed<{ items: NewsItem[]; unavailable: string[] }>("news"),
        readFeed<{ value: number; label: string; timestamp: number; source: string }>("sentiment"),
        readFeed<{ events: CalendarEvent[]; source: string }>("calendar"),
        readFeed<{ transactions: WhaleTransaction[]; source: string }>("whales"),
      ]);
      if (!active) return;
      const errors: string[] = [];
      if (newsResult.status === "fulfilled") {
        setNews(newsResult.value.items);
        setNewsSourcesUnavailable(newsResult.value.unavailable);
      } else errors.push("News feeds");
      if (sentimentResult.status === "fulfilled") setFearGreed(sentimentResult.value);
      else errors.push("Fear & Greed");
      if (calendarResult.status === "fulfilled") {
        setCalendar(calendarResult.value.events);
        setCalendarSource(calendarResult.value.source);
      } else errors.push("Economic calendar");
      if (whaleResult.status === "fulfilled") {
        setWhales(whaleResult.value.transactions);
        setWhaleSource(whaleResult.value.source);
      } else errors.push("Whale feed");
      setFeedError(errors.join(", "));
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const sma50 = useMemo(() => averageSeries(candles, 50), [candles]);
  const sma100 = useMemo(() => averageSeries(candles, 100), [candles]);
  const sma200 = useMemo(() => averageSeries(candles, 200), [candles]);
  const rsi = useMemo(() => calculateRsi(candles), [candles]);
  const macd = useMemo(() => calculateMacd(candles), [candles]);
  const bollinger = useMemo(() => {
    const upper: SeriesPoint[] = [];
    const lower: SeriesPoint[] = [];
    for (let index = 19; index < candles.length; index += 1) {
      const window = candles.slice(index - 19, index + 1).map((candle) => candle.close);
      const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
      const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length);
      upper.push({ time: candles[index].time, value: mean + 2 * deviation });
      lower.push({ time: candles[index].time, value: mean - 2 * deviation });
    }
    return { upper, lower };
  }, [candles]);
  const overlays = useMemo<IndicatorOverlay[]>(() => [
    { id: "sma50", points: showSma.sma50 ? sma50.points : [] },
    { id: "sma100", points: showSma.sma100 ? sma100.points : [] },
    { id: "sma200", points: showSma.sma200 ? sma200.points : [] },
    { id: "bollingerUpper", points: showSma.bollinger ? bollinger.upper : [] },
    { id: "bollingerLower", points: showSma.bollinger ? bollinger.lower : [] },
  ], [showSma, sma50, sma100, sma200, bollinger]);
  const fibLevels = useMemo(() => {
    const recent = candles.slice(-120);
    if (recent.length === 0) return [];
    const high = Math.max(...recent.map((candle) => candle.high));
    const low = Math.min(...recent.map((candle) => candle.low));
    return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => ({
      kind: "support" as const,
      price: high - (high - low) * ratio,
      label: `Fib ${(ratio * 100).toFixed(1)}%`,
    }));
  }, [candles]);
  const divergence = useMemo(() => detectDivergence(candles, rsi.values), [candles, rsi]);
  const recentVolume = candles.slice(-60);
  const averageVolume = recentVolume.length ? recentVolume.reduce((sum, candle) => sum + candle.volume, 0) / recentVolume.length : 0;
  const latestVolumeRatio = averageVolume > 0 ? (recentVolume.at(-1)?.volume ?? 0) / averageVolume : 0;
  const coinsById = useMemo(() => new Map(coins.map((coin) => [coin.id, coin])), [coins]);
  const scannerRows = useMemo(() => [...coins]
    .sort((first, second) => Math.abs(second.price_change_percentage_24h || 0) - Math.abs(first.price_change_percentage_24h || 0))
    .slice(0, 250), [coins]);

  const completeDrawing = (drawing: ChartDrawing) => {
    setDrawings((current) => [...current, drawing]);
    setDrawingMode(null);
  };

  const addPortfolioPosition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(portfolioForm.quantity);
    const averageCost = Number(portfolioForm.averageCost);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageCost) || averageCost <= 0) return;
    setPortfolio((current) => [...current, { id: crypto.randomUUID(), coinId: portfolioForm.coinId, quantity, averageCost }]);
    setPortfolioForm((current) => ({ ...current, quantity: "", averageCost: "" }));
  };

  const portfolioValue = portfolio.reduce((total, position) => total + position.quantity * (coinsById.get(position.coinId)?.current_price ?? position.averageCost), 0);
  const portfolioCost = portfolio.reduce((total, position) => total + position.quantity * position.averageCost, 0);

  const addJournalTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entry = Number(journalForm.entry);
    const exit = Number(journalForm.exit);
    const quantity = Number(journalForm.quantity);
    if (!journalForm.symbol.trim() || ![entry, exit, quantity].every(Number.isFinite) || entry <= 0 || exit <= 0 || quantity <= 0) return;
    const pnl = (journalForm.side === "Long" ? exit - entry : entry - exit) * quantity;
    setJournal((current) => [{
      id: crypto.randomUUID(),
      symbol: journalForm.symbol.trim().toUpperCase(),
      side: journalForm.side,
      entry,
      exit,
      quantity,
      pnl,
      notes: journalForm.notes.trim(),
      closedAt: new Date().toISOString(),
    }, ...current]);
    setJournalForm({ symbol: "", side: "Long", entry: "", exit: "", quantity: "", notes: "" });
  };

  const openPaperTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(paperForm.quantity);
    const reserved = quantity * selectedPrice;
    if (!Number.isFinite(quantity) || quantity <= 0 || selectedPrice <= 0 || reserved > paperCash) return;
    setPaperCash((cash) => cash - reserved);
    setPaperTrades((current) => [{
      id: crypto.randomUUID(),
      coinId: selectedCoin,
      side: paperForm.side,
      entry: selectedPrice,
      quantity,
      reserved,
      openedAt: new Date().toISOString(),
    }, ...current]);
    setPaperForm((current) => ({ ...current, quantity: "" }));
  };

  const closePaperTrade = (trade: PaperTrade) => {
    const currentPrice = coinsById.get(trade.coinId)?.current_price ?? (trade.coinId === selectedCoin ? selectedPrice : trade.entry);
    const pnl = (trade.side === "Long" ? currentPrice - trade.entry : trade.entry - currentPrice) * trade.quantity;
    setPaperCash((cash) => cash + trade.reserved + pnl);
    setPaperTrades((current) => current.map((item) => item.id === trade.id ? { ...item, exit: currentPrice, pnl } : item));
  };

  const runBacktest = () => {
    if (candles.length < 50) {
      setBacktestResult(null);
      return;
    }
    let equity = 10_000;
    let peak = equity;
    let maxDrawdown = 0;
    let entry = 0;
    let units = 0;
    let tradeCount = 0;
    let wins = 0;
    let netPnl = 0;
    const closePosition = (price: number) => {
      const pnl = (price - entry) * units;
      equity += pnl;
      netPnl += pnl;
      tradeCount += 1;
      if (pnl > 0) wins += 1;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak * 100 : 0);
      entry = 0;
      units = 0;
    };

    for (let index = 1; index < candles.length; index += 1) {
      let enter = false;
      let exit = false;
      if (strategy === "sma") {
        const priorFast = sma50.values[index - 1];
        const fast = sma50.values[index];
        const priorSlow = sma200.values[index - 1];
        const slow = sma200.values[index];
        if (priorFast !== null && fast !== null && priorSlow !== null && slow !== null) {
          enter = priorFast <= priorSlow && fast > slow;
          exit = priorFast >= priorSlow && fast < slow;
        }
      } else {
        const prior = rsi.values[index - 1];
        const current = rsi.values[index];
        if (prior !== null && current !== null) {
          enter = prior <= 30 && current > 30;
          exit = prior < 70 && current >= 70;
        }
      }
      if (!entry && enter && candles[index].close > 0) {
        entry = candles[index].close;
        units = equity / entry;
      } else if (entry && exit) closePosition(candles[index].close);
    }
    if (entry && candles.length) closePosition(candles.at(-1)!.close);
    setBacktestResult({
      trades: tradeCount,
      wins,
      netPnl,
      returnPercent: (equity / 10_000 - 1) * 100,
      maxDrawdown,
      strategy: strategy === "sma" ? "SMA 50 / 200 crossover" : "RSI 30 / 70 reversion",
    });
  };

  const navItems: { id: WorkspacePanel; label: string }[] = [
    { id: "chart", label: "Chart & Indicators" },
    { id: "insights", label: "News & Events" },
    { id: "scanner", label: `Scanner (${coins.length})` },
    { id: "portfolio", label: "Portfolio" },
    { id: "journal", label: "Trade Journal" },
    { id: "paper", label: "Paper Trading" },
    { id: "backtest", label: "Backtest" },
  ];

  return (
    <section className="min-w-0 border-t border-zinc-800 bg-[#101416] text-zinc-100">
      <header className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Phase 3</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Market workbench</h2>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor="phase3-coin" className="sr-only">Chart instrument</label>
            <select id="phase3-coin" value={selectedCoin} onChange={(event) => setSelectedCoin(event.target.value)} className="max-w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100">
              {coins.map((coin) => <option key={coin.id} value={coin.id}>{coin.symbol.toUpperCase()} · {coin.name}</option>)}
            </select>
            <span className="hidden text-sm text-zinc-400 sm:inline">{money(selectedPrice, selectedPrice < 1 ? 6 : 2)}</span>
          </div>
        </div>
        <nav aria-label="Phase 3 tools" className="flex gap-1 overflow-x-auto pb-1">
          {navItems.map((item) => <button key={item.id} type="button" onClick={() => setPanel(item.id)} aria-current={panel === item.id ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${panel === item.id ? "border-emerald-400 text-emerald-200" : "border-transparent text-zinc-400 hover:text-white"}`}>
            {item.label}
          </button>)}
        </nav>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        {panel === "chart" && <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Chart timeframe">
              {(["15m", "1h", "4h", "1d", "max"] as Timeframe[]).map((item) => <button key={item} type="button" onClick={() => setTimeframe(item)} aria-pressed={timeframe === item} className={`min-w-12 rounded border px-3 py-1.5 text-xs font-semibold ${timeframe === item ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>{item === "max" ? "Max" : item}</button>)}
            </div>
            {historyLoading && <span role="status" className="text-xs text-zinc-400">Updating candles…</span>}
          </div>
          {historyError && <p role="alert" className="border-l-2 border-amber-400 pl-3 text-sm text-amber-200">{historyError}</p>}
          <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
            {metricCard("RSI · 14", rsi.values.at(-1) === null || rsi.values.at(-1) === undefined ? "Waiting" : rsi.values.at(-1)!.toFixed(1), "Below 30 oversold · above 70 overbought")}
            {metricCard("MACD · 12/26/9", macd.at(-1) ? macd.at(-1)!.histogram.toFixed(4) : "Waiting", "Histogram: MACD minus signal")}
            {metricCard("Volume vs avg", latestVolumeRatio ? `${latestVolumeRatio.toFixed(2)}×` : "Waiting", "Latest candle vs recent 60-bar mean")}
            {metricCard("RSI divergence", divergence.startsWith("No ") ? "None" : divergence.startsWith("Bullish") ? "Bullish" : "Bearish", "Recent confirmed swing comparison")}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-xs text-zinc-300">
              {([
                ["sma50", "SMA 50", "#fbbf24"],
                ["sma100", "SMA 100", "#22d3ee"],
                ["sma200", "SMA 200", "#f472b6"],
                ["bollinger", "Bollinger", "#a3e635"],
              ] as const).map(([key, label, color]) => <label key={key} className="flex items-center gap-1.5">
                <input type="checkbox" checked={showSma[key]} onChange={(event) => setShowSma((current) => ({ ...current, [key]: event.target.checked }))} className="accent-emerald-400" />
                <span style={{ color }}>{label}</span>
              </label>)}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Drawing tools">
              {([ ["trendline", "Trend line"], ["horizontal", "Horizontal"], ["fibonacci", "Fibonacci"] ] as const).map(([mode, label]) => <button key={mode} type="button" onClick={() => setDrawingMode((current) => current === mode ? null : mode)} aria-pressed={drawingMode === mode} title={`Draw ${label.toLowerCase()} on the chart`} className={`rounded border px-2.5 py-1.5 text-xs ${drawingMode === mode ? "border-orange-400 bg-orange-400/15 text-orange-200" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>{label}</button>)}
              <button type="button" onClick={() => setDrawings([])} title="Clear saved chart drawings" className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white">Clear</button>
            </div>
          </div>
          {drawingMode && <p role="status" className="text-xs text-orange-200">{drawingMode === "horizontal" ? "Click once on the chart to place the level." : "Click two points on the chart to finish the drawing."}</p>}
          <div className="h-[340px] min-w-0 overflow-hidden border border-zinc-800 bg-[#0b0e10] sm:h-[430px]">
            <TradingChart data={candles} chartKey={`${historyKey}:${timeframe}`} indicatorOverlays={overlays} levels={fibLevels} drawings={drawings} drawingMode={drawingMode} onDrawingComplete={completeDrawing} height={430} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="RSI chart" className="border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">RSI · 14</h3><span className="text-xs text-zinc-500">70 / 30 guide levels</span></div>
              <svg viewBox="0 0 1000 150" role="img" aria-label="Relative strength index line chart" className="h-28 w-full">
                <line x1="0" y1="38" x2="1000" y2="38" stroke="#713f12" strokeDasharray="8 6" />
                <line x1="0" y1="108" x2="1000" y2="108" stroke="#713f12" strokeDasharray="8 6" />
                <path d={chartPath(rsi.points.slice(-100), 0, 100)} fill="none" stroke="#38bdf8" strokeWidth="3" />
              </svg>
            </section>
            <section aria-label="MACD chart" className="border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">MACD · 12 / 26 / 9</h3><span className="text-xs text-zinc-500">Histogram</span></div>
              <svg viewBox="0 0 1000 150" role="img" aria-label="MACD histogram chart" className="h-28 w-full">
                <line x1="0" y1="75" x2="1000" y2="75" stroke="#3f3f46" />
                {macd.slice(-100).map((point, index, series) => {
                  const max = Math.max(0.000001, ...series.map((item) => Math.abs(item.histogram)));
                  const height = Math.abs(point.histogram) / max * 65;
                  const width = 1000 / series.length;
                  return <rect key={point.time} x={index * width} y={point.histogram >= 0 ? 75 - height : 75} width={Math.max(1, width - 2)} height={height} fill={point.histogram >= 0 ? "#34d399" : "#fb7185"} />;
                })}
              </svg>
            </section>
          </div>
          <section aria-label="Volume analysis" className="border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">Volume · latest 60 bars</h3><span className="text-xs text-zinc-400">Current / mean: {latestVolumeRatio ? `${latestVolumeRatio.toFixed(2)}×` : "n/a"}</span></div>
            <div className="flex h-24 items-end gap-px" role="img" aria-label="Volume histogram for recent candles">
              {recentVolume.map((candle) => <div key={candle.time} title={`${new Date(candle.time * 1000).toLocaleString()} · ${candle.volume.toLocaleString()} volume`} className={`min-w-0 flex-1 ${candle.close >= candle.open ? "bg-emerald-400/75" : "bg-rose-400/75"}`} style={{ height: `${Math.max(2, averageVolume ? candle.volume / Math.max(...recentVolume.map((item) => item.volume), 1) * 100 : 2)}%` }} />)}
            </div>
          </section>
          <p className="text-xs leading-relaxed text-zinc-500">{divergence} Fibonacci levels use the recent 120-candle high/low range. Indicators are descriptive calculations, not trade instructions.</p>
        </>}

        {panel === "insights" && <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <section className="min-w-0 border-b border-zinc-800 pb-5 xl:border-b-0 xl:border-r xl:pr-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs uppercase tracking-wide text-emerald-300">Live RSS feeds</p><h3 className="mt-1 text-lg font-semibold text-white">Crypto & forex headlines</h3></div><span className="text-xs text-zinc-500">CoinDesk · FXStreet</span></div>
            {feedError && <p role="status" className="mb-3 text-xs text-amber-200">Unavailable: {feedError}</p>}
            {newsSourcesUnavailable.length > 0 && <p className="mb-3 text-xs text-amber-200">Unavailable source(s): {newsSourcesUnavailable.join(", ")}</p>}
            <div className="divide-y divide-zinc-800">
              {news.map((item) => <a key={`${item.source}-${item.url}`} href={item.url} target="_blank" rel="noreferrer" className="grid gap-1 py-3 sm:grid-cols-[70px_minmax(0,1fr)_90px] sm:items-start">
                <span className={`text-[10px] font-semibold uppercase ${item.category === "Crypto" ? "text-orange-300" : "text-sky-300"}`}>{item.category}</span>
                <span className="text-sm leading-snug text-zinc-200 hover:text-white">{item.title}<span className="mt-1 block text-[10px] text-zinc-500">{item.source}</span></span>
                <time className="text-xs text-zinc-500">{relativeTime(item.publishedAt)}</time>
              </a>)}
              {news.length === 0 && <p className="py-5 text-sm text-zinc-400">No headlines returned by the configured feeds.</p>}
            </div>
          </section>
          <div className="space-y-6">
            <section className="border-b border-zinc-800 pb-5">
              <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-wide text-amber-300">Crypto sentiment</p><h3 className="mt-1 text-lg font-semibold text-white">Fear & Greed</h3></div><span className="text-[10px] text-zinc-500">{fearGreed?.source ?? "Alternative.me"}</span></div>
              {fearGreed ? <div className="mt-4 flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-[6px] border-amber-400/80 bg-zinc-950 text-2xl font-bold text-white">{fearGreed.value}</div><div><p className="font-semibold text-white">{fearGreed.label}</p><p className="mt-1 text-xs text-zinc-500">As of {new Date(fearGreed.timestamp).toLocaleDateString()}</p></div></div> : <p className="mt-4 text-sm text-zinc-400">Sentiment feed unavailable.</p>}
            </section>
            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs uppercase tracking-wide text-rose-300">Bitcoin on-chain</p><h3 className="mt-1 text-lg font-semibold text-white">Large mempool transfers</h3></div><span className="text-[10px] text-zinc-500">{whaleSource || "mempool.space"}</span></div>
              <p className="mb-3 text-xs leading-relaxed text-zinc-500">Unconfirmed BTC transactions with at least 50 BTC in total outputs. Output value is not net inflow and may include change.</p>
              {whales.length ? <div className="divide-y divide-zinc-800">{whales.slice(0, 6).map((transaction) => <a key={transaction.txid} href={`https://mempool.space/tx/${transaction.txid}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate font-mono text-xs text-zinc-400">{transaction.txid.slice(0, 12)}…</span><span className="shrink-0 font-semibold text-rose-200">{transaction.btc.toFixed(2)} BTC</span>
              </a>)}</div> : <p className="text-sm text-zinc-400">No qualifying transactions in the sampled mempool.</p>}
            </section>
          </div>
          <section className="xl:col-span-2">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs uppercase tracking-wide text-sky-300">Upcoming macro releases</p><h3 className="mt-1 text-lg font-semibold text-white">Economic calendar</h3></div><span className="text-[10px] text-zinc-500">{calendarSource || "Forex Factory calendar feed"}</span></div>
            <div className="overflow-x-auto border-y border-zinc-800">
              <table className="w-full min-w-[650px] text-left text-xs"><thead className="text-zinc-500"><tr><th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">Event</th><th className="py-2 pr-3 font-medium">Region</th><th className="py-2 pr-3 font-medium">Impact</th><th className="py-2 pr-3 font-medium">Forecast</th><th className="py-2 font-medium">Previous</th></tr></thead><tbody className="divide-y divide-zinc-800">
                {calendar.slice(0, 20).map((event, index) => <tr key={`${event.date}-${event.title}-${index}`}><td className="whitespace-nowrap py-2 pr-3 text-zinc-400">{new Date(event.date).toLocaleString()}</td><td className="py-2 pr-3 text-zinc-200">{event.title}</td><td className="py-2 pr-3 text-zinc-400">{event.country}</td><td className={`py-2 pr-3 ${event.impact.toLowerCase().includes("high") ? "text-rose-300" : "text-zinc-400"}`}>{event.impact}</td><td className="py-2 pr-3 text-zinc-300">{event.forecast || "—"}</td><td className="py-2 text-zinc-400">{event.previous || "—"}</td></tr>)}
                {calendar.length === 0 && <tr><td colSpan={6} className="py-4 text-zinc-400">Calendar feed unavailable or no upcoming events.</td></tr>}
              </tbody></table>
            </div>
          </section>
        </div>}

        {panel === "scanner" && <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-emerald-300">CoinGecko market list</p><h3 className="mt-1 text-lg font-semibold text-white">Momentum scanner · {scannerRows.length} assets</h3><p className="mt-1 text-xs text-zinc-500">Ranks 24-hour movers only; these are not validated trade setups.</p></div><span className="text-xs text-zinc-500">Updates with market data</span></div>
          <div className="max-h-[620px] overflow-auto border-y border-zinc-800">
            <table className="w-full min-w-[590px] text-left text-xs"><thead className="sticky top-0 bg-[#101416] text-zinc-500"><tr><th className="py-2 pr-3 font-medium">#</th><th className="py-2 pr-3 font-medium">Asset</th><th className="py-2 pr-3 font-medium">Price</th><th className="py-2 pr-3 font-medium">24h</th><th className="py-2 pr-3 font-medium">24h volume</th><th className="py-2 font-medium">Momentum</th></tr></thead><tbody className="divide-y divide-zinc-800">
              {scannerRows.map((coin, index) => {
                const change = coin.price_change_percentage_24h || 0;
                const score = Math.min(100, Math.round(Math.abs(change) * 12));
                return <tr key={coin.id} className="hover:bg-zinc-900/70"><td className="py-2 pr-3 text-zinc-500">{index + 1}</td><td className="py-2 pr-3"><button type="button" onClick={() => { setSelectedCoin(coin.id); setPanel("chart"); }} className="text-left font-semibold text-zinc-200 hover:text-emerald-200">{coin.symbol.toUpperCase()} <span className="font-normal text-zinc-500">{coin.name}</span></button></td><td className="py-2 pr-3 text-zinc-300">{money(coin.current_price, coin.current_price < 1 ? 6 : 2)}</td><td className={`py-2 pr-3 ${change >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</td><td className="py-2 pr-3 text-zinc-400">{coin.total_volume ? money(coin.total_volume, 0) : "—"}</td><td className="py-2"><span className="mr-2 inline-block h-1.5 rounded-full bg-emerald-400" style={{ width: `${Math.max(score, 2)}px` }} />{score}/100 {change >= 0 ? "up" : "down"}</td></tr>;
              })}
              {scannerRows.length === 0 && <tr><td colSpan={6} className="py-5 text-zinc-400">Coin market feed unavailable.</td></tr>}
            </tbody></table>
          </div>
        </section>}

        {panel === "portfolio" && <section>
          <div className="mb-5 grid grid-cols-2 gap-4 border-b border-zinc-800 pb-5 sm:grid-cols-3">
            {metricCard("Market value", money(portfolioValue), `${portfolio.length} positions`)}
            {metricCard("Cost basis", money(portfolioCost))}
            {metricCard("Unrealized P/L", money(portfolioValue - portfolioCost), portfolioCost ? `${((portfolioValue / portfolioCost - 1) * 100).toFixed(2)}%` : "Add a position to begin")}
          </div>
          <form onSubmit={addPortfolioPosition} className="mb-5 grid gap-2 border-b border-zinc-800 pb-5 sm:grid-cols-[minmax(150px,1fr)_1fr_1fr_auto]">
            <label className="sr-only" htmlFor="portfolio-coin">Coin</label><select id="portfolio-coin" value={portfolioForm.coinId} onChange={(event) => setPortfolioForm((current) => ({ ...current, coinId: event.target.value }))} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">{coins.map((coin) => <option key={coin.id} value={coin.id}>{coin.symbol.toUpperCase()} · {coin.name}</option>)}</select>
            <input aria-label="Coin quantity" type="number" min="0" step="any" required value={portfolioForm.quantity} onChange={(event) => setPortfolioForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <input aria-label="Average cost per coin" type="number" min="0" step="any" required value={portfolioForm.averageCost} onChange={(event) => setPortfolioForm((current) => ({ ...current, averageCost: event.target.value }))} placeholder="Average cost ($)" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <button type="submit" className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">Add position</button>
          </form>
          <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="text-xs text-zinc-500"><tr><th className="py-2 pr-3">Asset</th><th className="py-2 pr-3">Quantity</th><th className="py-2 pr-3">Avg. cost</th><th className="py-2 pr-3">Market value</th><th className="py-2 pr-3">P/L</th><th className="py-2" /></tr></thead><tbody className="divide-y divide-zinc-800">
            {portfolio.map((position) => {
              const coin = coinsById.get(position.coinId);
              const price = coin?.current_price ?? position.averageCost;
              const value = price * position.quantity;
              const pnl = (price - position.averageCost) * position.quantity;
              return <tr key={position.id}><td className="py-3 pr-3 font-semibold">{coin?.symbol.toUpperCase() ?? position.coinId}</td><td className="py-3 pr-3 text-zinc-300">{position.quantity}</td><td className="py-3 pr-3 text-zinc-300">{money(position.averageCost, position.averageCost < 1 ? 6 : 2)}</td><td className="py-3 pr-3 text-zinc-300">{money(value)}</td><td className={`py-3 pr-3 ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(pnl)}</td><td className="py-3 text-right"><button type="button" onClick={() => setPortfolio((current) => current.filter((item) => item.id !== position.id))} aria-label={`Remove ${coin?.symbol ?? position.coinId} position`} className="text-zinc-500 hover:text-rose-300">Remove</button></td></tr>;
            })}
            {portfolio.length === 0 && <tr><td colSpan={6} className="py-5 text-zinc-400">No positions recorded.</td></tr>}
          </tbody></table></div>
          <p className="mt-3 text-xs text-zinc-500">Live values use the CoinGecko price list. Assets outside its current coverage fall back to cost basis.</p>
        </section>}

        {panel === "journal" && <section>
          <div className="mb-4"><p className="text-xs uppercase tracking-wide text-amber-300">Local to this browser</p><h3 className="mt-1 text-lg font-semibold text-white">Closed trade journal</h3></div>
          <form onSubmit={addJournalTrade} className="mb-5 grid gap-2 border-b border-zinc-800 pb-5 sm:grid-cols-3">
            <input aria-label="Trade symbol" required value={journalForm.symbol} onChange={(event) => setJournalForm((current) => ({ ...current, symbol: event.target.value }))} placeholder="Symbol · e.g. BTC/USD" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <select aria-label="Trade direction" value={journalForm.side} onChange={(event) => setJournalForm((current) => ({ ...current, side: event.target.value as "Long" | "Short" }))} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option>Long</option><option>Short</option></select>
            <input aria-label="Trade quantity" required type="number" min="0" step="any" value={journalForm.quantity} onChange={(event) => setJournalForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <input aria-label="Trade entry price" required type="number" min="0" step="any" value={journalForm.entry} onChange={(event) => setJournalForm((current) => ({ ...current, entry: event.target.value }))} placeholder="Entry price" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <input aria-label="Trade exit price" required type="number" min="0" step="any" value={journalForm.exit} onChange={(event) => setJournalForm((current) => ({ ...current, exit: event.target.value }))} placeholder="Exit price" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <input aria-label="Trade notes" value={journalForm.notes} onChange={(event) => setJournalForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes (optional)" className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
            <button type="submit" className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 sm:col-span-3 sm:justify-self-end">Record trade</button>
          </form>
          <div className="divide-y divide-zinc-800">{journal.map((trade) => <article key={trade.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-center">
            <div><p className="font-semibold text-white">{trade.symbol} · {trade.side}</p><p className="text-xs text-zinc-500">{new Date(trade.closedAt).toLocaleDateString()}</p></div>
            <p className="text-xs text-zinc-400">Entry {money(trade.entry, 6)} → Exit {money(trade.exit, 6)}</p><p className="text-xs text-zinc-400">Qty {trade.quantity}</p><p className={`font-semibold ${trade.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(trade.pnl)}</p>
            <button type="button" onClick={() => setJournal((current) => current.filter((item) => item.id !== trade.id))} className="text-left text-xs text-zinc-500 hover:text-rose-300">Delete</button>
            {trade.notes && <p className="text-xs text-zinc-500 sm:col-span-5">{trade.notes}</p>}
          </article>)}{journal.length === 0 && <p className="py-5 text-sm text-zinc-400">No closed trades recorded.</p>}</div>
        </section>}

        {panel === "paper" && <section>
          <div className="mb-5 grid grid-cols-2 gap-4 border-b border-zinc-800 pb-5 sm:grid-cols-3">
            {metricCard("Demo cash", money(paperCash), "Starts at $10,000 · no real orders")}
            {metricCard("Open positions", String(paperTrades.filter((trade) => trade.exit === undefined).length))}
            {metricCard("Closed trades", String(paperTrades.filter((trade) => trade.exit !== undefined).length))}
          </div>
          <form onSubmit={openPaperTrade} className="mb-5 flex flex-wrap items-end gap-2 border-b border-zinc-800 pb-5">
            <div><label htmlFor="paper-side" className="mb-1 block text-xs text-zinc-500">Direction</label><select id="paper-side" value={paperForm.side} onChange={(event) => setPaperForm((current) => ({ ...current, side: event.target.value as "Long" | "Short" }))} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option>Long</option><option>Short</option></select></div>
            <div><label htmlFor="paper-quantity" className="mb-1 block text-xs text-zinc-500">Quantity</label><input id="paper-quantity" type="number" min="0" step="any" required value={paperForm.quantity} onChange={(event) => setPaperForm((current) => ({ ...current, quantity: event.target.value }))} className="w-36 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" /></div>
            <p className="pb-2 text-xs text-zinc-400">{selectedTicker} at {money(selectedPrice, selectedPrice < 1 ? 6 : 2)} · cash-backed only</p>
            <button type="submit" className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">Open demo position</button>
          </form>
          <div className="divide-y divide-zinc-800">{paperTrades.map((trade) => {
            const coin = coinsById.get(trade.coinId);
            const currentPrice = coin?.current_price ?? trade.entry;
            const openPnl = (trade.side === "Long" ? currentPrice - trade.entry : trade.entry - currentPrice) * trade.quantity;
            return <article key={trade.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="font-semibold text-white">{coin?.symbol.toUpperCase() ?? trade.coinId} · {trade.side}</p><p className="text-xs text-zinc-500">Entry {money(trade.entry, 6)} · Qty {trade.quantity}</p></div>
              <p className={`text-sm font-semibold ${(trade.pnl ?? openPnl) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{trade.exit === undefined ? `Open ${money(openPnl)}` : `Closed ${money(trade.pnl ?? 0)}`}</p>
              {trade.exit === undefined && <button type="button" onClick={() => closePaperTrade(trade)} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">Close at market</button>}
            </article>;
          })}{paperTrades.length === 0 && <p className="py-5 text-sm text-zinc-400">No demo positions yet.</p>}</div>
          <p className="mt-4 text-xs text-zinc-500">Paper positions use CoinGecko spot prices for valuation and do not place exchange orders.</p>
        </section>}

        {panel === "backtest" && <section>
          <div className="mb-4"><p className="text-xs uppercase tracking-wide text-sky-300">Historical candles · {candles.length.toLocaleString()} bars</p><h3 className="mt-1 text-lg font-semibold text-white">Strategy backtest</h3></div>
          <div className="flex flex-wrap items-end gap-3 border-b border-zinc-800 pb-5">
            <div><label htmlFor="backtest-strategy" className="mb-1 block text-xs text-zinc-500">Strategy</label><select id="backtest-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value as "sma" | "rsi")} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option value="sma">SMA 50 / 200 crossover</option><option value="rsi">RSI 30 / 70 reversion</option></select></div>
            <button type="button" onClick={runBacktest} disabled={candles.length < 50} className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50">Run on {timeframe}</button>
            <p className="max-w-xl text-xs leading-relaxed text-zinc-500">Long-only simulation, $10,000 starting equity, fully invested at entry, no fees, slippage, or order-fill assumptions. Results describe the selected historical window only.</p>
          </div>
          {backtestResult && <div className="mt-5 grid grid-cols-2 gap-4 border-b border-zinc-800 pb-5 sm:grid-cols-3 lg:grid-cols-5">
            {metricCard("Strategy", backtestResult.strategy)}
            {metricCard("Closed trades", String(backtestResult.trades), `${backtestResult.wins} profitable`)}
            {metricCard("Net P/L", money(backtestResult.netPnl))}
            {metricCard("Return", `${backtestResult.returnPercent.toFixed(2)}%`)}
            {metricCard("Max drawdown", `${backtestResult.maxDrawdown.toFixed(2)}%`)}
          </div>}
          {!backtestResult && <p className="py-5 text-sm text-zinc-400">Choose a rule and run it against the currently loaded {selectedTicker} candles.</p>}
        </section>}
      </div>
    </section>
  );
}