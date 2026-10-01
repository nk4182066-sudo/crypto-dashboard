"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import AnnotatedChart, { type ChartAnnotation, type RiskRewardSummary, type TradeVerdict } from "@/components/AnnotatedChart";
import PhaseThreeWorkspace from "@/components/PhaseThreeWorkspace";
import TradingChart from "@/components/TradingChart";

interface ChatMessage {
  role: string;
  content: string;
  language?: "English" | "Urdu" | "Roman Urdu";
  image?: string | null;
  chartMarkup?: boolean;
  annotations?: ChartAnnotation[];
  verdict?: TradeVerdict;
  riskReward?: RiskRewardSummary;
  tradePlan?: TradePlan;
  tradeSummary?: TradeSummary;
  indicatorSummary?: IndicatorSummary;
  analysisExplanation?: string;
  chartPattern?: string;
}

interface TradePlan {
  direction: "buy" | "sell" | "wait";
  qualityScore: number | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  rewardRisk: number | null;
  reason: string;
}

interface TradeSummary {
  balance: string;
  risk: string;
  maxLoss: string;
  size: string;
  leverage: string;
  rewardRisk: string;
  estimatedProfit: string;
  highRisk: boolean;
}

interface IndicatorSummary {
  rsi14: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  movingAverages: { sma20: number | null; sma50: number | null };
  bollingerBands: { upper: number; middle: number; lower: number } | null;
  fibonacci: { high: number; low: number; retracement: { ratio: number; price: number }[] } | null;
}

interface ChatSession {
  id: string;
  title: string;
  topic: string;
  updatedAt: number;
  messages: ChatMessage[];
}

const chatGreeting: ChatMessage = {
  role: "assistant",
  content: "Hello! I am Muhammad Noman's Assistant AI from Trading Student Expert AI. How can I help you with crypto, forex, or stock market analysis today?",
};

const chatHistoryStorageKey = "trading-student-expert-chat-history-v1";

function createChatSession(topic = ""): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    topic,
    updatedAt: Date.now(),
    messages: [{ ...chatGreeting }],
  };
}

function saveChatHistory(sessions: ChatSession[]) {
  const boundedHistory = sessions.slice(0, 30).map((session) => ({
    ...session,
    messages: session.messages.slice(-60),
  }));
  try {
    localStorage.setItem(chatHistoryStorageKey, JSON.stringify(boundedHistory));
  } catch {
    const textOnlyHistory = boundedHistory.map((session) => ({
      ...session,
      messages: session.messages.map((message) => {
        const textOnlyMessage = { ...message };
        delete textOnlyMessage.image;
        return textOnlyMessage;
      }),
    }));
    try {
      localStorage.setItem(chatHistoryStorageKey, JSON.stringify(textOnlyHistory));
    } catch {
      localStorage.removeItem(chatHistoryStorageKey);
    }
  }
}

function chatTitleFromMessage(message: string) {
  const cleanMessage = message.replace(/\s+/g, " ").trim();
  return cleanMessage.length > 48 ? `${cleanMessage.slice(0, 45)}...` : cleanMessage || "New Chat";
}

function isAnalysisRequest(message: string) {
  return /\b(analy[sz]|analysis|trade|setup|entry|stop.?loss|take.?profit|support|resistance|trend|pattern|signal|buy|sell|risk|chart|bata|bta|tajziya|kharid|bech)\b/i.test(message);
}

function isFollowUpQuestion(message: string) {
  return /^\s*(what about|why|how about|explain that|tell me more|what if|and |aur\b|kyun\b|phir\b|is mein\b|us mein\b)/i.test(message);
}

function detectChatLanguage(message: string) {
  if (/[\u0600-\u06ff]/.test(message)) return "Urdu";
  if (/\b(kese|kaise|kesy|kesi|kise)\s+ho\b|\b(kya|kia)\s+haal\b|\b(ka|ki|ke|mere|mujhe|mujhy|bata|bta|hain|hai|kya|kia|aur|mein|main|samjhao|samjha|kharid|bech|karna|karo|chahiye|aap|apka)\b/i.test(message)) return "Roman Urdu";
  return "English";
}

function tradeSafetyNotes(language: ChatMessage["language"]) {
  if (language === "Urdu") {
    return {
      warning: "یہ یقینی نہیں ہے۔ مارکیٹ الٹ سکتی ہے۔ ہمیشہ Stop Loss لگائیں۔ اتنا ہی رسک لیں جتنا کھونے کی استطاعت ہو۔",
      probability: "درست reversal probability معلوم نہیں۔ سیکھیں، سمجھیں، پھر trade کریں۔ فیصلہ آپ کا ہے۔",
    };
  }
  if (language === "Roman Urdu") {
    return {
      warning: "Yeh guaranteed nahi. Market reverse ho sakti hai. Hamesha Stop Loss lagayen. Sirf utna risk lein jitna lose kar sakte hain.",
      probability: "Exact reversal probability ka reliable data nahi. Pehle seekhein, samjhein, phir trade karein. Aapka paisa, aapka faisla.",
    };
  }
  return {
    warning: "This is not guaranteed. The market can reverse. Always use a Stop Loss. Never risk more than you can afford to lose.",
    probability: "A precise reversal probability is not available from this analysis. Learn, understand, then trade. Your money, your decision.",
  };
}

function mentionedAssetTopic(message: string, name: string, symbol: string) {
  const normalizedMessage = message.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [name, symbol]
    .map((term) => term.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .some((term) => term.length >= 3 && normalizedMessage.includes(term));
}

interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume?: number;
}

interface NewsItem {
  title: string;
  time: string;
  category: string;
}

interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimedPricePoint {
  time: number;
  price: number;
}

interface StructureMarker extends TimedPricePoint {
  kind: "higherHigh" | "lowerLow" | "reverse";
}

interface ChartStructure {
  markers: StructureMarker[];
  trendline: TimedPricePoint[];
  patternOutline: TimedPricePoint[];
}

interface PriceLevel {
  kind: "support" | "resistance" | "entry" | "stopLoss" | "takeProfit";
  price: number;
  label?: string;
}

interface MarketSignal {
  direction: "buy" | "sell";
  time: number;
  price: number;
  reason: string;
}

interface MentionedAsset {
  topic: string;
  market: "crypto" | "forex" | "stocks";
  symbol: string;
  label: string;
  id: string;
}

interface MarketAnalysisResult {
  levels?: { support?: number[]; resistance?: number[] };
  signals?: MarketSignal[];
  indicators?: IndicatorSummary;
  pattern?: string;
  explanation?: string;
  tradePlan?: TradePlan;
}

interface PriceAlert {
  id: number;
  assetKey: string;
  assetLabel: string;
  target: number;
  direction: "above" | "below";
}

function mergeCandles(existing: ChartData[], incoming: ChartData[]) {
  const candles = new Map(existing.map((candle) => [candle.time, candle]));
  incoming.forEach((candle) => candles.set(candle.time, candle));
  return [...candles.values()].sort((first, second) => first.time - second.time);
}

function formatMarketPrice(price: number) {
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 10 }).format(price);
}

