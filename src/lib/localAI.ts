/**
 * lib/localAI.ts — SMART + FAST local AI with NO external API keys.
 *
 * A rule-based assistant that runs entirely in-process (instant reasoning, no
 * network for the logic itself). It powers:
 *   1. detectIntent(message)  — what the user is asking for
 *   2. extractSymbol(message) — BTC, ETH, SOL, XAUUSD…
 *   3. generateResponse(...)  — natural bilingual (Roman Urdu / English) answer
 *   4. SIGNAL DISCUSSION      — compare the supplied/latest signal against the
 *                               LIVE price and build a "should I enter / wait /
 *                               where is price now" breakdown. Most important.
 *
 * Educational analysis only — not financial advice.
 */

export type LocalIntent =
  | "GREETING"
  | "HOW_ARE_YOU"
  | "COIN_PRICE"
  | "COIN_ANALYSIS"
  | "SIGNAL_QUERY"
  | "SIGNAL_DISCUSSION"
  | "PATTERN_QUERY"
  | "INDICATOR_HELP"
  | "RISK_HELP"
  | "MARKET_OVERVIEW"
  | "HELP"
  | "UNKNOWN";

export interface LocalContext {
  origin?: string;
  signalContext?: Record<string, unknown> | null;
}

export interface LocalResponse {
  reply: string;
  intent: LocalIntent;
  symbol: string | null;
}

/** Alias so the chat route can import a neutral `Intent` name. */
export type Intent = LocalIntent;

/** Normalised signal payload the chat route passes for SIGNAL_DISCUSSION.
 *  Every field is optional — only what the client sent is present. */
export interface DiscussionSignal {
  symbol?: string;
  market?: string;
  timeframe?: string;
  score?: number;
  direction?: string;
  bias?: string;
  trend?: string;
  pattern?: string;
  chartPattern?: string;
  chartPatternNote?: string;
  candlestick?: string;
  price?: number;
  entry1?: number;
  entry2?: number;
  stopLoss?: number;
  stop_loss?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  support?: number;
  resistance?: number;
  consensus?: string;
  reasoning?: string;
  status?: string;
  createdAt?: number;
  educators?: Array<{ role?: string; verdict?: string }>;
}

export interface GenerateContext {
  signal?: DiscussionSignal | null;
  origin?: string;
}

// ── Money / time helpers ──────────────────────────────────────────────────────

/** $2,340 / $1.0850 style money, tuned to the asset's magnitude. */
export function localMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function pct(from: number, to: number): number {
  if (!Number.isFinite(from) || from === 0) return 0;
  return ((to - from) / from) * 100;
}

function signPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** "2 hours ago" style relative time for a createdAt epoch-ms stamp. */
function timeAgo(stampMs: number): string {
  const diff = Date.now() - stampMs;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// ── Symbol table ──────────────────────────────────────────────────────────────

export interface SymbolEntry {
  base: string;
  pair: string;
  name: string;
  market: "crypto" | "forex" | "metals";
  words: string[];
}

const SYMBOLS: SymbolEntry[] = [
  { base: "BTC", pair: "BTCUSDT", name: "Bitcoin", market: "crypto", words: ["btc", "bitcoin"] },
  { base: "ETH", pair: "ETHUSDT", name: "Ethereum", market: "crypto", words: ["eth", "ethereum"] },
  { base: "SOL", pair: "SOLUSDT", name: "Solana", market: "crypto", words: ["sol", "solana"] },
  { base: "BNB", pair: "BNBUSDT", name: "BNB", market: "crypto", words: ["bnb", "binancecoin"] },
  { base: "XRP", pair: "XRPUSDT", name: "XRP", market: "crypto", words: ["xrp", "ripple"] },
  { base: "DOGE", pair: "DOGEUSDT", name: "Dogecoin", market: "crypto", words: ["doge", "dogecoin"] },
  { base: "ADA", pair: "ADAUSDT", name: "Cardano", market: "crypto", words: ["ada", "cardano"] },
  { base: "AVAX", pair: "AVAXUSDT", name: "Avalanche", market: "crypto", words: ["avax", "avalanche"] },
  { base: "LINK", pair: "LINKUSDT", name: "Chainlink", market: "crypto", words: ["link", "chainlink"] },
  { base: "MATIC", pair: "MATICUSDT", name: "Polygon", market: "crypto", words: ["matic", "polygon"] },
  { base: "DOT", pair: "DOTUSDT", name: "Polkadot", market: "crypto", words: ["dot", "polkadot"] },
  { base: "LTC", pair: "LTCUSDT", name: "Litecoin", market: "crypto", words: ["ltc", "litecoin"] },
  { base: "TRX", pair: "TRXUSDT", name: "TRON", market: "crypto", words: ["trx", "tron"] },
  { base: "SHIB", pair: "SHIBUSDT", name: "Shiba Inu", market: "crypto", words: ["shib", "shiba", "shibainu"] },
  { base: "NEAR", pair: "NEARUSDT", name: "NEAR", market: "crypto", words: ["near"] },
  { base: "APT", pair: "APTUSDT", name: "Aptos", market: "crypto", words: ["apt", "aptos"] },
  { base: "ARB", pair: "ARBUSDT", name: "Arbitrum", market: "crypto", words: ["arb", "arbitrum"] },
  { base: "OP", pair: "OPUSDT", name: "Optimism", market: "crypto", words: ["op", "optimism"] },
  { base: "SUI", pair: "SUIUSDT", name: "Sui", market: "crypto", words: ["sui"] },
  { base: "PEPE", pair: "PEPEUSDT", name: "Pepe", market: "crypto", words: ["pepe"] },
  { base: "GOLD", pair: "XAUUSD", name: "Gold", market: "metals", words: ["gold", "xau", "xauusd", "sona", "soney"] },
  { base: "SILVER", pair: "XAGUSD", name: "Silver", market: "metals", words: ["silver", "xag", "xagusd"] },
  { base: "EURUSD", pair: "EURUSD", name: "EUR/USD", market: "forex", words: ["eurusd", "eur", "euro"] },
  { base: "GBPUSD", pair: "GBPUSD", name: "GBP/USD", market: "forex", words: ["gbpusd", "gbp", "pound"] },
  { base: "USDJPY", pair: "USDJPY", name: "USD/JPY", market: "forex", words: ["usdjpy", "jpy", "yen"] },
];

/** Live Binance spot price for a pair like "BTCUSDT". Null on any failure. */
export async function fetchLivePrice(pair: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { price?: string };
    const price = Number(json.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** Extracts a recognised symbol entry from free text, or null. */
export function extractSymbol(message: string): SymbolEntry | null {
  const lower = ` ${message.toLowerCase()} `;
  const pairHit = SYMBOLS.find((s) => lower.includes(s.pair.toLowerCase()));
  if (pairHit) return pairHit;
  for (const s of SYMBOLS) {
    if (s.words.some((w) => new RegExp(`\\b${w}\\b`).test(lower))) return s;
  }
  return null;
}


// ── Intent detection ──────────────────────────────────────────────────────────

const GREETINGS = [
  "hi", "hello", "hey", "salam", "salaam", "assalamualaikum", "assalaamualaikum",
  "aoa", "assalam o alaikum", "good morning", "good evening", "good afternoon",
];
const HOW_ARE_YOU = [
  "how are you", "how r u", "how you doing", "kaise ho", "kaisay ho", "kese ho",
  "kesi ho", "kya haal", "kia haal", "whats up", "what's up", "how are you doing",
];
const SIGNAL_DISCUSSION_WORDS = [
  "kab entry", "kab enter", "entry laun", "entry lun", "entry loon", "entry lein",
  "entry lo", "should i enter", "should i buy", "should i sell", "le lun", "laun ya",
  "na laun", "wait karun", "wait karna", "kitna wait", "ye signal", "signal ka kya",
  "signal discuss", "signal ke baare", "signal ke bare", "my signal", "mera signal",
  "entry ka wait", "ab entry", "kya lu", "kya lun", "kya lein", "when to enter",
  "signal pe baat", "aur wait", "kab exit", "kab band",
];
const SIGNAL_QUERY_WORDS = [
  "aaj ke signal", "signals dikhao", "signal dikhao", "ke signals", "show signals",
  "kya signal", "best signal", "top signal", "signals kya", "latest signal",
  "signal batao", "signals batao", "signals do", "acha setup", "best setup",
  "kya lein", "dhundho", "dhoondo", "scan",
];
const ANALYSIS_WORDS = [
  "analysis", "analyze", "analyse", "trade", "setup", "outlook", "scene",
  "ka kya hoga", "kya hoga", "kya karein", "kya karun", "kahan jaayega",
  "kahaan jaayega", "prediction", "forecast", "view", "kya sochte",
];
const PRICE_WORDS = [
  "price", "rate", "kitna", "kitne", "how much", "qemat", "keemat", "kimat",
  "value", "bhav", "kya chal raha", "kitne ka",
];
const PATTERN_WORDS = [
  "triple bottom", "triple top", "head and shoulder", "head & shoulder",
  "double bottom", "double top", "wedge", "flag", "triangle", "cup and handle",
  "pennant", "pattern kya", "pattern hota", "engulfing", "doji", "morning star",
  "evening star", "candlestick",
];
const INDICATOR_WORDS = [
  "rsi", "macd", "ema", "bollinger", "moving average", "stochastic", "indicator",
  "divergence", "oversold", "overbought",
];
const RISK_WORDS = [
  "risk", "position size", "position sizing", "lot size", "how much to risk",
  "stop loss kitna", "sl kitna", "calculator", "money management", "1% risk",
  "2% risk", "risk calculator",
];
const MARKET_WORDS = [
  "market kaisa", "market kaisay", "market kesa", "how is the market",
  "market overview", "market kya kar raha", "sentiment", "overall market",
  "market condition", "market kesa hai",
];
const HELP_WORDS = [
  "help", "madad", "kya kar sakte", "what can you do", "menu", "options", "kaise use",
];

function hasWord(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/** Fast, pure-JS intent classifier (no network). */
export function detectIntent(message: string): LocalIntent {
  const m = ` ${message.toLowerCase().replace(/[!?.,]+/g, " ")} `;
  const compact = m.replace(/\s+/g, " ").trim();

  if (GREETINGS.includes(compact)) return "GREETING";
  if (hasWord(m, HOW_ARE_YOU)) return "HOW_ARE_YOU";
  if (hasWord(m, SIGNAL_DISCUSSION_WORDS)) return "SIGNAL_DISCUSSION";
  if (hasWord(m, SIGNAL_QUERY_WORDS)) return "SIGNAL_QUERY";

  const symbol = extractSymbol(message);
  if (hasWord(m, PATTERN_WORDS)) return "PATTERN_QUERY";
  if (hasWord(m, INDICATOR_WORDS)) return "INDICATOR_HELP";
  if (hasWord(m, RISK_WORDS)) return "RISK_HELP";
  if (symbol && hasWord(m, ANALYSIS_WORDS)) return "COIN_ANALYSIS";
  if (symbol && hasWord(m, PRICE_WORDS)) return "COIN_PRICE";
  if (hasWord(m, MARKET_WORDS)) return "MARKET_OVERVIEW";
  if (hasWord(m, HELP_WORDS)) return "HELP";
  if (GREETINGS.some((g) => compact.startsWith(g))) return "GREETING";
  if (symbol) return "COIN_ANALYSIS";
  return "UNKNOWN";
}

/** Roman-Urdu when the message leans Urdu, else English. */
export function isRomanUrdu(message: string): boolean {
  const markers = [
    "kya", "kaisa", "kaisay", "kaise", "kese", "kesa", "kitna", "kitne", "hai",
    "nahi", "abhi", "chahiye", "batao", "laun", "lun", "karun", "karein", "karo",
    "mujhe", "mera", "lekin", "acha", "theek", "bhai", "dikhao", "wait", "jaayega",
    "jayega", "hoga", "qemat", "keemat", "sirf", "phir", "dobara", "mat lo",
    "kahan", "kahaan", "loon", "rakhu", "kab", "mashwara",
  ];
  const m = ` ${message.toLowerCase()} `;
  return markers.some((marker) => m.includes(` ${marker}`) || m.includes(`${marker} `));
}


// ── Static educational replies ────────────────────────────────────────────────

const DISCLAIMER = "⚠️ Educational only — not financial advice.";
const ASSISTANT = "Muhammad Noman's Assistant AI";

function scoreTier(score: number): string {
  if (score >= 90) return "EXCELLENT";
  if (score >= 80) return "STRONG";
  if (score >= 70) return "GOOD";
  return "MODERATE";
}

export function greetingReply(romanUrdu: boolean): string {
  return romanUrdu
    ? `Assalam-o-Alaikum! Main ${ASSISTANT} hoon. Main aapko crypto, forex, aur gold ka real-time analysis de sakta hoon. Kisi bhi coin ka naam likhein — jaise "BTC analysis" ya "aaj ke signals dikhao". Bataiye, kya dekhna chahte hain? 😊\n${DISCLAIMER}`
    : `Hello! I'm ${ASSISTANT}. I can give you real-time crypto, forex, and gold analysis. Name any coin — like "BTC analysis" or "show today's signals". What would you like to look at? 😊\n${DISCLAIMER}`;
}

export function howAreYouReply(romanUrdu: boolean): string {
  return romanUrdu
    ? `Main bilkul theek hoon, shukriya! 😊 Aaj market mein kya dekhna chahte hain — kisi coin ka analysis, ya aaj ke signals?`
    : `I'm doing great, thanks! 😊 What would you like to check in the market today — a coin's analysis, or today's signals?`;
}

export function helpMenu(romanUrdu: boolean): string {
  return romanUrdu
    ? [
        "Bhai, main in cheezon mein madad kar sakta hoon:",
        "",
        "• \"BTC ka analysis batao\" — kisi bhi coin ki live analysis",
        "• \"aaj ke signals dikhao\" — best trade setups",
        "• \"BTC signal pe baat karein\" — signal discuss (entry / SL / TP)",
        "• \"RSI kya hai?\" — indicators ki seekhai",
        "• \"triple bottom kya hota hai?\" — chart patterns",
        "• \"risk calculator\" — position sizing kaise nikalein",
        "• \"market kaisa hai?\" — overall market overview",
        "",
        "Coin ka naam likh dein aur poochh lein. 😊",
        DISCLAIMER,
      ].join("\n")
    : [
        "Here's what I can help with:",
        "",
        "• \"Give me a BTC analysis\" — live analysis of any coin",
        "• \"Show today's signals\" — best trade setups",
        "• \"Let's discuss the BTC signal\" — talk through entry / SL / TP",
        "• \"What is RSI?\" — learn indicators",
        "• \"What is a triple bottom?\" — chart patterns",
        "• \"Risk calculator\" — how to size positions",
        "• \"How's the market?\" — overall market overview",
        "",
        "Just name a coin and ask away. 😊",
        DISCLAIMER,
      ].join("\n");
}


const PATTERN_MAP: Record<string, { en: string; ur: string }> = {
  "triple bottom": {
    en: "A Triple Bottom is a BULLISH reversal: price tests the same support three times and bounces. When it breaks the middle neckline with rising volume, an uptrend often follows. Entry on the breakout/retest; stop below the lowest bottom.",
    ur: "Triple Bottom aik BULLISH reversal hai: price teen martaba same support ko touch karti hai aur bounce karti hai. Jab beech ki neckline volume ke saath toot-ti hai, aksar uptrend start hota hai. Entry breakout/retest pe, stop sab se neeche wale bottom ke neeche.",
  },
  "triple top": {
    en: "A Triple Top is a BEARISH reversal: price tests the same resistance three times and gets rejected. A break below the neckline signals a downtrend. Entry on the breakdown; stop above the highest top.",
    ur: "Triple Top BEARISH reversal hai: price teen martaba same resistance ko test karti hai aur reject hoti hai. Neckline ke neeche break downtrend ka signal hai. Entry breakdown pe, stop sab se upar wale top ke upar.",
  },
  "head and shoulder": {
    en: "Head & Shoulders is a BEARISH reversal: a middle peak (head) higher than two side peaks (shoulders). Breaking the neckline signals a downtrend. Entry on the neckline break; stop above the right shoulder.",
    ur: "Head & Shoulders BEARISH reversal hai: beech ka peak (head) do side peaks (shoulders) se uncha hota hai. Neckline toot-ne se downtrend banta hai. Entry neckline break pe, stop right shoulder ke upar.",
  },
  "double bottom": {
    en: "A Double Bottom (\"W\") is BULLISH: price makes two similar lows then reverses up. A break above the middle high confirms it. Entry on the breakout; stop below the second low.",
    ur: "Double Bottom (\"W\") BULLISH hai: price do similar lows banati hai phir upar turn leti hai. Beech wale high ke upar break confirm karta hai. Entry breakout pe, stop doosre low ke neeche.",
  },
  "double top": {
    en: "A Double Top (\"M\") is BEARISH: two similar highs then a reversal down. A break below the middle low confirms it. Entry on the breakdown; stop above the second high.",
    ur: "Double Top (\"M\") BEARISH hai: do similar highs phir reversal neeche. Beech wale low ke neeche break confirm karta hai. Entry breakdown pe, stop doosre high ke upar.",
  },
  engulfing: {
    en: "An Engulfing is a two-candle reversal: the second candle's body fully covers the first. Bullish Engulfing at support = buyers took control; Bearish Engulfing at resistance = sellers did.",
    ur: "Engulfing do-candle reversal hai: doosri candle pehli ko poori tarah cover kar deti hai. Support pe Bullish Engulfing = buyers ne control liya; Resistance pe Bearish Engulfing = sellers ne.",
  },
  doji: {
    en: "A Doji is a single candle where open ≈ close — indecision. At a key support/resistance it can warn of a reversal. Always confirm with the next candle before entering.",
    ur: "Doji aik single candle hai jahan open ≈ close — yani indecision. Key support/resistance pe reversal ka warning de sakta hai. Hamesha agli candle se confirm karein.",
  },
  "morning star": {
    en: "A Morning Star is a 3-candle BULLISH reversal at the bottom: big down candle, small indecision candle, then a strong up candle. Buyers stepping in.",
    ur: "Morning Star 3-candle BULLISH reversal hai neeche: bari down candle, choti indecision candle, phir strong up candle. Buyers ka wapas aane ka signal.",
  },
  "evening star": {
    en: "An Evening Star is a 3-candle BEARISH reversal at the top: big up candle, small indecision candle, then a strong down candle. Sellers stepping in.",
    ur: "Evening Star 3-candle BEARISH reversal hai upar: bari up candle, choti indecision candle, phir strong down candle. Sellers ka wapas aane ka signal.",
  },
};

export function patternExplain(romanUrdu: boolean, pattern: string): string {
  const key = pattern.toLowerCase();
  const hit = Object.keys(PATTERN_MAP).find((k) => key.includes(k));
  if (hit) return `${romanUrdu ? PATTERN_MAP[hit].ur : PATTERN_MAP[hit].en}\n${DISCLAIMER}`;
  return romanUrdu
    ? `"${pattern}" kai common patterns hain: Triple Bottom/Top, Double Bottom/Top, Head & Shoulders, Wedge, Flag, Triangle, Engulfing, Doji, Morning/Evening Star. Kisi aik ka naam bataiye — main detail mein samjhata hoon. 📘\n${DISCLAIMER}`
    : `"${pattern}" is one of many: Triple Bottom/Top, Double Bottom/Top, Head & Shoulders, Wedge, Flag, Triangle, Engulfing, Doji, Morning/Evening Star. Name one and I'll explain it. 📘\n${DISCLAIMER}`;
}


export function indicatorExplain(romanUrdu: boolean, indicator: string): string {
  const key = indicator.toLowerCase();
  if (key.includes("rsi")) {
    return romanUrdu
      ? `📘 RSI (Relative Strength Index) 0-100 ke beech momentum naapta hai.\n• 70+ = overbought (pullback ka risk)\n• 30- = oversold (bounce ka chance)\n• Best use: support pe RSI 30 se bounce, ya resistance pe RSI 70 se rejection.\n• Divergence (price naya high, RSI nahi) reversal ka warning deta hai.\n${DISCLAIMER}`
      : `📘 RSI (Relative Strength Index) measures momentum from 0-100.\n• Above 70 = overbought (pullback risk)\n• Below 30 = oversold (bounce chance)\n• Best use: bounce off 30 at support, or rejection off 70 at resistance.\n• Divergence (price makes a new high but RSI doesn't) warns of reversal.\n${DISCLAIMER}`;
  }
  if (key.includes("macd")) {
    return romanUrdu
      ? `📘 MACD do moving averages ka farq dikhata hai.\n• MACD line signal line ke UPAR cross = bullish\n• NEEche cross = bearish\n• Histogram momentum dikhata hai — trade ki taraf barhta hua = trend mazboot.\n${DISCLAIMER}`
      : `📘 MACD shows the gap between two moving averages.\n• MACD line crosses ABOVE signal = bullish\n• BELOW = bearish\n• The histogram shows momentum — expanding toward your trade direction = strong trend.\n${DISCLAIMER}`;
  }
  if (key.includes("ema")) {
    return romanUrdu
      ? `📘 EMA (Exponential Moving Average) recent prices ko zyada weight deti hai.\n• Uptrend: price > EMA20 > EMA50 > EMA200 (bullish alignment)\n• Saari EMA price ke neeche = bearish\n• EMA200 bade trend ka level maana jata hai.\n${DISCLAIMER}`
      : `📘 EMA (Exponential Moving Average) weights recent prices more.\n• Uptrend: price > EMA20 > EMA50 > EMA200 (bullish alignment)\n• All EMAs below price = bearish\n• EMA200 is the big-trend line.\n${DISCLAIMER}`;
  }
  if (key.includes("bollinger")) {
    return romanUrdu
      ? `📘 Bollinger Bands ek average ke ird-gird do bands hain.\n• Price upper band ko chhue = overbought, lower band = oversold\n• Bands sikud-ne (squeeze) ke baad aksar bada move aata hai.\n${DISCLAIMER}`
      : `📘 Bollinger Bands wrap two lines around an average.\n• Price touching the upper band = overbought, lower = oversold\n• A squeeze (bands narrowing) often precedes a big move.\n${DISCLAIMER}`;
  }
  return romanUrdu
    ? `Main RSI, MACD, EMA, Bollinger Bands, aur Stochastic samjha sakta hoon. Kaun sa indicator poochna hai? 📘\n${DISCLAIMER}`
    : `I can explain RSI, MACD, EMA, Bollinger Bands, and Stochastic. Which one do you want to understand? 📘\n${DISCLAIMER}`;
}

export function riskHelp(romanUrdu: boolean): string {
  return romanUrdu
    ? [
        "📐 Position Size kaise nikalein:",
        "",
        "1. Account balance x risk% = max risk (USD). Misal: $1000 x 2% = $20.",
        "2. Entry − Stop Loss ka farq nikaalein. Misal: entry $100, SL $96 → $4 risk per unit.",
        "3. Position size = max risk ÷ risk per unit = $20 ÷ $4 = 5 units.",
        "",
        "Yaad rakhein:",
        "• Har trade pe sirf 1-2% risk karein.",
        "• R:R kam se kam 1:2 hona chahiye, warna trade mat lein.",
        "• SL tight rakhein (1.5x ATR), lekin level ke peeche rakhein.",
        "",
        DISCLAIMER,
      ].join("\n")
    : [
        "📐 How to size a position:",
        "",
        "1. Account balance x risk% = max risk (USD). E.g. $1000 x 2% = $20.",
        "2. Find entry − stop-loss distance. E.g. entry $100, SL $96 → $4 risk per unit.",
        "3. Position size = max risk ÷ risk per unit = $20 ÷ $4 = 5 units.",
        "",
        "Remember:",
        "• Risk only 1-2% per trade.",
        "• Keep R:R at least 1:2, or skip the trade.",
        "• Keep SL tight (1.5x ATR) but behind a real level.",
        "",
        DISCLAIMER,
      ].join("\n");
}


// ── Live price & analysis replies ─────────────────────────────────────────────

/** COIN_PRICE — fetch the live Binance spot price and reply instantly. */
async function coinPriceReply(message: string): Promise<string> {
  const symbol = extractSymbol(message);
  const ur = isRomanUrdu(message);
  if (!symbol) {
    return ur
      ? `Kisi coin ka naam likhein — jaise "BTC", "ETH", "gold" — main uska live rate bata dunga. 💰\n${DISCLAIMER}`
      : `Name a coin — like "BTC", "ETH", "gold" — and I'll fetch its live rate. 💰\n${DISCLAIMER}`;
  }
  const price = symbol.market === "crypto" ? await fetchLivePrice(symbol.pair) : null;
  if (price == null) {
    // Forex/metals don't have a Binance spot feed — be honest, don't invent.
    return ur
      ? `${symbol.name} (${symbol.pair}) ka live rate abhi fetch nahi ho pa raha. Thori der baad dobara try karein, ya kisi crypto coin (BTC, ETH, SOL…) ka rate poochh lein. 💰\n${DISCLAIMER}`
      : `I couldn't fetch a live rate for ${symbol.name} (${symbol.pair}) right now. Try again shortly, or ask for a crypto coin (BTC, ETH, SOL…). 💰\n${DISCLAIMER}`;
  }
  return ur
    ? `💰 ${symbol.name} (${symbol.pair}) ka live rate ${localMoney(price)} hai.\n${DISCLAIMER}`
    : `💰 ${symbol.name} (${symbol.pair}) is trading at ${localMoney(price)} right now.\n${DISCLAIMER}`;
}


// ── SIGNAL DISCUSSION (the most important feature) ────────────────────────────

/** First finite number among the candidates, or null. */
function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** True when the direction reads bullish. Falls back to the level geometry
 *  (stop below entry = long, stop above entry = short) so a signal that only
 *  sends prices isn't mislabelled as bearish. */
function isBullish(sig: DiscussionSignal): boolean {
  const d = (sig.direction ?? sig.bias ?? sig.trend ?? "").toLowerCase();
  if (d === "buy" || d === "bullish" || d === "long") return true;
  if (d === "sell" || d === "bearish" || d === "short") return false;
  const entry = firstNumber(sig.entry1, sig.entry2, sig.price);
  const sl = firstNumber(sig.stopLoss, sig.stop_loss, sig.sl);
  if (entry != null && sl != null) return sl < entry;
  const tp1 = firstNumber(sig.tp1);
  if (entry != null && tp1 != null) return tp1 > entry;
  return false;
}

/** The signal's overall quality label from its score. */
function qualityWord(score: number): string {
  if (score >= 90) return "PERFECT";
  if (score >= 85) return "STRONG";
  if (score >= 75) return "GOOD";
  return "MODERATE";
}

/**
 * Builds the SIGNAL_DISCUSSION reply. Reads live price (one Binance fetch for
 * crypto), then positions it against entry1/entry2, SL and TP1/TP2/TP3 and
 * gives a plain "enter / wait / avoid" call with honest risk notes.
 */
async function signalDiscussionReply(message: string, sig: DiscussionSignal | null): Promise<string> {
  const ur = isRomanUrdu(message);

  // ── No signal loaded: explain what we need instead of bluffing. ──
  if (!sig || (!sig.entry1 && !sig.entry2 && !sig.stopLoss)) {
    return ur
      ? [
          "🎯 Signal Discussion",
          "━━━━━━━━━━━━━━━━━━━",
          "",
          "Bhai, abhi koi signal load nahi hai jis pe baat karni ho. Iske do tareeqe hain:",
          "",
          "1. Signals page pe jaake kisi signal card pe \"💬 Discuss in Chat\" dabayein —",
          "   phir usi signal pe yahan baat karenge.",
          "2. Ya coin ka naam + \"signal\" likhein, jaise \"BTC signal\" — main us signal ka",
          "   discussion bana dunga agar wo available hai.",
          "",
          DISCLAIMER,
        ].join("\n")
      : [
          "🎯 Signal Discussion",
          "━━━━━━━━━━━━━━━━━━━",
          "",
          "No signal is loaded to discuss yet. Two ways to start:",
          "",
          "1. Go to the Signals page and click \"💬 Discuss in Chat\" on a card —",
          "   then we'll talk about that exact signal here.",
          "2. Or name a coin + \"signal\", e.g. \"BTC signal\" — I'll pull up that signal",
          "   if one is available.",
          "",
          DISCLAIMER,
        ].join("\n");
  }

  const symbol = sig.symbol ?? "the asset";
  const score = typeof sig.score === "number" ? sig.score : 0;
  const bull = isBullish(sig);
  const dirLabel = bull ? "Bullish (Buy)" : "Bearish (Sell)";

  // ── Live price (crypto only via Binance; else fall back to signal price). ──
  let live: number | null = null;
  if (symbol.toUpperCase().endsWith("USDT")) {
    live = await fetchLivePrice(symbol.toUpperCase());
  }
  const price = live ?? (typeof sig.price === "number" ? sig.price : null);

  const lines: string[] = [];
  lines.push("🎯 Signal Discussion");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(ur ? "📊 SIGNAL INFO:" : "📊 SIGNAL INFO:");
  lines.push(`   Symbol: ${symbol}`);
  if (sig.pattern) lines.push(`   Pattern: ${sig.pattern}`);
  if (sig.candlestick) lines.push(`   Candlestick: ${sig.candlestick}`);
  if (score > 0) lines.push(`   Score: ${score}/100 (${qualityWord(score)})`);
  if (sig.consensus) lines.push(`   Consensus: ${sig.consensus} experts`);
  if (typeof sig.createdAt === "number") lines.push(`   Signal came: ${timeAgo(sig.createdAt)}`);
  lines.push("");

  lines.push(ur ? "📍 PLAN:" : "📍 PLAN:");
  if (sig.entry1) lines.push(`   Entry 1: ${localMoney(sig.entry1)}`);
  if (sig.entry2) lines.push(`   Entry 2: ${localMoney(sig.entry2)}`);
  if (sig.stopLoss) lines.push(`   Stop Loss: ${localMoney(sig.stopLoss)}`);
  if (sig.tp1) lines.push(`   TP1: ${localMoney(sig.tp1)}`);
  if (sig.tp2) lines.push(`   TP2: ${localMoney(sig.tp2)}`);
  if (sig.tp3) lines.push(`   TP3: ${localMoney(sig.tp3)}`);
  lines.push("");

  // ── Live market + status ──
  if (price != null) {
    lines.push(ur ? "📈 ABHI KA MARKET:" : "📈 CURRENT MARKET:");
    lines.push(`   Price: ${localMoney(price)}`);
    lines.push(`   Trend: ${dirLabel} ${bull ? "🟢" : "🔴"}`);
    lines.push("");

    lines.push(ur ? "🚦 STATUS:" : "🚦 STATUS:");
    const e1 = sig.entry1 ?? 0;
    const e2 = sig.entry2 ?? 0;
    const sl = sig.stopLoss ?? 0;
    const tps = [sig.tp1, sig.tp2, sig.tp3].filter((v): v is number => typeof v === "number");

    if (bull) {
      if (e1 && price > e1 && (!e2 || price <= e2)) {
        lines.push(`   ✅ Entry 1 (${localMoney(e1)}) HIT — price is above Entry 1.`);
      } else if (e1 && price < e1) {
        lines.push(`   ⏸️ Price is below Entry 1 (${localMoney(e1)}) — wait for the zone.`);
      } else if (e2 && price > e2) {
        lines.push(`   ⚠️ Price is past Entry 2 (${localMoney(e2)}) — don't chase at the top.`);
      }
      if (sl && price <= sl) {
        lines.push(`   ❌ STOP LOSS BREACHED (${localMoney(sl)}) — do NOT enter this signal.`);
      }
      for (const [i, tp] of tps.entries()) {
        if (price >= tp) lines.push(`   🎯 TP${i + 1} (${localMoney(tp)}) has been reached.`);
      }
    } else {
      if (e1 && price < e1 && (!e2 || price >= e2)) {
        lines.push(`   ✅ Entry 1 (${localMoney(e1)}) HIT — price is below Entry 1.`);
      } else if (e1 && price > e1) {
        lines.push(`   ⏸️ Price is above Entry 1 (${localMoney(e1)}) — wait for the zone.`);
      } else if (e2 && price < e2) {
        lines.push(`   ⚠️ Price is past Entry 2 (${localMoney(e2)}) — don't chase at the bottom.`);
      }
      if (sl && price >= sl) {
        lines.push(`   ❌ STOP LOSS BREACHED (${localMoney(sl)}) — do NOT enter this signal.`);
      }
      for (const [i, tp] of tps.entries()) {
        if (price <= tp) lines.push(`   🎯 TP${i + 1} (${localMoney(tp)}) has been reached.`);
      }
    }
    lines.push("");
  }

  // ── Advice block ──
  lines.push(ur ? "🧠 MERA MASHWARA:" : "🧠 MY TAKE:");
  if (price != null && sig.stopLoss && (bull ? price <= sig.stopLoss : price >= sig.stopLoss)) {
    lines.push(`   The signal is void — price has broken the stop (${localMoney(sig.stopLoss)}). Skip it and look for a fresh setup.`);
  } else if (price != null && sig.entry2 && (bull ? price > sig.entry2 : price < sig.entry2)) {
    const zone = [sig.entry1 ? `Entry 1 (${localMoney(sig.entry1)})` : "", `Entry 2 (${localMoney(sig.entry2)})`].filter(Boolean).join(" or ");
    lines.push(`   Don't enter now — price is outside the zone. Wait for a pullback to ${zone}.`);
  } else if (price != null && sig.entry1 && (bull ? price >= sig.entry1 : price <= sig.entry1)) {
    lines.push(`   The setup is live and price is in the entry zone — keep the SL (${sig.stopLoss ? localMoney(sig.stopLoss) : "as planned"}) and risk only 1-2%.`);
  } else {
    lines.push(`   Watch the plan's levels; enter only when price reaches the zone with confirmation. Keep risk to 1-2%.`);
  }
  lines.push("");

  // ── Risk management reminder ──
  lines.push(ur ? "⚠️ REMINDER:" : "⚠️ REMINDER:");
  lines.push(`   • Risk only 1-2% per trade.\n   • Keep R:R at least 1:2.\n   • Book 50% at TP1, 30% at TP2, trail the rest.\n   • If SL (${sig.stopLoss ? localMoney(sig.stopLoss) : "as planned"}) breaks, exit at once — no revenge trade.`);
  lines.push("");
  lines.push(DISCLAIMER);
  return lines.join("\n");
}


// ── MAIN dispatcher ───────────────────────────────────────────────────────────

/**
 * Answers locally with NO external API. Price + signal discussion do a single
 * Binance fetch; everything else is pure in-memory JS (instant).
 */
export async function generateResponse(
  message: string,
  intent: LocalIntent,
  context: GenerateContext = {},
): Promise<string> {
  const ur = isRomanUrdu(message);
  switch (intent) {
    case "GREETING":
      return greetingReply(ur);
    case "HOW_ARE_YOU":
      return howAreYouReply(ur);
    case "HELP":
    case "UNKNOWN":
      return helpMenu(ur);
    case "PATTERN_QUERY": {
      const words = message.toLowerCase();
      const known = ["triple bottom", "triple top", "head and shoulder", "double bottom", "double top", "engulfing", "doji", "morning star", "evening star"];
      const hit = known.find((p) => words.includes(p));
      return patternExplain(ur, hit ?? "pattern");
    }
    case "INDICATOR_HELP": {
      const words = message.toLowerCase();
      const known = ["rsi", "macd", "ema", "bollinger"];
      const hit = known.find((i) => words.includes(i));
      return indicatorExplain(ur, hit ?? "indicator");
    }
    case "RISK_HELP":
      return riskHelp(ur);
    case "MARKET_OVERVIEW":
      return ur
        ? [
            "🌍 Market Overview",
            "━━━━━━━━━━━━━━━━━━",
            "Live per-coin market view ke liye kisi coin ka analysis maang lein",
            "(jaise \"BTC analysis\" ya \"gold ka scene\").",
            "Yahan main aapko patterns, indicators, aur signals pe madad karta hoon.",
            "",
            DISCLAIMER,
          ].join("\n")
        : [
            "🌍 Market Overview",
            "━━━━━━━━━━━━━━━━━━",
            "For a live per-coin market view, ask for a coin's analysis",
            "(e.g. \"BTC analysis\" or \"gold's scene\").",
            "Here I help you understand patterns, indicators, and signals.",
            "",
            DISCLAIMER,
          ].join("\n");
    case "COIN_PRICE":
      return coinPriceReply(message);
    case "SIGNAL_DISCUSSION":
      return signalDiscussionReply(message, context.signal ?? null);
    case "SIGNAL_QUERY":
    case "COIN_ANALYSIS":
    default:
      // COIN_ANALYSIS / SIGNAL_QUERY need full multi-timeframe engine analysis,
      // which the chat route runs on the paid/engine path. Give a helpful nudge.
      return ur
        ? [
            "Is sawal ke liye main full engine analysis chalaunga. Ek second…",
            "",
            "Tip: aap \"BTC analysis\", \"gold ka scene\", ya \"aaj ke signals\" likh sakte hain.",
            "",
            DISCLAIMER,
          ].join("\n")
        : [
            "Let me run the full engine analysis for this. One moment…",
            "",
            "Tip: you can ask \"BTC analysis\", \"gold's scene\", or \"today's signals\".",
            "",
            DISCLAIMER,
          ].join("\n");
  }
}