function buildTradeSummary(plan: TradePlan, message: string, tradingParams: Record<string, string>, market: string): TradeSummary {
  const parameterBalance = Number(tradingParams.accountBalance);
  const messageBalance = message.match(/\$\s*([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g, "");
  const balance = Number.isFinite(parameterBalance) && parameterBalance > 0
    ? parameterBalance
    : Number(messageBalance) || 0;
  const explicitRisk = Number(tradingParams.riskAmount);
  const messageRisk = message.match(/\brisk(?:\s+(?:amount|of|is))?\s*\$\s*([\d,]+(?:\.\d+)?)/i)?.[1]?.replace(/,/g, "");
  const riskPercentText = message.match(/(?:risk[^\d%]{0,12}|)(\d+(?:\.\d+)?)\s*%\s*risk|risk[^\d%]{0,12}(\d+(?:\.\d+)?)\s*%/i);
  const requestedPercent = Number(riskPercentText?.[1] ?? riskPercentText?.[2]);
  const risk = Number.isFinite(explicitRisk) && explicitRisk > 0
    ? explicitRisk
    : Number(messageRisk) > 0
      ? Number(messageRisk)
      : balance > 0
        ? balance * (Number.isFinite(requestedPercent) && requestedPercent > 0 ? requestedPercent : 1) / 100
        : 0;
  const stopDistance = plan.entry !== null && plan.stopLoss !== null ? Math.abs(plan.entry - plan.stopLoss) : 0;
  const targetDistance = plan.entry !== null && plan.takeProfit !== null ? Math.abs(plan.takeProfit - plan.entry) : 0;
  const riskPercentage = balance > 0 ? risk / balance * 100 : 0;
  let size = "Not calculated";
  let estimatedProfit = "Not calculated";

  if (plan.direction !== "wait" && stopDistance > 0 && risk > 0) {
    if (market === "forex") {
      const contractValue = Number(tradingParams.valuePerPriceUnitPerLot);
      if (Number.isFinite(contractValue) && contractValue > 0) {
        const lots = risk / (stopDistance * contractValue);
        size = `${lots.toFixed(2)} lots`;
        estimatedProfit = `$${(lots * targetDistance * contractValue).toFixed(2)}`;
      } else {
        size = "Needs broker pip/contract value";
      }
    } else {
      const units = risk / stopDistance;
      size = `${units.toFixed(8)} ${market === "stocks" ? "shares" : "units"}`;
      estimatedProfit = `$${(units * targetDistance).toFixed(2)} before fees/slippage`;
    }
  }

  const rewardRisk = plan.rewardRisk ?? (stopDistance > 0 ? targetDistance / stopDistance : 0);
  return {
    balance: balance > 0 ? `$${balance.toFixed(2)}` : "Not provided",
    risk: risk > 0 ? `$${risk.toFixed(2)}${Number.isFinite(requestedPercent) ? ` (${riskPercentage.toFixed(2)}%)` : balance > 0 && !tradingParams.riskAmount && !messageRisk ? ` (${riskPercentage.toFixed(2)}%, 1% default)` : ` (${riskPercentage.toFixed(2)}%)`}` : "Not calculated",
    maxLoss: risk > 0 ? `$${risk.toFixed(2)}` : "Not calculated",
    size,
    leverage: market === "crypto" || market === "stocks" ? "1× spot/cash (no leverage assumed)" : "Not specified; depends on broker",
    rewardRisk: rewardRisk > 0 ? `1:${rewardRisk.toFixed(2)}` : "Not available",
    estimatedProfit,
    highRisk: balance > 0 && riskPercentage > 10,
  };
}

function deriveSupportResistance(candles: ChartData[]): PriceLevel[] {
  const recent = candles.slice(-200);
  if (recent.length < 5) return [];

  const currentPrice = recent[recent.length - 1].close;
  const candidates: { kind: "support" | "resistance"; price: number; touches: number }[] = [];
  const tolerance = Math.max((Math.max(...recent.map((candle) => candle.high)) - Math.min(...recent.map((candle) => candle.low))) * 0.004, currentPrice * 0.0005);

  const addCandidate = (kind: "support" | "resistance", price: number) => {
    const cluster = candidates.find((candidate) => candidate.kind === kind && Math.abs(candidate.price - price) <= tolerance);
    if (cluster) {
      cluster.price = (cluster.price * cluster.touches + price) / (cluster.touches + 1);
      cluster.touches += 1;
    } else {
      candidates.push({ kind, price, touches: 1 });
    }
  };

  for (let index = 2; index < recent.length - 2; index += 1) {
    const window = recent.slice(index - 2, index + 3);
    if (recent[index].low === Math.min(...window.map((candle) => candle.low))) addCandidate("support", recent[index].low);
    if (recent[index].high === Math.max(...window.map((candle) => candle.high))) addCandidate("resistance", recent[index].high);
  }

  const result: PriceLevel[] = [];
  for (const kind of ["support", "resistance"] as const) {
    const side = candidates
      .filter((candidate) => candidate.kind === kind && (kind === "support" ? candidate.price <= currentPrice : candidate.price >= currentPrice))
      .sort((first, second) => second.touches - first.touches || Math.abs(first.price - currentPrice) - Math.abs(second.price - currentPrice))
      .slice(0, 1);
    if (side.length) result.push(...side.map(({ kind: levelKind, price }) => ({ kind: levelKind, price })));
    else {
      const fallback = kind === "support"
        ? Math.min(...recent.map((candle) => candle.low))
        : Math.max(...recent.map((candle) => candle.high));
      result.push({ kind, price: fallback });
    }
  }
  return result;
}

function deriveChartStructure(candles: ChartData[], patternName: string): ChartStructure {
  const recent = candles.slice(-160);
  const pivots: { time: number; price: number; kind: "high" | "low" }[] = [];
  for (let index = 2; index < recent.length - 2; index += 1) {
    const window = recent.slice(index - 2, index + 3);
    if (recent[index].high === Math.max(...window.map((candle) => candle.high))) {
      pivots.push({ time: recent[index].time, price: recent[index].high, kind: "high" });
    }
    if (recent[index].low === Math.min(...window.map((candle) => candle.low))) {
      pivots.push({ time: recent[index].time, price: recent[index].low, kind: "low" });
    }
  }
  pivots.sort((first, second) => first.time - second.time);
  const swings = pivots.reduce<typeof pivots>((result, point) => {
    const previous = result[result.length - 1];
    if (!previous || previous.kind !== point.kind) result.push(point);
    else if ((point.kind === "high" && point.price > previous.price) || (point.kind === "low" && point.price < previous.price)) result[result.length - 1] = point;
    return result;
  }, []);
  const swingHighs = swings.filter((point) => point.kind === "high");
  const swingLows = swings.filter((point) => point.kind === "low");
  const markers: StructureMarker[] = [];
  const previousHigh = swingHighs.at(-2);
  const latestHigh = swingHighs.at(-1);
  if (previousHigh && latestHigh && latestHigh.price > previousHigh.price) markers.push({ ...latestHigh, kind: "higherHigh" });
  const previousLow = swingLows.at(-2);
  const latestLow = swingLows.at(-1);
  if (previousLow && latestLow && latestLow.price < previousLow.price) markers.push({ ...latestLow, kind: "lowerLow" });
  const latestPivot = swings.at(-1);
  if (latestPivot && recent.at(-1)!.time - latestPivot.time <= 20 * (recent.at(-1)!.time - recent.at(-2)!.time)) {
    markers.push({ ...latestPivot, kind: "reverse" });
  }

  const direction = recent.length > 1 && recent.at(-1)!.close >= recent[0].close ? "up" : "down";
  const trendAnchors = direction === "up" ? swingLows.slice(-2) : swingHighs.slice(-2);
  const trendline = trendAnchors.length === 2
    ? trendAnchors.map(({ time, price }) => ({ time, price }))
    : [];

  const normalizedPattern = patternName.toLowerCase();
  let patternPivots: typeof swings = [];
  if (/head|shoulder/.test(normalizedPattern)) {
    patternPivots = swings.slice(-5);
  } else if (/double\s*top/.test(normalizedPattern) && swingHighs.length >= 2) {
    const firstTop = swingHighs.at(-2)!;
    const secondTop = swingHighs.at(-1)!;
    const neckline = swings.filter((point) => point.kind === "low" && point.time > firstTop.time && point.time < secondTop.time).sort((first, second) => first.price - second.price)[0];
    patternPivots = neckline ? [firstTop, neckline, secondTop] : [];
  } else if (/double\s*bottom/.test(normalizedPattern) && swingLows.length >= 2) {
    const firstBottom = swingLows.at(-2)!;
    const secondBottom = swingLows.at(-1)!;
    const peak = swings.filter((point) => point.kind === "high" && point.time > firstBottom.time && point.time < secondBottom.time).sort((first, second) => second.price - first.price)[0];
    patternPivots = peak ? [firstBottom, peak, secondBottom] : [];
  } else if (/triangle|flag/.test(normalizedPattern)) {
    patternPivots = swings.slice(-6);
  }

  return {
    markers,
    trendline,
    patternOutline: patternPivots.map(({ time, price }) => ({ time, price })),
  };
}

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ ...chatGreeting }]);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [chatHistoryReady, setChatHistoryReady] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const activeChatIdRef = useRef("");
  const [chatInput, setChatInput] = useState("");
  const [cryptoData, setCryptoData] = useState<CryptoData[]>([]);
  const [allCryptoData, setAllCryptoData] = useState<CryptoData[]>([]);
  const [forexData, setForexData] = useState<any[]>([]);
  const [stocksData, setStocksData] = useState<any[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState("bitcoin");
  const [selectedForex, setSelectedForex] = useState("eurusd");
  const [selectedStock, setSelectedStock] = useState("aapl");
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartDataKey, setChartDataKey] = useState("");
  const chartDataKeyRef = useRef("");
  const olderRequestRef = useRef(false);
  const signalAnalysisKeyRef = useRef("");
  const previousAlertPriceRef = useRef<{ assetKey: string; price: number } | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [chartError, setChartError] = useState("");
  const [latestMarketPrice, setLatestMarketPrice] = useState<number | null>(null);
  const [autoLevels, setAutoLevels] = useState<PriceLevel[]>([]);
  const [aiLevels, setAiLevels] = useState<PriceLevel[]>([]);
  const [marketSignals, setMarketSignals] = useState<MarketSignal[]>([]);
  const [marketTradePlan, setMarketTradePlan] = useState<TradePlan | null>(null);
  const [marketIndicators, setMarketIndicators] = useState<IndicatorSummary | null>(null);
  const [marketExplanation, setMarketExplanation] = useState("");
  const [marketPattern, setMarketPattern] = useState("Not clear");
  const [marketAnalysisKey, setMarketAnalysisKey] = useState("");
  const [marketAnalysisData, setMarketAnalysisData] = useState<MarketAnalysisResult | null>(null);
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);
  const [priceAlertInput, setPriceAlertInput] = useState("");
  const [priceAlertDirection, setPriceAlertDirection] = useState<"above" | "below">("above");
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertNotification, setAlertNotification] = useState("");
  const [timeframe, setTimeframe] = useState("1");
  const [cryptoNews, setCryptoNews] = useState<NewsItem[]>([]);
  const [forexNews, setForexNews] = useState<NewsItem[]>([]);
  const [stocksNews, setStocksNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [forexSearchQuery, setForexSearchQuery] = useState("");
  const [stocksSearchQuery, setStocksSearchQuery] = useState("");
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedTradeMessage, setCopiedTradeMessage] = useState<number | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [showTradingParams, setShowTradingParams] = useState(false);
  const [tradingParams, setTradingParams] = useState({
    accountBalance: "",
    riskAmount: "",
    targetProfit: "",
    entryPrice: "",
    stopLossPrice: "",
    valuePerPriceUnitPerLot: "",
    sizeMode: "lots"
  });
  const [activeTab, setActiveTab] = useState("crypto");
  const selectedCryptoInstrument = allCryptoData.find((coin) => coin.id === selectedCrypto) ?? cryptoData.find((coin) => coin.id === selectedCrypto);
  const selectedForexInstrument = forexData.find((forex) => forex.id === selectedForex);
  const selectedStockInstrument = stocksData.find((stock) => stock.id === selectedStock);
  const selectedMarketSymbol = activeTab === "crypto"
    ? selectedCryptoInstrument?.symbol ? `${selectedCryptoInstrument.symbol.toUpperCase()}-USD` : ""
    : activeTab === "forex"
      ? selectedForexInstrument?.symbol ? `${selectedForexInstrument.symbol.replace("/", "").toUpperCase()}=X` : ""
      : activeTab === "stocks"
        ? selectedStockInstrument?.symbol?.toUpperCase() ?? ""
        : "";
  const selectedMarketLabel = activeTab === "crypto"
    ? selectedCryptoInstrument?.name ?? selectedCrypto
    : activeTab === "forex"
      ? selectedForexInstrument?.symbol ?? selectedForex
      : activeTab === "stocks"
        ? selectedStockInstrument?.symbol ?? selectedStock
        : "Market";
  const selectedAssetKey = `${activeTab}:${selectedMarketSymbol}`;
        const selectedHistoryTimeframe = timeframe === "0.25" ? "15m" : timeframe === "1" ? "1h" : timeframe === "4" ? "4h" : timeframe === "24" ? "1d" : "max";
  const currentPrice = chartDataKey === `${activeTab}:${selectedMarketSymbol}:${selectedHistoryTimeframe}`
    ? latestMarketPrice ?? chartData[chartData.length - 1]?.close ?? null
    : null;
  const planLevels: PriceLevel[] = marketTradePlan?.direction !== "wait" && marketTradePlan
    ? [
        ...(marketTradePlan.entry !== null ? [{ kind: "entry" as const, price: marketTradePlan.entry, label: `Entry ${formatMarketPrice(marketTradePlan.entry)}` }] : []),
        ...(marketTradePlan.stopLoss !== null ? [{ kind: "stopLoss" as const, price: marketTradePlan.stopLoss, label: `Stop Loss ${formatMarketPrice(marketTradePlan.stopLoss)}` }] : []),
        ...(marketTradePlan.takeProfit !== null ? [{ kind: "takeProfit" as const, price: marketTradePlan.takeProfit, label: `Take Profit ${formatMarketPrice(marketTradePlan.takeProfit)}` }] : []),
      ]
    : [];
  const displayedChartLevels: PriceLevel[] = [
    ...(aiLevels.length ? aiLevels : autoLevels),
    ...planLevels,
  ];
  const chartStructure = deriveChartStructure(chartData, marketPattern);
  const entryDecision = marketTradePlan?.direction !== "wait"
    ? "Yes"
    : marketTradePlan?.qualityScore !== null && marketTradePlan?.qualityScore !== undefined && marketTradePlan.qualityScore < 80
      ? "No"
      : "Wait";

  useEffect(() => {
    let sessions: ChatSession[] = [];
    try {
      const stored = localStorage.getItem(chatHistoryStorageKey);
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed)) {
        sessions = parsed.flatMap((session): ChatSession[] => {
          if (!session || typeof session.id !== "string" || !Array.isArray(session.messages)) return [];
          const messages = session.messages.filter((message: unknown): message is ChatMessage =>
            message !== null
            && typeof message === "object"
            && "role" in message
            && (message.role === "user" || message.role === "assistant")
            && "content" in message
            && typeof message.content === "string"
          );
          return [{
            id: session.id,
            title: typeof session.title === "string" ? session.title : "New Chat",
            topic: typeof session.topic === "string" ? session.topic : "",
            updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
            messages: messages.length ? messages : [{ ...chatGreeting }],
          }];
        });
      }
    } catch {
      sessions = [];
    }

    let storedActiveId = "";
    try {
      storedActiveId = localStorage.getItem(`${chatHistoryStorageKey}:active`) ?? "";
    } catch {
      storedActiveId = "";
    }
    const activeSession = sessions.find((session) => session.id === storedActiveId) ?? sessions[0] ?? createChatSession();
    const history = sessions.length ? sessions : [activeSession];
    setChatHistory(history);
    setActiveChatId(activeSession.id);
    activeChatIdRef.current = activeSession.id;
    setChatMessages(activeSession.messages);
    setChatHistoryReady(true);
  }, []);

  useEffect(() => {
    if (!chatHistoryReady || !activeChatId) return;
    const existingSession = chatHistory.find((session) => session.id === activeChatId);
    const firstUserMessage = chatMessages.find((message) => message.role === "user");
    const session: ChatSession = {
      id: activeChatId,
      title: existingSession?.title && existingSession.title !== "New Chat"
        ? existingSession.title
        : firstUserMessage ? chatTitleFromMessage(firstUserMessage.content) : "New Chat",
      topic: existingSession?.topic ?? "",
      updatedAt: Date.now(),
      messages: chatMessages,
    };
    setChatHistory((previous) => [session, ...previous.filter((item) => item.id !== activeChatId)].sort((first, second) => second.updatedAt - first.updatedAt));
  }, [chatMessages, activeChatId, chatHistoryReady]);

  useEffect(() => {
    if (!chatHistoryReady || !activeChatId) return;
    saveChatHistory(chatHistory);
    try {
      localStorage.setItem(`${chatHistoryStorageKey}:active`, activeChatId);
    } catch {
      // Keep the active conversation in memory if storage is full or unavailable.
    }
  }, [chatHistory, activeChatId, chatHistoryReady]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Fetch crypto prices from CoinGecko
  useEffect(() => {
    const fetchCryptoData = async () => {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h"
        );
        const data = await response.json();
        setCryptoData(data.slice(0, 10)); // Show top 10 in watchlist
        setAllCryptoData(data); // Store all for search
        setLoading(false);
      } catch (error) {
        console.error("Error fetching crypto data:", error);
        // Use mock data if API fails
        const mockCryptoData: CryptoData[] = [
          { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 67234.50, price_change_percentage_24h: 2.34 },
          { id: "ethereum", symbol: "eth", name: "Ethereum", current_price: 3456.78, price_change_percentage_24h: 1.87 },
          { id: "solana", symbol: "sol", name: "Solana", current_price: 178.90, price_change_percentage_24h: -0.45 },
          { id: "ripple", symbol: "xrp", name: "XRP", current_price: 0.5234, price_change_percentage_24h: 0.12 },
          { id: "cardano", symbol: "ada", name: "Cardano", current_price: 0.4523, price_change_percentage_24h: -0.23 },
          { id: "dogecoin", symbol: "doge", name: "Dogecoin", current_price: 0.1234, price_change_percentage_24h: 1.56 },
          { id: "polkadot", symbol: "dot", name: "Polkadot", current_price: 7.89, price_change_percentage_24h: 0.34 },
          { id: "avalanche", symbol: "avax", name: "Avalanche", current_price: 35.67, price_change_percentage_24h: 2.12 },
          { id: "chainlink", symbol: "link", name: "Chainlink", current_price: 14.56, price_change_percentage_24h: -0.78 },
          { id: "polygon", symbol: "matic", name: "Polygon", current_price: 0.5678, price_change_percentage_24h: 0.45 },
        ];
        
        setCryptoData(mockCryptoData.slice(0, 10));
        setAllCryptoData(mockCryptoData);
        setLoading(false);
      }
    };

    fetchCryptoData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchCryptoData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch chart data for selected asset
  useEffect(() => {
    if (activeTab === "news" || activeTab === "workspace") {
      chartDataKeyRef.current = "";
      setChartData([]);
      setChartDataKey("");
      setLatestMarketPrice(null);
      setHasMoreHistory(false);
      return;
    }
    if (!selectedMarketSymbol) return;

    const requestKey = `${activeTab}:${selectedMarketSymbol}:${selectedHistoryTimeframe}`;
    chartDataKeyRef.current = requestKey;
    setChartDataKey(requestKey);
    setChartData([]);
    setLatestMarketPrice(null);
    setHasMoreHistory(false);
    setChartError("");
    setAiLevels([]);
    setMarketSignals([]);
    setMarketTradePlan(null);
    setMarketIndicators(null);
    setMarketExplanation("");
    setMarketPattern("Not clear");
    setMarketAnalysisKey("");
    setMarketAnalysisData(null);
    signalAnalysisKeyRef.current = "";
    let active = true;
    let historyRequestPending = false;
    let quoteRequestPending = false;

    const loadHistory = async (before?: number, replace = false) => {
      if (historyRequestPending) return;
      historyRequestPending = true;
      try {
        const query = new URLSearchParams({ market: activeTab, symbol: selectedMarketSymbol, timeframe: selectedHistoryTimeframe });
        if (before !== undefined) query.set("before", String(before));
        const response = await fetch(`/api/market/history?${query}`);
        const result = await response.json() as {
          error?: string;
          candles?: ChartData[];
          hasMore?: boolean;
          quote?: { price?: number | null };
        };
        if (!response.ok) throw new Error(result.error || `Chart request failed: ${response.status}`);
        if (!active || chartDataKeyRef.current !== requestKey) return;

        const incoming = result.candles ?? [];
        setChartData((current) => replace ? mergeCandles([], incoming) : mergeCandles(current, incoming));
        setHasMoreHistory(Boolean(result.hasMore));
        if (typeof result.quote?.price === "number") setLatestMarketPrice(result.quote.price);
        setChartError("");
      } catch (error) {
        if (active) {
          console.error("Error fetching chart data:", error);
          setChartError(error instanceof Error ? error.message : "Unable to load chart history.");
        }
      } finally {
        historyRequestPending = false;
      }
    };

    const refreshQuote = async () => {
      if (quoteRequestPending) return;
      quoteRequestPending = true;
      try {
        const query = new URLSearchParams({ market: activeTab, symbol: selectedMarketSymbol, timeframe: selectedHistoryTimeframe, quoteOnly: "1" });
        const response = await fetch(`/api/market/history?${query}`);
        if (!response.ok) return;
        const result = await response.json() as { quote?: { price?: number | null } };
        if (active && chartDataKeyRef.current === requestKey && typeof result.quote?.price === "number") {
          setLatestMarketPrice(result.quote.price);
        }
      } catch {
        // Keep the last known quote if the provider is temporarily unavailable.
      } finally {
        quoteRequestPending = false;
      }
    };

    void loadHistory(undefined, true);
    const refreshInterval = window.setInterval(() => void loadHistory(), selectedHistoryTimeframe === "max" ? 300000 : 60000);
    const quoteInterval = window.setInterval(() => void refreshQuote(), 30000);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.clearInterval(quoteInterval);
    };
  }, [activeTab, selectedMarketSymbol, selectedHistoryTimeframe]);

  useEffect(() => {
    setAutoLevels(deriveSupportResistance(chartData));
  }, [chartData]);

  useEffect(() => {
    const latestCandle = chartData[chartData.length - 1];
    if (!latestCandle || chartData.length < 20 || !chartDataKey) return;

    const analysisKey = `${chartDataKey}:${latestCandle.time}`;
    if (signalAnalysisKeyRef.current === analysisKey) return;
    signalAnalysisKeyRef.current = analysisKey;
    let active = true;

    const analyzeCandles = async () => {
      try {
        const response = await fetch("/api/market/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: selectedMarketSymbol, timeframe: selectedHistoryTimeframe, candles: chartData.slice(-150) }),
        });
        if (!response.ok) return;
        const result = await response.json() as {
          levels?: { support?: number[]; resistance?: number[] };
          signals?: MarketSignal[];
          indicators?: IndicatorSummary;
          pattern?: string;
          tradePlan?: TradePlan;
          explanation?: string;
        };
        if (!active) return;
        const fallbackLevels = deriveSupportResistance(chartData);
        const analyzedSupport = result.levels?.support ?? [];
        const analyzedResistance = result.levels?.resistance ?? [];
        setAiLevels([
          ...(analyzedSupport.length ? analyzedSupport : fallbackLevels.filter((level) => level.kind === "support").map((level) => level.price)).map((price) => ({ kind: "support" as const, price })),
          ...(analyzedResistance.length ? analyzedResistance : fallbackLevels.filter((level) => level.kind === "resistance").map((level) => level.price)).map((price) => ({ kind: "resistance" as const, price })),
        ]);
        setMarketSignals(result.signals ?? []);
        setMarketTradePlan(result.tradePlan ?? null);
        setMarketIndicators(result.indicators ?? null);
        setMarketExplanation(result.explanation ?? "");
        setMarketPattern(result.pattern ?? "Not clear");
        setMarketAnalysisKey(analysisKey);
        setMarketAnalysisData(result);
      } catch (error) {
        console.error("Error analyzing chart signals:", error);
      }
    };

    void analyzeCandles();
    return () => {
      active = false;
    };
  }, [chartData, chartDataKey, selectedMarketSymbol, selectedHistoryTimeframe]);

  useEffect(() => {
    if (currentPrice === null || !Number.isFinite(currentPrice)) return;
    const previous = previousAlertPriceRef.current;
    if (!previous || previous.assetKey !== selectedAssetKey) {
      previousAlertPriceRef.current = { assetKey: selectedAssetKey, price: currentPrice };
      const alreadyReached = priceAlerts.find((alert) => alert.assetKey === selectedAssetKey && (
        alert.direction === "above" ? currentPrice >= alert.target : currentPrice <= alert.target
      ));
      if (alreadyReached) {
        setAlertNotification(`${alreadyReached.assetLabel} is already ${alreadyReached.direction} ${formatMarketPrice(alreadyReached.target)}. Current price: ${formatMarketPrice(currentPrice)}.`);
        setPriceAlerts((alerts) => alerts.filter((alert) => alert.id !== alreadyReached.id));
      }
      return;
    }

    const triggered = priceAlerts.find((alert) => alert.assetKey === selectedAssetKey && (
      alert.direction === "above"
        ? previous.price < alert.target && currentPrice >= alert.target
        : previous.price > alert.target && currentPrice <= alert.target
    ));
    previousAlertPriceRef.current = { assetKey: selectedAssetKey, price: currentPrice };

    if (triggered) {
      setAlertNotification(`${triggered.assetLabel} reached ${triggered.direction} ${formatMarketPrice(triggered.target)}. Current price: ${formatMarketPrice(currentPrice)}.`);
      setPriceAlerts((alerts) => alerts.filter((alert) => alert.id !== triggered.id));
    }
  }, [currentPrice, priceAlerts, selectedAssetKey]);

  const loadOlderHistory = async () => {
    const oldestCandle = chartData[0];
    if (!oldestCandle || !hasMoreHistory || loadingOlder || olderRequestRef.current || !selectedMarketSymbol) return;

    const requestKey = chartDataKey;
    olderRequestRef.current = true;
    setLoadingOlder(true);
    try {
      const query = new URLSearchParams({
        market: activeTab,
        symbol: selectedMarketSymbol,
        timeframe: selectedHistoryTimeframe,
        before: String(oldestCandle.time),
      });
      const response = await fetch(`/api/market/history?${query}`);
      const result = await response.json() as {
        error?: string;
        candles?: ChartData[];
        hasMore?: boolean;
        quote?: { price?: number | null };
      };
      if (!response.ok) throw new Error(result.error || `Older history request failed: ${response.status}`);
      if (chartDataKeyRef.current !== requestKey) return;

      const olderCandles = result.candles ?? [];
      setChartData((current) => mergeCandles(current, olderCandles));
      setHasMoreHistory(Boolean(result.hasMore) && olderCandles.length > 0);
      if (typeof result.quote?.price === "number") setLatestMarketPrice(result.quote.price);
    } catch (error) {
      console.error("Error loading older candles:", error);
    } finally {
      olderRequestRef.current = false;
      setLoadingOlder(false);
    }
  };

  const handleCreatePriceAlert = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = Number(priceAlertInput);
    if (!selectedMarketSymbol || !Number.isFinite(target) || target <= 0) return;

    const alert: PriceAlert = {
      id: Date.now(),
      assetKey: selectedAssetKey,
      assetLabel: selectedMarketLabel,
      target,
      direction: priceAlertDirection,
    };
    const alreadyReached = currentPrice !== null && (
      alert.direction === "above" ? currentPrice >= target : currentPrice <= target
    );

    if (alreadyReached && currentPrice !== null) {
      setAlertNotification(`${alert.assetLabel} is already ${alert.direction} ${formatMarketPrice(target)}. Current price: ${formatMarketPrice(currentPrice)}.`);
    } else {
      setPriceAlerts((alerts) => [...alerts, alert]);
    }
    setPriceAlertInput("");
  };

  // Fetch crypto news
  useEffect(() => {
    const fetchCryptoNews = async () => {
      try {
        const mockNews: NewsItem[] = [
          { title: "Bitcoin Surges Past $67K as Institutional Interest Grows", time: "2 hours ago", category: "Crypto" },
          { title: "Ethereum 2.0 Upgrade Successfully Completed", time: "5 hours ago", category: "Crypto" },
          { title: "DeFi TVL Hits New All-Time High of $100B", time: "8 hours ago", category: "Crypto" },
          { title: "Solana Network Activity Reaches Record Levels", time: "12 hours ago", category: "Crypto" },
          { title: "Major Exchange Announces New Crypto Listing", time: "15 hours ago", category: "Crypto" },
          { title: "Crypto Regulation Bill Advances in Congress", time: "18 hours ago", category: "Crypto" },
        ];
        setCryptoNews(mockNews);
      } catch (error) {
        console.error("Error fetching crypto news:", error);
      }
    };

    const fetchForexNews = async () => {
      try {
        const mockNews: NewsItem[] = [
          { title: "Fed Signals Potential Rate Cuts in Coming Months", time: "3 hours ago", category: "Forex" },
          { title: "EUR/USD Reaches 6-Month High Amid Eurozone Recovery", time: "6 hours ago", category: "Forex" },
          { title: "Bank of Japan Maintains Ultra-Low Rate Policy", time: "10 hours ago", category: "Forex" },
          { title: "GBP Strengthens on Positive UK Economic Data", time: "12 hours ago", category: "Forex" },
          { title: "USD Index Drops as Risk Appetite Improves", time: "15 hours ago", category: "Forex" },
          { title: "ECB Holds Rates Steady, Signals Future Cuts", time: "18 hours ago", category: "Forex" },
        ];
        setForexNews(mockNews);
      } catch (error) {
        console.error("Error fetching forex news:", error);
      }
    };

    const fetchStocksNews = async () => {
      try {
        const mockNews: NewsItem[] = [
          { title: "Tech Stocks Rally as AI Investments Surge", time: "1 hour ago", category: "Stocks" },
          { title: "Apple Reports Strong Quarterly Earnings", time: "4 hours ago", category: "Stocks" },
          { title: "Tesla Announces New Battery Technology", time: "7 hours ago", category: "Stocks" },
          { title: "S&P 500 Reaches New All-Time High", time: "9 hours ago", category: "Stocks" },
          { title: "Amazon Expands Cloud Computing Services", time: "11 hours ago", category: "Stocks" },
          { title: "Microsoft AI Integration Drives Growth", time: "14 hours ago", category: "Stocks" },
        ];
        setStocksNews(mockNews);
      } catch (error) {
        console.error("Error fetching stocks news:", error);
      }
    };

    // Initialize mock forex and stocks data
    const mockForexData: any[] = [
      { id: "eurusd", symbol: "EUR/USD", name: "Euro/US Dollar", price: "1.0876", change: "+0.08%", positive: true },
      { id: "gbpusd", symbol: "GBP/USD", name: "British Pound/USD", price: "1.2654", change: "-0.12%", positive: false },
      { id: "usdjpy", symbol: "USD/JPY", name: "US Dollar/Yen", price: "149.87", change: "+0.23%", positive: true },
      { id: "audusd", symbol: "AUD/USD", name: "Australian Dollar/USD", price: "0.6543", change: "-0.05%", positive: false },
      { id: "usdchf", symbol: "USD/CHF", name: "US Dollar/Swiss Franc", price: "0.8756", change: "+0.15%", positive: true },
      { id: "usdcad", symbol: "USD/CAD", name: "US Dollar/Canadian Dollar", price: "1.3542", change: "-0.08%", positive: false },
      { id: "eurjpy", symbol: "EUR/JPY", name: "Euro/Japanese Yen", price: "162.87", change: "+0.31%", positive: true },
      { id: "gbpjpy", symbol: "GBP/JPY", name: "British Pound/Yen", price: "189.65", change: "+0.11%", positive: true },
      { id: "eurgbp", symbol: "EUR/GBP", name: "Euro/British Pound", price: "0.8592", change: "-0.04%", positive: false },
      { id: "eurchf", symbol: "EUR/CHF", name: "Euro/Swiss Franc", price: "0.9534", change: "+0.07%", positive: true },
      { id: "euraud", symbol: "EUR/AUD", name: "Euro/Australian Dollar", price: "1.6623", change: "+0.13%", positive: true },
      { id: "gbpchf", symbol: "GBP/CHF", name: "British Pound/Swiss Franc", price: "1.1089", change: "-0.02%", positive: false },
      { id: "gbpaud", symbol: "GBP/AUD", name: "British Pound/Australian Dollar", price: "1.9334", change: "-0.06%", positive: false },
      { id: "audjpy", symbol: "AUD/JPY", name: "Australian Dollar/Yen", price: "98.23", change: "+0.18%", positive: true },
      { id: "audchf", symbol: "AUD/CHF", name: "Australian Dollar/Swiss Franc", price: "0.5687", change: "+0.05%", positive: true },
      { id: "nzdusd", symbol: "NZD/USD", name: "New Zealand Dollar/USD", price: "0.6123", change: "-0.09%", positive: false },
      { id: "usdnzd", symbol: "USD/NZD", name: "US Dollar/New Zealand Dollar", price: "1.6334", change: "+0.09%", positive: true },
      { id: "eurcad", symbol: "EUR/CAD", name: "Euro/Canadian Dollar", price: "1.4723", change: "-0.03%", positive: false },
      { id: "gbpcad", symbol: "GBP/CAD", name: "British Pound/Canadian Dollar", price: "1.7145", change: "-0.15%", positive: false },
      { id: "cadjpy", symbol: "CAD/JPY", name: "Canadian Dollar/Yen", price: "110.67", change: "+0.25%", positive: true },
      { id: "chfjpy", symbol: "CHF/JPY", name: "Swiss Franc/Yen", price: "171.23", change: "+0.08%", positive: true },
    ];

    const mockStocksData: any[] = [
      { id: "aapl", symbol: "AAPL", name: "Apple Inc.", price: "$178.50", change: "+1.25%", positive: true },
      { id: "tsla", symbol: "TSLA", name: "Tesla Inc.", price: "$245.30", change: "-0.87%", positive: false },
      { id: "googl", symbol: "GOOGL", name: "Alphabet Inc.", price: "$141.20", change: "+0.45%", positive: true },
      { id: "msft", symbol: "MSFT", name: "Microsoft Corp.", price: "$378.90", change: "+0.92%", positive: true },
      { id: "amzn", symbol: "AMZN", name: "Amazon.com Inc.", price: "$178.25", change: "+0.67%", positive: true },
      { id: "meta", symbol: "META", name: "Meta Platforms Inc.", price: "$505.30", change: "+1.12%", positive: true },
      { id: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", price: "$875.40", change: "+2.34%", positive: true },
      { id: "jpm", symbol: "JPM", name: "JPMorgan Chase & Co.", price: "$198.50", change: "+0.45%", positive: true },
      { id: "v", symbol: "V", name: "Visa Inc.", price: "$275.80", change: "+0.32%", positive: true },
      { id: "jnj", symbol: "JNJ", name: "Johnson & Johnson", price: "$156.30", change: "-0.15%", positive: false },
      { id: "wmt", symbol: "WMT", name: "Walmart Inc.", price: "$165.20", change: "+0.28%", positive: true },
      { id: "pg", symbol: "PG", name: "Procter & Gamble", price: "$158.90", change: "+0.18%", positive: true },
      { id: "xom", symbol: "XOM", name: "Exxon Mobil Corp.", price: "$104.50", change: "-0.45%", positive: false },
      { id: "bac", symbol: "BAC", name: "Bank of America Corp.", price: "$38.75", change: "+0.67%", positive: true },
      { id: "intc", symbol: "INTC", name: "Intel Corp.", price: "$34.20", change: "-0.23%", positive: false },
    ];

    setForexData(mockForexData);
    setStocksData(mockStocksData);
    fetchCryptoNews();
    fetchForexNews();
    fetchStocksNews();
  }, []);

  const cryptoWatchlist = cryptoData.map((crypto: any) => ({
    id: crypto.id,
    symbol: `${crypto.symbol.toUpperCase()}/USD`,
    name: crypto.name,
    price: `$${crypto.current_price.toLocaleString()}`,
    change: `${(crypto.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}${(crypto.price_change_percentage_24h ?? 0).toFixed(2)}%`,
    positive: (crypto.price_change_percentage_24h ?? 0) >= 0
  }));

  // Filtered search results
  const filteredCrypto = allCryptoData.filter((crypto: any) => 
    crypto.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    crypto.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 20).map((crypto: any) => ({
    id: crypto.id,
    symbol: `${crypto.symbol.toUpperCase()}/USD`,
    name: crypto.name,
    price: `$${crypto.current_price.toLocaleString()}`,
    change: `${(crypto.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}${(crypto.price_change_percentage_24h ?? 0).toFixed(2)}%`,
    positive: (crypto.price_change_percentage_24h ?? 0) >= 0
  }));

  const filteredForex = forexData.filter((forex: any) => 
    forex.name.toLowerCase().includes(forexSearchQuery.toLowerCase()) ||
    forex.symbol.toLowerCase().includes(forexSearchQuery.toLowerCase())
  );

  const filteredStocks = stocksData.filter((stock: any) => 
    stock.name.toLowerCase().includes(stocksSearchQuery.toLowerCase()) ||
    stock.symbol.toLowerCase().includes(stocksSearchQuery.toLowerCase())
  );

  const forexWatchlist = forexData.map((forex: any) => ({
    id: forex.id,
    symbol: forex.symbol,
    name: forex.name,
    price: forex.price,
    change: forex.change,
    positive: forex.positive
  }));

  const stocksWatchlist = stocksData.map((stock: any) => ({
    id: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    change: stock.change,
    positive: stock.positive
  }));

  const findMentionedAsset = (message: string): MentionedAsset | null => {
    const crypto = allCryptoData.find((coin) => mentionedAssetTopic(message, coin.name, coin.symbol));
    if (crypto) return { topic: `crypto:${crypto.id}`, market: "crypto", symbol: `${crypto.symbol.toUpperCase()}-USD`, label: crypto.name, id: crypto.id };
    const forex = forexData.find((pair: any) => mentionedAssetTopic(message, pair.name, pair.symbol));
    if (forex) return { topic: `forex:${forex.id}`, market: "forex", symbol: `${forex.symbol.replace("/", "").toUpperCase()}=X`, label: forex.name, id: forex.id };
    const stock = stocksData.find((company: any) => mentionedAssetTopic(message, company.name, company.symbol));
    if (stock) return { topic: `stocks:${stock.id}`, market: "stocks", symbol: stock.symbol.toUpperCase(), label: stock.name, id: stock.id };
    return null;
  };

  const findMessageTopic = (message: string) => findMentionedAsset(message)?.topic ?? null;

  const startNewChat = (topic = "") => {
    const session = createChatSession(topic);
    activeChatIdRef.current = session.id;
    setChatHistory((sessions) => [session, ...sessions]);
    setActiveChatId(session.id);
    setChatMessages(session.messages);
    setChatHistoryOpen(false);
    setChatInput("");
    setUploadedImage(null);
  };

  const selectChat = (session: ChatSession) => {
    activeChatIdRef.current = session.id;
    setActiveChatId(session.id);
    setChatMessages(session.messages);
    setChatHistoryOpen(false);
    setChatInput("");
    setUploadedImage(null);
  };

  const appendChatMessage = (sessionId: string, message: ChatMessage, topic?: string) => {
    setChatHistory((sessions) => {
      const existing = sessions.find((session) => session.id === sessionId);
      if (!existing) return sessions;
      const messages = [...existing.messages, message];
      const firstUserMessage = messages.find((item) => item.role === "user");
      const updatedSession: ChatSession = {
        ...existing,
        title: existing.title === "New Chat" && firstUserMessage ? chatTitleFromMessage(firstUserMessage.content) : existing.title,
        topic: topic ?? existing.topic,
        updatedAt: Date.now(),
        messages,
      };
      return [updatedSession, ...sessions.filter((session) => session.id !== sessionId)].sort((first, second) => second.updatedAt - first.updatedAt);
    });
    if (activeChatIdRef.current === sessionId) setChatMessages((messages) => [...messages, message]);
  };

  const copyTradePlan = async (message: ChatMessage, index: number) => {
    if (!message.tradePlan || !message.tradeSummary || message.tradePlan.direction === "wait") return;
    const { tradePlan, tradeSummary } = message;
    const copyText = [
      `${tradePlan.direction.toUpperCase()} setup`,
      `Entry: ${tradePlan.entry === null ? "n/a" : formatMarketPrice(tradePlan.entry)}`,
      `Stop Loss: ${tradePlan.stopLoss === null ? "n/a" : formatMarketPrice(tradePlan.stopLoss)}`,
      `Take Profit: ${tradePlan.takeProfit === null ? "n/a" : formatMarketPrice(tradePlan.takeProfit)}`,
      `Position size: ${tradeSummary.size}`,
      `Leverage: ${tradeSummary.leverage}`,
      `Risk / maximum loss: ${tradeSummary.maxLoss}`,
      `Reward:risk: ${tradeSummary.rewardRisk}`,
      `Estimated reward before fees: ${tradeSummary.estimatedProfit}`,
      "Not guaranteed. Verify the values and order rules before trading.",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(copyText);
      setCopiedTradeMessage(index);
    } catch {
      setCopiedTradeMessage(null);
    }
  };


  const handleSendMessage = async () => {
    if ((!chatInput.trim() && !uploadedImage) || !chatHistoryReady || !activeChatId) return;

    const userMessage = chatInput.trim() || "Please analyze this chart";
    const currentSession = chatHistory.find((session) => session.id === activeChatId);
    const mentionedAsset = findMentionedAsset(userMessage);
    const requestedTopic = mentionedAsset?.topic ?? findMessageTopic(userMessage);
    const analysisRequest = isAnalysisRequest(userMessage);
    const topic = requestedTopic ?? currentSession?.topic ?? (analysisRequest ? selectedAssetKey : "");
    const hasPreviousUserMessage = chatMessages.some((message) => message.role === "user");
    const hasPreviousAnalysis = chatMessages.some((message) => message.role === "user" && isAnalysisRequest(message.content));
    const topicChanged = Boolean(currentSession?.topic && requestedTopic && currentSession.topic !== requestedTopic);
    const shouldStartNewChat = hasPreviousUserMessage && (
      topicChanged || (!isFollowUpQuestion(userMessage) && analysisRequest && hasPreviousAnalysis)
    );
    const previousMessages = shouldStartNewChat ? [{ ...chatGreeting }] : chatMessages;
    let targetChatId = activeChatId;

    if (shouldStartNewChat) {
      const session = createChatSession(topic);
      targetChatId = session.id;
      activeChatIdRef.current = session.id;
      setChatHistory((sessions) => [session, ...sessions]);
      setActiveChatId(session.id);
      setChatMessages(session.messages);
      setChatHistoryOpen(false);
    }

    const newMessage: ChatMessage = { role: "user", content: userMessage, language: detectChatLanguage(userMessage), image: uploadedImage };
    appendChatMessage(targetChatId, newMessage, topic);
    setChatInput("");
    setChatLoading(true);

    try {
      const analysisMarket = mentionedAsset?.market ?? activeTab;
      const analysisSymbol = mentionedAsset?.symbol ?? selectedMarketSymbol;
      const analysisLabel = mentionedAsset?.label ?? selectedMarketLabel;
      if (mentionedAsset) {
        setActiveTab(mentionedAsset.market);
        if (mentionedAsset.market === "crypto") setSelectedCrypto(mentionedAsset.id);
        else if (mentionedAsset.market === "forex") setSelectedForex(mentionedAsset.id);
        else setSelectedStock(mentionedAsset.id);
      }

      let analysisCandles = chartDataKey === `${analysisMarket}:${analysisSymbol}:${selectedHistoryTimeframe}` ? chartData : [];
      let analysisCurrentPrice = analysisMarket === activeTab && analysisSymbol === selectedMarketSymbol ? currentPrice : null;
      if (analysisRequest && !uploadedImage && analysisSymbol && analysisCandles.length < 20) {
        const query = new URLSearchParams({ market: analysisMarket, symbol: analysisSymbol, timeframe: selectedHistoryTimeframe });
        const historyResponse = await fetch(`/api/market/history?${query}`);
        const historyResult = await historyResponse.json() as { candles?: ChartData[]; quote?: { price?: number | null }; error?: string };
        if (historyResponse.ok) {
          analysisCandles = historyResult.candles ?? [];
          analysisCurrentPrice = historyResult.quote?.price ?? analysisCandles.at(-1)?.close ?? null;
        }
      }

      let automaticAnalysis: MarketAnalysisResult | null = null;
      if (analysisRequest && !uploadedImage && analysisCandles.length >= 20) {
        const latestAnalysisKey = `${analysisMarket}:${analysisSymbol}:${selectedHistoryTimeframe}:${analysisCandles.at(-1)?.time}`;
        if (marketAnalysisKey === latestAnalysisKey && marketAnalysisData) {
          automaticAnalysis = marketAnalysisData;
        } else {
          const analysisResponse = await fetch("/api/market/signals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: analysisSymbol, timeframe: selectedHistoryTimeframe, language: newMessage.language, candles: analysisCandles.slice(-150) }),
          });
          if (analysisResponse.ok) automaticAnalysis = await analysisResponse.json() as MarketAnalysisResult;
        }
        if (automaticAnalysis) {
          const analysisResult = automaticAnalysis;
          const fallbackLevels = deriveSupportResistance(analysisCandles);
          const analyzedSupport = analysisResult.levels?.support ?? [];
          const analyzedResistance = analysisResult.levels?.resistance ?? [];
          setAiLevels([
            ...(analyzedSupport.length ? analyzedSupport : fallbackLevels.filter((level) => level.kind === "support").map((level) => level.price)).map((price) => ({ kind: "support" as const, price })),
            ...(analyzedResistance.length ? analyzedResistance : fallbackLevels.filter((level) => level.kind === "resistance").map((level) => level.price)).map((price) => ({ kind: "resistance" as const, price })),
          ]);
          setMarketSignals(analysisResult.signals ?? []);
          setMarketIndicators(analysisResult.indicators ?? null);
          setMarketTradePlan(analysisResult.tradePlan ?? null);
          setMarketExplanation(analysisResult.explanation ?? "");
          setMarketPattern(analysisResult.pattern ?? "Not clear");
          setMarketAnalysisKey(latestAnalysisKey);
          setMarketAnalysisData(analysisResult);
        }
      }

      let marketContext = `Requested instrument: ${analysisLabel} (${analysisSymbol}). Market: ${analysisMarket}. Timeframe: ${selectedHistoryTimeframe}.`;
      if (analysisCurrentPrice !== null) marketContext += ` Current live price: ${analysisCurrentPrice}.`;
      const recentCandles = analysisCandles.slice(-150).map(({ time, open, high, low, close, volume }) =>
        `${time}:${open},${high},${low},${close},${volume}`
      );
      if (recentCandles.length) marketContext += ` Recent live OHLCV candles (Unix timestamp: open, high, low, close, volume): ${recentCandles.join(" | ")}.`;
      if (automaticAnalysis) marketContext += `\nValidated indicator analysis, support/resistance, and gated trade plan: ${JSON.stringify(automaticAnalysis)}. These values are grounded in supplied candles; do not replace a Wait result with a trade.`;

      const balanceFromMessage = userMessage.match(/\$\s*([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g, "") ?? "";
      const riskFromMessage = userMessage.match(/\brisk(?:\s+(?:amount|of|is))?\s*\$\s*([\d,]+(?:\.\d+)?)/i)?.[1]?.replace(/,/g, "") ?? "";
      const riskPercentMatch = userMessage.match(/risk[^\d%]{0,12}(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*risk/i);
      const riskPercent = Number(riskPercentMatch?.[1] ?? riskPercentMatch?.[2]);
      const accountBalance = tradingParams.accountBalance || balanceFromMessage;
      const defaultRiskAmount = Number(accountBalance) > 0
        ? String(Number(accountBalance) * (Number.isFinite(riskPercent) && riskPercent > 0 ? riskPercent : 1) / 100)
        : "";
      const validatedPlan = automaticAnalysis?.tradePlan;
      const analysisTradingParams = {
        ...tradingParams,
        accountBalance,
        riskAmount: tradingParams.riskAmount || riskFromMessage || defaultRiskAmount,
        targetProfit: tradingParams.targetProfit || (validatedPlan?.rewardRisk && defaultRiskAmount ? String(Number(defaultRiskAmount) * validatedPlan.rewardRisk) : ""),
        entryPrice: validatedPlan?.entry !== null && validatedPlan?.entry !== undefined ? String(validatedPlan.entry) : tradingParams.entryPrice,
        stopLossPrice: validatedPlan?.stopLoss !== null && validatedPlan?.stopLoss !== undefined ? String(validatedPlan.stopLoss) : tradingParams.stopLossPrice,
        sizeMode: analysisMarket === "forex" ? "lots" : "units",
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: previousMessages.filter((message) => message.role === "user" || message.role === "assistant").slice(-10).map(({ role, content }) => ({ role, content })),
          marketContext,
          image: uploadedImage,
          tradingParams: analysisRequest && !uploadedImage ? analysisTradingParams : showTradingParams ? tradingParams : null,
        }),
      });

      const data = await response.json();
      if (data.error) {
        appendChatMessage(targetChatId, { role: "assistant", content: `Error: ${data.error}. Please check your API key configuration.` });
      } else {
        const assistantMessage: ChatMessage = { role: "assistant", content: data.response, language: newMessage.language };
        if (automaticAnalysis?.tradePlan && automaticAnalysis.indicators) {
          assistantMessage.tradePlan = automaticAnalysis.tradePlan;
          assistantMessage.indicatorSummary = automaticAnalysis.indicators;
          assistantMessage.tradeSummary = buildTradeSummary(automaticAnalysis.tradePlan, userMessage, analysisTradingParams, analysisMarket);
          assistantMessage.analysisExplanation = automaticAnalysis.explanation ?? "";
          assistantMessage.chartPattern = automaticAnalysis.pattern ?? "Not clear";
        }
        if (data.chartMarkup && uploadedImage) {
          assistantMessage.chartMarkup = true;
          assistantMessage.image = uploadedImage;
          assistantMessage.annotations = data.annotations as ChartAnnotation[];
          assistantMessage.verdict = data.verdict as TradeVerdict;
          assistantMessage.riskReward = data.riskReward as RiskRewardSummary;
        }
        appendChatMessage(targetChatId, assistantMessage);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      appendChatMessage(targetChatId, { role: "assistant", content: "Sorry, I encountered an error processing your request. Please try again." });
    } finally {
      setChatLoading(false);
      if (activeChatIdRef.current === targetChatId) setUploadedImage(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 md:h-screen md:min-h-0">
      {/* Navigation Bar */}
      <nav className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">TS</span>
          </div>
          <h1 className="text-sm font-bold leading-tight text-white sm:text-xl">Trading Student Expert AI</h1>
        </div>
        <div className="hidden items-center gap-4 sm:flex">
          <button className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
            Dashboard
          </button>
          <button className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
            Portfolio
          </button>
          <button className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
            Settings
          </button>
          <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center">
            <span className="text-white text-sm">U</span>
          </div>
        </div>
      </nav>

      {alertNotification && (
        <div role="status" aria-live="polite" className="fixed right-4 top-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-green-700 bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl">
          <span className="text-green-400">Price alert</span>
          <span>{alertNotification}</span>
          <button type="button" aria-label="Dismiss price alert notification" onClick={() => setAlertNotification("")} className="ml-auto text-zinc-400 hover:text-white">×</button>
        </div>
      )}

      <div className="border-b border-zinc-800 bg-zinc-900/70 px-4 py-2 text-center text-xs text-zinc-300 sm:text-sm">
        100% Free for everyone. No hidden charges. No paid signals.
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
        {/* Left Sidebar - Watchlist */}
          <aside className={`w-full shrink-0 border-b border-zinc-800 bg-zinc-900 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r ${activeTab === "workspace" ? "hidden" : ""}`}>
          <button
            type="button"
            aria-expanded={watchlistOpen}
            onClick={() => setWatchlistOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-zinc-200 md:hidden"
          >
            <span>{activeTab === "crypto" ? "Crypto Watchlist" : activeTab === "forex" ? "Forex Watchlist" : activeTab === "stocks" ? "Stocks Watchlist" : "Market Overview"}</span>
            <span aria-hidden="true">{watchlistOpen ? "−" : "+"}</span>
          </button>
          <div className={`${watchlistOpen ? "block" : "hidden"} md:block`}>
          <div className="p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {activeTab === "crypto" ? "Crypto Watchlist" : 
               activeTab === "forex" ? "Forex Watchlist" : 
               activeTab === "stocks" ? "Stocks Watchlist" : "Market Overview"}
            </h2>

            {/* Search Bar */}
            {(activeTab === "crypto" || activeTab === "forex" || activeTab === "stocks") && (
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    value={activeTab === "crypto" ? searchQuery : activeTab === "forex" ? forexSearchQuery : stocksSearchQuery}
                    onChange={(e) => {
                      if (activeTab === "crypto") setSearchQuery(e.target.value);
                      else if (activeTab === "forex") setForexSearchQuery(e.target.value);
                      else if (activeTab === "stocks") setStocksSearchQuery(e.target.value);
                    }}
                    placeholder={`Search ${activeTab === "crypto" ? "coins" : activeTab === "forex" ? "pairs" : "stocks"}...`}
                    className="w-full px-3 py-2 pl-9 bg-zinc-800 text-white text-sm rounded-lg border border-zinc-700 focus:outline-none focus:border-purple-500"
                  />
                  <svg
                    className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 transform -translate-y-1/2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {activeTab === "crypto" && ((searchQuery ? filteredCrypto : allCryptoData.slice(0, 20)).map((crypto: any) => ({
                id: crypto.id,
                symbol: `${crypto.symbol.toUpperCase()}/USD`,
                name: crypto.name,
                price: `$${crypto.current_price.toLocaleString()}`,
                change: `${(crypto.price_change_percentage_24h ?? 0) >= 0 ? '+' : ''}${(crypto.price_change_percentage_24h ?? 0).toFixed(2)}%`,
                positive: (crypto.price_change_percentage_24h ?? 0) >= 0
              }))).map((item, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedCrypto(item.id)}
                  className={`p-4 rounded-xl transition-all cursor-pointer ${selectedCrypto === item.id ? 'bg-purple-600/20 border border-purple-500/50' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-white">{item.symbol}</span>
                    <span className={`text-sm font-medium ${item.positive ? "text-green-400" : "text-red-400"}`}>
                      {item.change}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">{item.name}</span>
                    <span className="text-sm text-white font-medium">{item.price}</span>
                  </div>
                </div>
              ))}

              {activeTab === "forex" && (forexSearchQuery ? filteredForex : forexWatchlist).map((item, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedForex(item.id)}
                  className={`p-4 rounded-xl transition-all cursor-pointer ${selectedForex === item.id ? 'bg-blue-600/20 border border-blue-500/50' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-white">{item.symbol}</span>
                    <span className={`text-sm font-medium ${item.positive ? "text-green-400" : "text-red-400"}`}>
                      {item.change}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">{item.name}</span>
                    <span className="text-sm text-white font-medium">{item.price}</span>
                  </div>
                </div>
              ))}

              {activeTab === "stocks" && (stocksSearchQuery ? filteredStocks : stocksWatchlist).map((item, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedStock(item.id)}
                  className={`p-4 rounded-xl transition-all cursor-pointer ${selectedStock === item.id ? 'bg-green-600/20 border border-green-500/50' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-white">{item.symbol}</span>
                    <span className={`text-sm font-medium ${item.positive ? "text-green-400" : "text-red-400"}`}>
                      {item.change}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">{item.name}</span>
                    <span className="text-sm text-white font-medium">{item.price}</span>
                  </div>
                </div>
              ))}

              {activeTab === "news" && (
                <div className="text-center text-zinc-400 py-8">
                  <p className="text-sm">Select a market tab to view watchlist</p>
                </div>
              )}
            </div>
          </div>
          </div>
        </aside>

        {/* Center Area - Chart */}
        <main className="flex min-w-0 flex-1 flex-col bg-zinc-950 md:overflow-y-auto">
          {/* Tabs Navigation */}
          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-zinc-800 bg-zinc-900 px-3 py-3 sm:px-6 sm:py-4">
            {[
              { id: "crypto", label: "Crypto", icon: "₿" },
              { id: "forex", label: "Forex", icon: "📊" },
              { id: "stocks", label: "Stocks", icon: "📈" },
              { id: "news", label: "News", icon: "📰" },
              { id: "workspace", label: "Phase 3", icon: "◫" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all sm:px-4 sm:text-sm ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white shadow-lg"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chart Header */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-zinc-800 px-3 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                {activeTab === "workspace" ? "Phase 3 Workbench" : activeTab === "crypto" ? (cryptoData.find((c: any) => c.id === selectedCrypto)?.symbol.toUpperCase() || "BTC") + "/USD" :
                 activeTab === "forex" ? (forexData.find((c: any) => c.id === selectedForex)?.symbol || "EUR/USD") :
                 activeTab === "stocks" ? (stocksData.find((c: any) => c.id === selectedStock)?.symbol || "AAPL") :
                 "Market Overview"}
              </h2>
              <span className="hidden text-sm text-zinc-400 sm:block">
                {activeTab === "workspace" ? "Research, portfolio, and strategy tools" : activeTab === "crypto" ? (cryptoData.find((c: any) => c.id === selectedCrypto)?.name || "Bitcoin") + " / US Dollar" :
                 activeTab === "forex" ? (forexData.find((c: any) => c.id === selectedForex)?.name || "Euro/US Dollar") :
                 activeTab === "stocks" ? (stocksData.find((c: any) => c.id === selectedStock)?.name || "Apple Inc.") :
                 "Market Overview"}
              </span>
            </div>
            {activeTab !== "news" && activeTab !== "workspace" && (
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <button 
                  onClick={() => setTimeframe("0.25")}
                  className={`rounded px-2 py-1 text-xs transition-colors sm:px-3 sm:text-sm ${timeframe === "0.25" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  15m
                </button>
                <button 
                  onClick={() => setTimeframe("1")}
                  className={`rounded px-2 py-1 text-xs transition-colors sm:px-3 sm:text-sm ${timeframe === "1" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  1h
                </button>
                <button 
                  onClick={() => setTimeframe("4")}
                  className={`rounded px-2 py-1 text-xs transition-colors sm:px-3 sm:text-sm ${timeframe === "4" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  4h
                </button>
                <button 
                  onClick={() => setTimeframe("24")}
                  className={`rounded px-2 py-1 text-xs transition-colors sm:px-3 sm:text-sm ${timeframe === "24" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  1d
                </button>
                <button
                  onClick={() => setTimeframe("max")}
                  className={`rounded px-2 py-1 text-xs transition-colors sm:px-3 sm:text-sm ${timeframe === "max" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  Max
                </button>
                <button
                  type="button"
                  onClick={() => setPriceAlertOpen((open) => !open)}
                  aria-expanded={priceAlertOpen}
                  className="ml-1 flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 sm:px-3 sm:text-sm"
                >
                  <span aria-hidden="true">◉</span>
                  Price Alert
                </button>
              </div>
            )}
          </div>

          {priceAlertOpen && activeTab !== "news" && activeTab !== "workspace" && (
            <section className="space-y-3 border-b border-zinc-800 bg-zinc-900/70 px-3 py-3 sm:px-6" aria-label="Price alerts">
              <form onSubmit={handleCreatePriceAlert} className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-zinc-300">{selectedMarketLabel} · {currentPrice === null ? "Quote unavailable" : formatMarketPrice(currentPrice)}</span>
                <select
                  value={priceAlertDirection}
                  onChange={(event) => setPriceAlertDirection(event.target.value as "above" | "below")}
                  aria-label="Alert condition"
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-white"
                >
                  <option value="above">At or above</option>
                  <option value="below">At or below</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={priceAlertInput}
                  onChange={(event) => setPriceAlertInput(event.target.value)}
                  aria-label="Price alert level"
                  placeholder="Price level"
                  required
                  className="w-32 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white placeholder:text-zinc-500"
                />
                <button type="submit" className="rounded bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-600">Set Alert</button>
              </form>
              <div className="flex flex-wrap gap-2">
                {priceAlerts.filter((alert) => alert.assetKey === selectedAssetKey).map((alert) => (
                  <div key={alert.id} className="flex items-center gap-2 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                    <span>{alert.direction === "above" ? "↑" : "↓"} {formatMarketPrice(alert.target)}</span>
                    <button type="button" aria-label={`Remove alert at ${alert.target}`} onClick={() => setPriceAlerts((alerts) => alerts.filter((item) => item.id !== alert.id))} className="text-zinc-400 hover:text-white">×</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Main Content */}
          <div className="min-w-0 flex-1 p-3 sm:p-6">
            {activeTab === "news" || activeTab === "workspace" ? (
              <PhaseThreeWorkspace key={activeTab} coins={allCryptoData} initialCoin={selectedCrypto} initialPanel={activeTab === "news" ? "insights" : "chart"} />
            ) : (
              <>
                {/* Chart */}
                <div className="mb-6">
                  {chartError && chartData.length === 0 ? (
                    <div className="flex h-72 items-center justify-center text-center text-sm text-amber-300 sm:h-96">{chartError}</div>
                  ) : loading ? (
                    <div className="flex h-72 items-center justify-center sm:h-96">
                      <div className="text-zinc-400">Loading chart data...</div>
                    </div>
                  ) : (
                    <div className="h-72 overflow-hidden rounded-xl bg-zinc-900 p-3 sm:h-96 sm:p-6">
                      <TradingChart
                        data={chartData}
                        chartKey={chartDataKey}
                        signals={marketSignals}
                        levels={displayedChartLevels}
                        trendline={chartStructure.trendline}
                        patternOutline={chartStructure.patternOutline}
                        patternName={marketPattern}
                        structureMarkers={chartStructure.markers}
                        hasMoreHistory={hasMoreHistory}
                        loadingOlder={loadingOlder}
                        onLoadOlderData={loadOlderHistory}
                        height={320}
                      />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-2 py-3 text-xs">
                    <span className="font-semibold text-white">Entry: <span className={entryDecision === "Yes" ? "text-green-400" : entryDecision === "No" ? "text-red-400" : "text-amber-300"}>{entryDecision}</span></span>
                    <span className="text-zinc-300">Hold or Enter: <strong className="text-white">{marketTradePlan?.direction === "buy" ? "Enter Buy" : marketTradePlan?.direction === "sell" ? "Enter Sell" : "Hold"}</strong></span>
                    <span className="text-zinc-300">R:R: <strong className="text-white">{marketTradePlan?.rewardRisk ? `1:${marketTradePlan.rewardRisk.toFixed(2)}` : "Wait"}</strong></span>
                    <span className="text-zinc-400">Pattern: {marketPattern}</span>
                  </div>
                  <details className="group mt-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <summary className="cursor-pointer list-none text-xs font-medium text-zinc-300">Advanced indicators</summary>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
                      {marketIndicators ? <>
                        <span title="Relative Strength Index, 14 candles">RSI(14): {marketIndicators.rsi14 === null ? "n/a" : marketIndicators.rsi14.toFixed(1)}</span>
                        <span title="MACD line and signal line">MACD: {marketIndicators.macd ? `${formatMarketPrice(marketIndicators.macd.line)} · signal ${formatMarketPrice(marketIndicators.macd.signal)}` : "n/a"}</span>
                        <span title="Simple moving averages">SMA 20/50: {marketIndicators.movingAverages.sma20 === null ? "n/a" : formatMarketPrice(marketIndicators.movingAverages.sma20)} / {marketIndicators.movingAverages.sma50 === null ? "n/a" : formatMarketPrice(marketIndicators.movingAverages.sma50)}</span>
                        <span title="Bollinger range, 20 candles">Bollinger: {marketIndicators.bollingerBands ? `${formatMarketPrice(marketIndicators.bollingerBands.lower)}–${formatMarketPrice(marketIndicators.bollingerBands.upper)}` : "n/a"}</span>
                        <span>Fibonacci: {marketIndicators.fibonacci?.retracement.map((level) => `${(level.ratio * 100).toFixed(1)}% ${formatMarketPrice(level.price)}`).join(" · ") ?? "n/a"}</span>
                      </> : <span>Indicator data is loading.</span>}
                      {marketExplanation && <p className="basis-full leading-relaxed text-zinc-500">{marketExplanation}</p>}
                    </div>
                  </details>
                </div>

              </>
            )}
          </div>

          {/* Upload Button */}
          <div className="px-6 py-4">
            <button 
              onClick={() => document.getElementById('main-chart-upload')?.click()}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload Chart Screenshot for AI Analysis
            </button>
            <input
              type="file"
              id="main-chart-upload"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setUploadedImage(reader.result as string);
                    setChatOpen(true);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="hidden"
            />
          </div>
        </main>
      </div>

      {/* Floating AI Chatbot */}
      <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-lg hover:from-purple-700 hover:to-blue-700 transition-all"
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </button>
        ) : (
          <div className={`flex h-[min(38rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl ${chatHistoryOpen ? "sm:w-[min(56rem,calc(100vw-3rem))]" : "sm:w-96"}`}>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-b border-zinc-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div>
                  <h3 className="text-xs font-semibold leading-tight text-white sm:text-sm">Muhammad Noman&apos;s Assistant AI</h3>
                  <p className="text-xs text-green-400">Online</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label="View chat history" aria-expanded={chatHistoryOpen} onClick={() => setChatHistoryOpen((open) => !open)} title="Chat history" className="rounded p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8m0-5v5h5m4-1v5l3 2" /></svg>
                </button>
                <button type="button" aria-label="New Chat" title="New Chat" onClick={() => startNewChat()} className="rounded p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" /></svg>
                </button>
                <button type="button" aria-label="Close chat" onClick={() => setChatOpen(false)} className="rounded p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {chatHistoryOpen && (
                <aside aria-label="Past chats" className="absolute inset-0 z-20 flex min-h-0 flex-col border-r border-zinc-700 bg-zinc-900 p-3 sm:relative sm:inset-auto sm:w-56 sm:shrink-0">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Past Chats</h4>
                    <button type="button" aria-label="Close chat history" onClick={() => setChatHistoryOpen(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:hidden">×</button>
                  </div>
                  <button type="button" onClick={() => startNewChat()} className="mb-3 flex items-center justify-center gap-2 rounded bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500">
                    <span aria-hidden="true">+</span> New Chat
                  </button>
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                    {chatHistory.map((session) => (
                      <button key={session.id} type="button" aria-current={session.id === activeChatId ? "page" : undefined} onClick={() => selectChat(session)} className={`w-full rounded px-3 py-2 text-left ${session.id === activeChatId ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800"}`}>
                        <span className="block truncate text-sm">{session.title}</span>
                        <span className="mt-1 block text-[10px] text-zinc-500">{new Date(session.updatedAt).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </aside>
              )}

              <div className={`${chatHistoryOpen ? "hidden sm:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col`}>
            {/* Chat Messages */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-lg p-3 ${message.chartMarkup || message.tradeSummary ? "w-full max-w-full" : "max-w-[80%]"} ${
                      message.role === "user" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    {"image" in message && message.image && !message.chartMarkup && (
                      <img src={message.image} alt="Chart" className="w-full h-32 object-cover rounded-lg mb-2" />
                    )}
                    {message.chartMarkup && message.image && message.verdict && message.riskReward && (
                      <div className="mb-3">
                        <AnnotatedChart
                          image={message.image}
                          annotations={message.annotations ?? []}
                          verdict={message.verdict}
                          riskReward={message.riskReward}
                        />
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.tradePlan && message.tradeSummary && (
                      <section aria-label="Trade plan summary" className="mt-3 space-y-3 rounded-lg border border-zinc-600 bg-zinc-950/80 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-bold text-white">Copy-ready trade summary</h4>
                          <span className={`font-bold ${message.tradePlan.direction === "wait" ? "text-amber-300" : "text-green-400"}`}>
                            {message.tradePlan.direction === "wait" ? "WAIT · No approved setup" : `${message.tradePlan.direction.toUpperCase()} · Setup quality ${message.tradePlan.qualityScore ?? "n/a"}/100`}
                          </span>
                        </div>
                        {message.tradePlan.direction !== "wait" && <p className="text-[10px] text-zinc-400">Setup quality is a qualitative evidence score, not a probability of profit.</p>}
                        {message.chartPattern && <p className="text-zinc-300">Pattern: <strong className="text-white">{message.chartPattern}</strong></p>}
                        {message.analysisExplanation && <p className="text-zinc-300">Why: {message.analysisExplanation}</p>}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-zinc-300">
                          <span>Entry: <strong className="text-white">{message.tradePlan.entry === null ? "Not set" : formatMarketPrice(message.tradePlan.entry)}</strong></span>
                          <span>Stop Loss: <strong className="text-white">{message.tradePlan.stopLoss === null ? "Not set" : formatMarketPrice(message.tradePlan.stopLoss)}</strong></span>
                          <span>Take Profit: <strong className="text-white">{message.tradePlan.takeProfit === null ? "Not set" : formatMarketPrice(message.tradePlan.takeProfit)}</strong></span>
                          <span>Position size: <strong className="text-white">{message.tradeSummary.size}</strong></span>
                          <span>Leverage: <strong className="text-white">{message.tradeSummary.leverage}</strong></span>
                          <span>Balance: <strong className="text-white">{message.tradeSummary.balance}</strong></span>
                          <span>Risk / max loss: <strong className="text-white">{message.tradeSummary.maxLoss}</strong></span>
                          <span>Reward:risk: <strong className="text-white">{message.tradeSummary.rewardRisk}</strong></span>
                          <span className="col-span-2">Estimated reward before fees/slippage: <strong className="text-white">{message.tradeSummary.estimatedProfit}</strong></span>
                        </div>
                        <div className="space-y-1 border-t border-zinc-800 pt-2 text-[10px] leading-relaxed text-amber-200">
                          <p>{tradeSafetyNotes(message.language).warning}</p>
                          <p>{tradeSafetyNotes(message.language).probability}</p>
                        </div>
                        {message.tradeSummary.highRisk && <p className="font-bold text-red-400">Warning: planned risk is over 10% of the balance.</p>}
                        {message.indicatorSummary && (
                          <p className="border-t border-zinc-800 pt-2 text-[10px] leading-relaxed text-zinc-400">
                            Indicators: RSI(14) {message.indicatorSummary.rsi14?.toFixed(1) ?? "n/a"}; MACD histogram {message.indicatorSummary.macd ? formatMarketPrice(message.indicatorSummary.macd.histogram) : "n/a"}; SMA20/50 {message.indicatorSummary.movingAverages.sma20 === null ? "n/a" : formatMarketPrice(message.indicatorSummary.movingAverages.sma20)} / {message.indicatorSummary.movingAverages.sma50 === null ? "n/a" : formatMarketPrice(message.indicatorSummary.movingAverages.sma50)}. Bollinger {message.indicatorSummary.bollingerBands ? `${formatMarketPrice(message.indicatorSummary.bollingerBands.lower)}–${formatMarketPrice(message.indicatorSummary.bollingerBands.upper)}` : "n/a"}; Fib 50% {message.indicatorSummary.fibonacci ? formatMarketPrice(message.indicatorSummary.fibonacci.retracement.find((level) => level.ratio === 0.5)?.price ?? message.indicatorSummary.fibonacci.low) : "n/a"}. RSI compares recent up/down moves; MACD compares faster/slower averages; Bollinger bands show a recent price range; Fibonacci lines are possible pullback levels, not predictions.
                          </p>
                        )}
                        {message.tradePlan.direction !== "wait" && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => void copyTradePlan(message, index)} className="flex items-center gap-2 rounded border border-zinc-600 px-3 py-2 font-semibold text-zinc-100 hover:bg-zinc-800">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8V4h12v12h-4M4 8h12v12H4z" /></svg>
                              {copiedTradeMessage === index ? "Copied" : "Copy trade"}
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 rounded-lg bg-zinc-800 text-zinc-100">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="border-t border-zinc-700 p-4">
              {/* Trading Parameters Toggle */}
              <button
                onClick={() => setShowTradingParams(!showTradingParams)}
                className="w-full mb-3 px-3 py-2 bg-zinc-800 text-zinc-300 text-sm rounded-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {showTradingParams ? 'Hide Trading Parameters' : 'Show Trading Parameters'}
              </button>

              {/* Trading Parameters Input */}
              {showTradingParams && (
                <div className="mb-3 max-h-[30dvh] space-y-2 overflow-y-auto rounded-lg bg-zinc-800 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Account Balance ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tradingParams.accountBalance}
                        onChange={(e) => setTradingParams({...tradingParams, accountBalance: e.target.value})}
                        placeholder="1000"
                        className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Risk Amount ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tradingParams.riskAmount}
                        onChange={(e) => setTradingParams({...tradingParams, riskAmount: e.target.value})}
                        placeholder="10"
                        className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Target Profit ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tradingParams.targetProfit}
                        onChange={(e) => setTradingParams({...tradingParams, targetProfit: e.target.value})}
                        placeholder="20"
                        className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Entry Price</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tradingParams.entryPrice}
                        onChange={(e) => setTradingParams({...tradingParams, entryPrice: e.target.value})}
                        placeholder="Optional"
                        className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Stop Loss Price</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tradingParams.stopLossPrice}
                        onChange={(e) => setTradingParams({...tradingParams, stopLossPrice: e.target.value})}
                        placeholder="Optional"
                        className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Sizing Method</label>
                      <select
                        value={tradingParams.sizeMode}
                        onChange={(e) => setTradingParams({...tradingParams, sizeMode: e.target.value})}
                        className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                      >
                        <option value="lots">Lots (Forex/CFD)</option>
                        <option value="units">Units (Spot/Shares)</option>
                      </select>
                    </div>
                    {tradingParams.sizeMode === "lots" && (
                      <div className="sm:col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Value of a 1.00 Price Move per Lot ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={tradingParams.valuePerPriceUnitPerLot}
                          onChange={(e) => setTradingParams({...tradingParams, valuePerPriceUnitPerLot: e.target.value})}
                          placeholder="Check your broker's contract specs"
                          className="w-full px-2 py-1 bg-zinc-700 text-white text-sm rounded border border-zinc-600 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Image Upload */}
              <div className="mb-3">
                <input
                  type="file"
                  id="chart-upload"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setUploadedImage(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="chart-upload"
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 text-sm rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {uploadedImage ? 'Chart Uploaded ✓' : 'Upload Chart Screenshot'}
                </label>
                {uploadedImage && (
                  <div className="mt-2 relative">
                    <img src={uploadedImage} alt="Uploaded chart" className="w-full h-32 object-cover rounded-lg" />
                    <button
                      onClick={() => setUploadedImage(null)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex min-w-0 gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Ask about the market or describe the chart..."
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none sm:px-4"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={chatLoading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chatLoading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}