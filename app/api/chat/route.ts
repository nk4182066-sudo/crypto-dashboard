import { cached } from "@/src/lib/cache";
import { callAI, type AIMessage, type AIResult } from "@/src/lib/aiProvider";
import { analyzeSymbol, type AutoAnalysis } from "@/src/lib/autoAnalysis";
import { generateFullSignal } from "@/src/lib/signalGenerator";
import { compactMarketContext, selectTier, systemPromptFor } from "@/src/lib/llm";
import { buildProTraderPrompt } from "@/src/lib/proTraderPrompt";
import { getCachedSnapshot, runScan, type ScanResult, type ScanSnapshot } from "@/src/scanner/scanner";
import { scanUniverse, type ScanMarket } from "@/src/scanner/universe";
import { detectIntent, generateResponse, type DiscussionSignal, type Intent } from "@/src/lib/localAI";

const assistantName = "Muhammad Noman's Assistant AI";
const websiteName = "Trading Student Expert AI";

// ── Masla 21: fast reply cache for common one-off queries (BTC, Gold, ETH…) ──
// Repeats of the same short question are served from memory so the reply comes
// back well under 2s without touching any AI provider. Educational only.
const FAST_QUERY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const fastQueryCache = new Map<string, { reply: string; expires: number }>();

const COMMON_ASSETS = ["btc", "bitcoin", "eth", "ethereum", "gold", "xau", "xauusd"];

/** Returns a cached reply for a repeat common query, or undefined on a miss. */
function getCachedReply(normalizedMessage: string): string | undefined {
  if (!COMMON_ASSETS.some((asset) => normalizedMessage.includes(asset))) return undefined;
  const hit = fastQueryCache.get(normalizedMessage);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    fastQueryCache.delete(normalizedMessage);
    return undefined;
  }
  return hit.reply;
}

/** Stores a reply for a common query so the next identical ask is instant. */
function setCachedReply(normalizedMessage: string, reply: string): void {
  if (!COMMON_ASSETS.some((asset) => normalizedMessage.includes(asset))) return;
  // Bound the cache so it can't grow without limit.
  if (fastQueryCache.size > 200) {
    const oldest = fastQueryCache.keys().next().value;
    if (oldest !== undefined) fastQueryCache.delete(oldest);
  }
  fastQueryCache.set(normalizedMessage, { reply, expires: Date.now() + FAST_QUERY_TTL_MS });
}

const englishGreeting = `Hello! I am ${assistantName} from ${websiteName}. How can I help you with crypto, forex, or stock market analysis today?`;

const systemPrompt = `You are ${assistantName} from ${websiteName} — a friendly, knowledgeable trading assistant who talks like a helpful senior friend, not a robot.

PERSONALITY
- Friendly, warm, and genuinely helpful. Conversational and natural.
- Reply in the SAME language the user writes in: Roman Urdu, English, or Urdu script.
- Never sound scripted. Talk like a real person who knows trading.

NATURAL CONVERSATION (very important)
- If the user asks "How are you?" / "kaise ho?" -> answer naturally first, then offer help. Example (Roman Urdu): "Main bilkul theek hoon, shukriya! Aaj trading mein kya madad karoon?"
- If the user says "Hi" / "Hello" / "Salam" / "Assalam o Alaikum" -> give a warm greeting and ask how you can help. Example: "Assalam-o-Alaikum! Bataiye, aaj kya dekhna chahte hain?"
- NEVER use robotic openers or filler such as:
  - "I understand you're asking about: ..."
  - "I'm a text-only AI assistant"
  - "As an AI language model..."
  Just answer directly and naturally.
- Small talk is fine. Be brief for small talk, detailed only when the user asks for analysis or knowledge.

RULES
- Answer ONLY what the user asked, in their language, and keep it natural.
- Agar user "BTC analysis" bole -> sirf BTC analyze karo.
- Agar user kisi coin ke baare mein pooche (BTC, ETH, Gold) -> app ke diye live data se analysis do (score, trend, support/resistance, setup) aur Roman Urdu mein samjhao.
- Agar user "crypto signal chahiye" / "best setup" bole -> top setups dikhao (app scan se aaye data use karo).
- Agar user trading ka general sawal pooche -> jaise teacher student ko samjhata hai, simple zabaan mein batao.
- Response length: normally under 200 words; go longer only when the user explicitly asks for a full breakdown.

ANALYSIS FORMAT (only when the user asks for analysis):
- Direction (Bullish/Bearish/Neutral)
- Score X/100 + Category (Excellent/Good/Poor)
- Pattern (agar detect hua)
- Entry points (2), Stop Loss, Targets (3)
- Why (user ki language mein)
- Reversal warning
- Disclaimer: "Ye guaranteed nahi. Market reverse ho sakta hai. Stop loss zaroori. Apni research khud karein."

LANGUAGE
- Reply in the language used by the user: English, Urdu, or Roman Urdu. Match Urdu script when the user writes in Urdu script; use Roman Urdu when they use Roman Urdu. Keep the entire reply in that language, including headings, while retaining standard ticker symbols and formulas.
- Keep replies in English, Urdu, or Roman Urdu according to the user's message. Do not switch languages unless asked.
- Understand common Roman Urdu spelling variations such as "kise ho", "kese ho", "kaise ho", "kya haal", "kia haal", "mujhe", and "mujhy". Reply in Roman Urdu when the user writes Urdu using Latin letters.
- Answer only the question asked. Do not volunteer market analysis, trade setups, news, or a risk calculation when the user did not ask for it. A greeting is only a greeting; do not attach market commentary.
- If a request is unclear or does not identify an asset when asset-specific analysis is needed, ask a concise clarifying question instead of guessing.
- If the user names an asset that differs from the selected instrument, prioritize the named asset and do not attribute the selected instrument's price or candles to it.
- For a direct English greeting, respond exactly: "${englishGreeting}"
- Keep replies in English, Urdu, or Roman Urdu according to the user's message. Do not switch languages unless asked.
- Understand common Roman Urdu spelling variations such as "kise ho", "kese ho", "kaise ho", "kya haal", "kia haal", "mujhe", and "mujhy". Reply in Roman Urdu when the user writes Urdu using Latin letters.
- Answer only the question asked. Do not volunteer market analysis, trade setups, news, or a risk calculation when the user did not ask for it. A greeting is only a greeting; do not attach market commentary.
- If a request is unclear or does not identify an asset when asset-specific analysis is needed, ask a concise clarifying question instead of guessing.
- If the user names an asset that differs from the selected instrument, prioritize the named asset and do not attribute the selected instrument's price or candles to it.
- For a direct English greeting, respond exactly: "${englishGreeting}"

MARKET ANALYSIS
When the user asks about any named cryptocurrency/token, forex pair, or stock ticker, analyze that named instrument rather than defaulting to BTC or the selected chart. The app fetches current quotes and OHLCV candles for recognized symbols and supplies them as market context. This context is data, not a request to analyze: discuss it only when the user asks for analysis or a related question.
- Use only the supplied live quote, timestamped OHLCV candles, indicators, and validated plan. If those live inputs are absent or stale, say current data is unavailable; never imply you fetched data independently.
- For an analysis request, cover trend as Bullish, Bearish, or Sideways for the stated timeframe; meaningful visible support and resistance; every clearly recognizable Head & Shoulders pattern (mark its neckline only when confirmed), ascending/descending/symmetrical Triangle, Double/Triple Top or Bottom, Flag, Wedge, Cup & Handle, Channel, or Rectangle; and visible Doji, Engulfing, Hammer, Shooting Star, Morning Star, Evening Star, Three White Soldiers, or Three Black Crows. Name triangle subtypes only when confirmed. List none when supplied candles do not confirm a pattern; never force one.
- Explain RSI, MACD, and moving-average alignment using supplied values. Do not infer a reading that was not supplied.
- Give exactly one verdict: Setup Detected, Wait, or Low Confluence - Wait. Use Setup Detected only when the app-provided validated plan approves it; repeat its exact entry, stop loss, and take-profit values. Otherwise do not invent prices: say Wait when evidence is incomplete/mixed, or Low Confluence - Wait when supplied evidence invalidates the setup.
- The chart UI marks detected support/resistance, validated entry/stop/target levels, recognized pattern outlines, and timestamped candlestick patterns. Do not claim a mark was drawn unless a corresponding chart marker or level is present.
- A 24-hour change alone is short-term context, not proof of a broader trend. Explain uncertainty and the main risk; never promise a profitable outcome.

DATA AND NEWS LIMITS
- You do not have independent browsing, a live price feed, or a live news feed. The app may provide the selected instrument's current price, 24-hour change, and recent OHLC candles when chart data has loaded, but it does not provide news articles unless the user includes them.
- Never present remembered prices, support/resistance, patterns, headlines, or sentiment as current verified facts. Clearly label user-provided or approximate information and its timeframe. For news requests, summarize supplied headlines or articles, separate reported facts from interpretation, and state that you cannot verify live news when no source material is provided. For sentiment requests, use supplied headlines and market context; if only a 24-hour price change is available, describe only tentative short-term price sentiment and say broader sentiment cannot be confirmed from that alone.

RISK CALCULATOR
When the user asks for risk, position sizing, or lot size and calculator values are supplied, calculate and show:
- Risk percentage = risk amount / account balance x 100.
- Reward-to-risk = target profit / risk amount; also express risk:reward as 1:R when the values are valid and positive.
- Check inputs, state the currency assumption, and flag risk amounts that exceed the account balance.
- Do not claim an exact lot size from those three values alone. Exact sizing also requires the instrument, entry price, stop-loss price or stop distance, and the applicable contract size/pip value and account-currency conversion. Once available, show the formula and units: cash risk / (stop distance x value per price unit per lot). For spot crypto or shares, give units/shares as cash risk / (entry-to-stop distance per unit), not forex lots. Round down to the broker's supported size increment when known; state any assumptions.

RESPONSE STYLE
- Be professional, concise, and structured. Separate observed facts, interpretation, and conditional scenarios.
- For numerical recommendations, show the calculation or evidence and use consistent price precision. If required inputs are missing, calculate what is possible and ask only for the missing details; never fill gaps with fabricated data.
- Explain technical words in simple language suitable for a beginner, and briefly teach what evidence supports each conclusion.
- Only present an actionable setup when several independent supplied facts agree and the setup-quality score is at least 80/100. Describe that score as a qualitative model assessment, never as an 80% win probability or a claim of 80% predictive accuracy. If evidence is insufficient, say Wait and explain why.
- Do not state a fixed 20% reversal chance or any other precise market probability unless it comes from a supplied, calibrated statistical source. Never promise profit.
- If app-provided validated trade-plan data says direction is wait, do not suggest a buy/sell, entry, or alternate price levels. If it approves a setup, use its exact entry, stop, target, and quality score; do not invent replacements.
- Before any trade setup, state: "This is not guaranteed. The market can reverse. Always use a stop loss. Never risk more than you can afford to lose." Translate this naturally into the user's language.
- Warn clearly when the planned risk exceeds 10% of the account balance. Encourage independent decisions: "Learn, understand, then trade. Your money, your decision." Translate naturally when needed.
- Do not prescribe leverage without instrument-specific margin rules. Explain that leverage magnifies both gains and losses.
- Include a brief risk disclaimer when discussing a trade setup.`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function buildRiskReward(tradingParams: Record<string, string> | null | undefined) {
  const summary = {
    balance: "Not provided",
    risk: "Not provided",
    lotSize: "Not calculated",
    riskReward: "Not provided",
  };
  const details: string[] = [];
  if (!tradingParams) return { summary, details };

  const balance = Number(tradingParams.accountBalance);
  const risk = Number(tradingParams.riskAmount);
  const target = Number(tradingParams.targetProfit);
  const entry = Number(tradingParams.entryPrice);
  const stop = Number(tradingParams.stopLossPrice);
  const valuePerPriceUnitPerLot = Number(tradingParams.valuePerPriceUnitPerLot);
  const validBalance = Number.isFinite(balance) && balance > 0;
  const validRisk = Number.isFinite(risk) && risk > 0;

  if (validBalance) summary.balance = `$${balance.toFixed(2)}`;
  if (validRisk) summary.risk = `$${risk.toFixed(2)}${validBalance ? ` (${(risk / balance * 100).toFixed(2)}%)` : ""}`;
  if (validBalance && validRisk) {
    details.push(`Account balance: $${balance.toFixed(2)}; risk: $${risk.toFixed(2)} (${(risk / balance * 100).toFixed(2)}%).`);
    if (risk > balance) details.push("Warning: risk amount exceeds account balance.");
    if (risk / balance > 0.1) details.push("High-risk warning: this trade risks more than 10% of account balance.");
  }
  if (validRisk && Number.isFinite(target) && target > 0) {
    const ratio = target / risk;
    summary.riskReward = `1:${ratio.toFixed(2)}`;
    details.push(`Target reward-to-risk is 1:${ratio.toFixed(2)}.`);
  }

  const stopDistance = Math.abs(entry - stop);
  if (validRisk && Number.isFinite(entry) && entry > 0 && Number.isFinite(stop) && stop > 0 && stopDistance > 0) {
    if (tradingParams.sizeMode === "units") {
      const units = risk / stopDistance;
      summary.lotSize = `${units.toFixed(8)} units/shares`;
      details.push(`Position size: ${summary.lotSize}, calculated as cash risk / entry-to-stop distance.`);
    } else if (Number.isFinite(valuePerPriceUnitPerLot) && valuePerPriceUnitPerLot > 0) {
      const lots = risk / (stopDistance * valuePerPriceUnitPerLot);
      summary.lotSize = `${lots.toFixed(8)} lots`;
      details.push(`Position size: ${summary.lotSize}, calculated as cash risk / (stop distance x value per 1.00 price move per lot).`);
    } else {
      summary.lotSize = "Needs contract value per lot";
    }
  } else if (validRisk) {
    summary.lotSize = "Needs entry and stop loss";
  }

  return { summary, details };
}

/**
 * Model replies must be prose — strip raw OHLCV dumps such as
 * `1788960600:331.69,332.1,330.9,331.8,1234` that the model sometimes echoes
 * back from the appended market context. Timestamps are 10-13 digits, so this
 * never touches times like 12:30 or plain prices.
 */
function toTextOnly(text: string): string {
  return text
    .replace(/\b\d{10,13}\s*:\s*\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)+/g, " ")
    .replace(/\b\d{10,13}\s*:\s*\d+(?:\.\d+)?/g, " ")
    .replace(/(?:\s*\|\s*)+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Task 2: auto-search — when the user asks for a trade/setup, scan the market ──
// Returns a formatted reply with the top 80+ confluence setups in the user's
// language, or null when the message isn't a trade-seeking request.
const AUTO_SEARCH_HINTS = [
  "trade", "setup", "signal", "chahiye", "dhundho", "dhoondo", "dhondo",
  "buy", "sell", "entry", "best", "acha setup", "acha trade", "kya lein",
  "what should i", "find me", "scan", "opportunit",
];
const AUTO_SEARCH_MARKETS: Array<{ market: ScanMarket; words: string[] }> = [
  { market: "crypto", words: ["crypto", "btc", "bitcoin", "eth", "ethereum", "coin"] },
  { market: "metals", words: ["gold", "metal", "xau", "silver", "copper", "sona"] },
  { market: "forex", words: ["forex", "eur", "usd", "gbp", "jpy", "pair", "currency"] },
  { market: "stocks", words: ["stock", "stocks", "equity", "aapl", "tsla", "nasdaq", "shares"] },
];

const ROMAN_URDU_MARKERS = [
  "chahiye", "dhoondo", "dhundho", "dhondo", "do", "batao", "kya", "kaisa",
  "kaisay", "acha", "theek", "lekin", "nahi", "hai", "karo", "mujhe", "abhi",
];

function detectAutoSearch(message: string): { wants: boolean; market: ScanMarket | null; romanUrdu: boolean } {
  const lower = ` ${message.toLowerCase()} `;
  const wants = AUTO_SEARCH_HINTS.some((hint) => lower.includes(hint));
  if (!wants) return { wants: false, market: null, romanUrdu: false };

  const market = AUTO_SEARCH_MARKETS.find((m) => m.words.some((w) => lower.includes(w)))?.market ?? null;
  const romanUrdu = ROMAN_URDU_MARKERS.some((m) => lower.includes(m));
  return { wants: true, market, romanUrdu };
}

function directionLabel(direction: ScanResult["direction"]): string {
  return direction === "buy" ? "Bullish (Buy)" : direction === "sell" ? "Bearish (Sell)" : "Neutral (Wait)";
}

function formatAutoSearchReply(top: ScanResult[], market: ScanMarket | null, romanUrdu: boolean): string {
  const marketLabel = market ? market.toUpperCase() : "MARKET";
  const lines: string[] = [];

  if (romanUrdu) {
    lines.push(`Bhai, maine ${marketLabel} scan kiya. Ye best setups hain:\n`);
    top.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.label} — Score ${Math.round(r.confidence)}/100 🏆 Excellent`);
      lines.push(`   Direction: ${directionLabel(r.direction)}`);
      lines.push(`   Current Price: ${r.price.toFixed(2)}`);
      lines.push(`   Reason: ${r.reason}`);
      lines.push(`   Setup Detected\n`);
    });
    lines.push("⚠️ Ye sirf educational analysis hai. Ye financial advice nahi. Apni research zaroor karein.");
  } else {
    lines.push(`I scanned ${marketLabel}. These are the strongest setups right now:\n`);
    top.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.label} — Score ${Math.round(r.confidence)}/100 🏆 Excellent`);
      lines.push(`   Direction: ${directionLabel(r.direction)}`);
      lines.push(`   Current Price: ${r.price.toFixed(2)}`);
      lines.push(`   Reason: ${r.reason}`);
      lines.push(`   Setup Detected\n`);
    });
    lines.push("⚠️ Educational analysis only. Not financial advice. Always do your own research.");
  }

  return lines.join("\n");
}

function formatNoSetupReply(market: ScanMarket | null, romanUrdu: boolean): string {
  const marketLabel = market ? market.toUpperCase() : "market";
  return romanUrdu
    ? `Bhai, abhi koi high-confluence setup nahi hai ${marketLabel === "MARKET" ? "" : `${marketLabel} mein`}. Market mein sabr karein, 5 minute baad check karein. ⚠️ Educational analysis only.`
    : `There is no high-confluence setup right now${market === null ? "" : ` in ${market}`}. Wait and check back in 5 minutes. ⚠️ Educational analysis only. Not financial advice.`;
}

/** Builds the auto-search reply, or null if this isn't a trade-seeking message. */
async function getAutoSearchReply(message: string): Promise<string | null> {
  const { wants, market, romanUrdu } = detectAutoSearch(message);
  if (!wants) return null;

  const targets = market ? scanUniverse.filter((t) => t.market === market) : scanUniverse;

  // Prefer the pre-computed snapshot; fall back to a fresh scan of that market.
  let snapshot = getCachedSnapshot();
  if (!snapshot) {
    try {
      snapshot = await runScan(targets);
    } catch (error) {
      console.error("Auto-search scan failed:", error);
    }
  }

  let pool = snapshot?.results ?? [];
  if (market) pool = pool.filter((r) => r.market === market);
  if (pool.length === 0) {
    // Snapshot may be for a different market subset — scan the requested market directly.
    try {
      const fresh = await runScan(targets);
      pool = market ? fresh.results.filter((r) => r.market === market) : fresh.results;
    } catch (error) {
      console.error("Auto-search fallback scan failed:", error);
    }
  }

  const top = pool
    .filter((r) => r.confidence >= 80)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  if (top.length === 0) return formatNoSetupReply(market, romanUrdu);
  return formatAutoSearchReply(top, market, romanUrdu);
}

export async function POST(request: Request) {
  try {
    const { message, marketContext, tradingParams, history, signalContext } = await request.json();

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const normalizedMessage = message.trim().toLowerCase().replace(/[!?.،؟,]+/g, " ").replace(/\s+/g, " ").trim();
    const compactMessage = normalizedMessage.replace(/[^a-z\u0600-\u06ff]/g, "");
    const englishGreetingOnly = /^(hi|hello|hey)( there)?$/.test(normalizedMessage);
    const urduScriptGreetingOnly = /^(السلامعلیکم|السلامعليكم|سلام|ہیلو)$/.test(compactMessage);
    const romanUrduGreetingOnly = [
      "salam", "assalamualaikum", "assalaamualaikum", "asalaamualaikum",
      "kaiseho", "keseho", "kesyho", "kesiho", "kiseho", "kaisayho",
      "kya haal", "kia haal", "kya haal hai", "kia haal hai",
    ].some((greeting) => greeting.replace(/\s/g, "") === compactMessage);
    const romanUrduHowAreYou = /^(kaise|kese|kesy|kesi|kise|kaisay)ho$|^(kya|kia)haal(hai)?$/.test(compactMessage);

    // MASLA 1 — greetings also go through the real AI so the reply feels
    // natural. The canned lines below are only the fallback when every
    // provider fails.
    const greetingOnly = englishGreetingOnly || urduScriptGreetingOnly || romanUrduGreetingOnly || romanUrduHowAreYou;
    const greetingFallback = urduScriptGreetingOnly
        ? "السلام علیکم! میں محمد نومان کا اسسٹنٹ AI ہوں، Trading Student Expert AI کی جانب سے۔ میں کرپٹو، فاریکس، یا اسٹاک مارکیٹ کے تجزیے میں آپ کی کیا مدد کر سکتا ہوں؟"
        : englishGreetingOnly
          ? englishGreeting
          : romanUrduHowAreYou
            ? "Main theek hoon, shukriya! Main Muhammad Noman's Assistant AI hoon. Crypto, forex, ya stock market ke hawale se aapki kya madad karoon?"
            : greetingOnly
            ? "Assalam-o-alaikum! Main Muhammad Noman's Assistant AI hoon, Trading Student Expert AI ki taraf se. Crypto, forex, ya stock market analysis mein aapki kya madad kar sakta hoon?"
            : null;

    // MASLA 3 — sanitize the client's signal payload so the teacher prompt
    // only ever carries discussion-relevant fields.
    const signalData = sanitizeSignalContext(signalContext);

    // ── LOCAL SMART AI (no API keys) — fast primary path ──────────────────────
    // Knowledge intents + greetings + live price + signal discussion are all
    // answered locally in <5ms (price/ discussion do one Binance fetch). This
    // runs BEFORE any paid provider so the chat is instant and key-free.
    const localIntent: Intent = detectIntent(String(message));
    const LOCAL_FIRST: Intent[] = [
      "GREETING",
      "HOW_ARE_YOU",
      "PATTERN_QUERY",
      "INDICATOR_HELP",
      "RISK_HELP",
      "MARKET_OVERVIEW",
      "COIN_PRICE",
      "SIGNAL_DISCUSSION",
      "HELP",
    ];
    if (LOCAL_FIRST.includes(localIntent)) {
      const localReply = await generateResponse(String(message), localIntent, {
        signal: (signalData as DiscussionSignal | null) ?? null,
        // coinPriceReply needs the origin to reach /api/market/history (quoteOnly)
        // for forex/metals/stocks rates — a bare relative fetch has no base here.
        origin: new URL(request.url).origin,
      });
      return Response.json({ reply: localReply, provider: "local" });
    }

    // Masla 21 — serve repeat common queries (BTC, Gold, ETH…) from cache.
    // Signal discussions are never cached — every answer is signal-specific.
    if (!signalData) {
      const cachedReply = getCachedReply(normalizedMessage);
      if (cachedReply) {
        return Response.json({ reply: cachedReply });
      }
    }

    // Task 2 — if the user is asking for a trade/setup, scan the market directly
    // and reply with the top 80+ confluence setups (no AI call needed).
    if (!greetingOnly && !signalData) {
      const autoSearchReply = await getAutoSearchReply(String(message));
      if (autoSearchReply) {
        setCachedReply(normalizedMessage, autoSearchReply);
        return Response.json({ reply: autoSearchReply });
      }
    }

    // Multi-provider AI call (text-only, no image analysis)
    const tier = selectTier(String(message), false);

    let userMessage = message;

    // Feature 4 — trim the market context before it is sent to the model.
    if (marketContext) {
      let contextText = typeof marketContext === "string" ? marketContext : JSON.stringify(marketContext);
      if (!isRecord(marketContext) && typeof marketContext === "object" && marketContext !== null) {
        contextText = JSON.stringify(compactMarketContext(marketContext as Record<string, unknown>));
      }
      userMessage += `\n\nApp-provided market context (use only if the user's question is about it):\n${contextText}`;
    }

    // MASLA 3 — signal discussion: frame the question as a teacher request.
    if (signalData) {
      const signalSymbol = typeof signalData.symbol === "string" ? signalData.symbol : "unknown";
      userMessage = `I want to discuss my latest trading signal (${signalSymbol}). My question: ${String(message)}`;
    }

    // MASLA 4 — live engine analysis for any detected asset (BTC, DOGE, SOL…)
    // so the AI answers with REAL numbers instead of generalities.
    if (!greetingOnly && !signalData) {
      const assetMention = detectAssetSymbol(String(message));
      if (assetMention) {
        const liveContext = await getLiveAssetContext(assetMention, new URL(request.url).origin);
        if (liveContext) {
          userMessage += `\n\nLIVE ENGINE DATA for ${assetMention.label} (use these REAL numbers in your reply; never invent prices):\n${liveContext}`;
        }
      }
    }

    const asksForSizing = /\b(risk|position size|position sizing|lot size|lots|sizing)\b|رسک|لاٹ سائز|پوزیشن سائز/i.test(message);
    const riskReward = buildRiskReward(tradingParams);
    if (asksForSizing && riskReward.details.length) {
      userMessage += `\n\nVerified calculator results (USD inputs; use these figures exactly and explain in the user's language): ${riskReward.details.join(" ")}`;
    }

    // Multi-provider history: OpenAI-style role/content, last 3 turns only
    // (kept short so the reply streams back fast — Masla 21).
    const priorMessages: AIMessage[] = Array.isArray(history)
      ? history.slice(-3).flatMap((item: unknown) => {
          if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
          return [{
            role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: item.content.slice(0, 1200),
          }];
        })
      : [];

    const baseSystem = tier === "deep"
      ? `${buildProTraderPrompt()}\n\n${systemPrompt}`
      : systemPromptFor(tier, systemPrompt, englishGreeting);
    const systemContent = signalData
      ? `${baseSystem}\n\n${SIGNAL_TEACHER_PROMPT}\n\nSIGNAL DATA (JSON):\n${JSON.stringify(signalData)}`
      : baseSystem;

    const messages: AIMessage[] = [
      { role: "system", content: systemContent },
      ...priorMessages,
      { role: "user", content: userMessage },
    ];

    let result: AIResult;
    try {
      // Masla 21 — hard 10s ceiling so the reply never hangs the chat UI.
      result = await Promise.race([
        callAI(messages),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("CHAT_TIMEOUT")), 10000)
        ),
      ]);
    } catch (error) {
      const messageErr = error instanceof Error ? error.message : "unknown error";
      if (messageErr === "ALL_PROVIDERS_EXHAUSTED" || messageErr === "CHAT_TIMEOUT") {
        // MASLA 1/3 — honest fallbacks, never a generic "service busy" reply
        // for greetings or signal discussions.
        if (greetingFallback) return Response.json({ reply: greetingFallback });
        const fallback = signalData
          ? buildSignalFallbackReply(signalData, String(message))
          // ORIGINAL message, not the enriched userMessage: userMessage carries
          // the injected "LIVE ENGINE DATA (RSI: …)" block, which made
          // generalKnowledgeReply() misfire on "RSI" and answer BTC/GOLD asset
          // questions with the RSI explainer on live (no-AI-key) deployments.
          : await getRuleBasedFallback(String(message), tier, marketContext, riskReward, new URL(request.url).origin);
        if (!signalData) setCachedReply(normalizedMessage, fallback);
        return Response.json({ reply: fallback });
      }
      console.error("Error in chat API:", error);
      return Response.json({ error: "Failed to process message" }, { status: 500 });
    }

    const aiResponse = toTextOnly(result.text);
    const reply = aiResponse || "Sorry, mujhe theek se samajh nahi aaya. Aap thoda aur detail mein poochh lein — main crypto, forex, stocks aur metals analysis aur trading concepts mein madad kar sakta hoon.";
    if (!signalData) setCachedReply(normalizedMessage, reply);
    return Response.json({ reply });
  } catch (error) {
    console.error("Error in chat API:", error);
    return Response.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}

// ── Masla 1 — rich rule-based analysis fallback (runs when all AI providers fail) ──

/** One recognized asset the assistant can analyze by keyword. */
interface AssetTarget {
  symbol: string; // format the /api/market/history route understands
  market: "crypto" | "metals" | "forex" | "stocks";
  label: string; // shown in the reply, e.g. "Gold (XAU/USD)"
  name: string; // short name for prose, e.g. "Gold"
}

/** Keyword → asset. Ordered so specific names win over generic tokens. */
const FALLBACK_ASSETS: Array<{ test: RegExp; asset: AssetTarget }> = [
  { test: /\b(gold|xau|xauusd|sona)\b/, asset: { symbol: "XAU-USD", market: "metals", label: "Gold (XAU/USD)", name: "Gold" } },
  { test: /\b(silver|xag|xagusd)\b/, asset: { symbol: "XAG-USD", market: "metals", label: "Silver (XAG/USD)", name: "Silver" } },
  { test: /\b(btc|bitcoin)\b/, asset: { symbol: "BTC-USD", market: "crypto", label: "Bitcoin (BTC/USD)", name: "Bitcoin" } },
  { test: /\b(eth|ethereum)\b/, asset: { symbol: "ETH-USD", market: "crypto", label: "Ethereum (ETH/USD)", name: "Ethereum" } },
  { test: /\b(sol|solana)\b/, asset: { symbol: "SOL-USD", market: "crypto", label: "Solana (SOL/USD)", name: "Solana" } },
  { test: /\b(eur|euro)\b/, asset: { symbol: "EURUSD=X", market: "forex", label: "EUR/USD", name: "EUR/USD" } },
  { test: /\b(gbp|pound)\b/, asset: { symbol: "GBPUSD=X", market: "forex", label: "GBP/USD", name: "GBP/USD" } },
];

/** Detects which asset (if any) the message is asking about. */
function detectAssetSymbol(message: string): AssetTarget | null {
  const lower = ` ${message.toLowerCase()} `;
  const mapped = FALLBACK_ASSETS.find((entry) => entry.test.test(lower))?.asset;
  if (mapped) return mapped;

  // MASLA 4 — resolve ANY tracked coin (DOGE, XRP, ADA, SHIB…) against the
  // scanner universe so every coin in the app gets real analysis from chat.
  const words = lower.split(/[^a-z0-9]+/).filter((word) => word.length >= 2);
  for (const word of words) {
    const hit = scanUniverse.find((target) => {
      const base = target.symbol.toLowerCase().replace(/[-=].*$/, "");
      return base === word || target.label.toLowerCase() === word;
    });
    if (hit) {
      return { symbol: hit.symbol, market: hit.market, label: `${hit.label} (${hit.symbol})`, name: hit.label };
    }
  }
  return null;
}

// ── MASLA 4 — live engine analysis injected into the AI prompt ────────────────

/** Per-symbol cache so repeat coin questions don't refetch 4 timeframes. */
const LIVE_TTL_MS = 2 * 60 * 1000;
const liveAnalysisCache = new Map<string, { data: string; expires: number }>();

/** Compact real-data block for the model, or null when candles are unavailable. */
async function getLiveAssetContext(asset: AssetTarget, origin?: string): Promise<string | null> {
  const hit = liveAnalysisCache.get(asset.symbol);
  if (hit && Date.now() < hit.expires) return hit.data;

  let analysis: AutoAnalysis;
  try {
    analysis = await analyzeSymbol(asset.symbol, asset.market, origin);
  } catch (error) {
    console.error(`Live context failed for ${asset.symbol}:`, error);
    return null;
  }
  if (!Number.isFinite(analysis.current) || analysis.current <= 0) return null;

  const patterns = analysis.patterns.slice(0, 2).map((p) => `${p.name} (${p.type}, ${p.confidence}%)`).join(", ") || "none";
  const data = [
    `Asset: ${asset.label} (${asset.symbol})`,
    `Current price: ${analysis.current}`,
    `Trend: ${analysis.trend} | Timeframe alignment: ${analysis.timeframeAlignment}`,
    `RSI: ${analysis.indicators.rsi} | MACD: ${analysis.indicators.macd} | SMA: ${analysis.indicators.sma} | Volume: ${analysis.indicators.volume}`,
    `Support: ${analysis.support} | Resistance: ${analysis.resistance}`,
    `Recent patterns: ${patterns}`,
    `Engine score: ${analysis.score}/100 | Verdict: ${analysis.verdict} | Risk: ${analysis.riskLevel}`,
  ].join("\n");

  if (liveAnalysisCache.size > 20) {
    const oldest = liveAnalysisCache.keys().next().value;
    if (oldest !== undefined) liveAnalysisCache.delete(oldest);
  }
  liveAnalysisCache.set(asset.symbol, { data, expires: Date.now() + LIVE_TTL_MS });
  return data;
}

// ── MASLA 3 — signal discussion (teacher mode) ────────────────────────────────

/** Teacher-mode system instructions appended when the user discusses a signal. */
const SIGNAL_TEACHER_PROMPT = `SIGNAL DISCUSSION MODE — tum aik experienced trading teacher ho.
User apne latest trading signal ke baare mein pooch raha hai. Neeche poora signal data JSON mein diya gaya hai.

A TO Z EXPLAIN KARO (jis pe poochha jaye):
- Pattern kya hai aur chart pe kaise bana
- Entry kab leni chahiye (entry1 / entry2 dono ka farq)
- SL kyun wahan rakha hai (kitna % risk hai)
- TP1/TP2/TP3 kyun wahan hain (har target ka logic)
- Risk kitna hai aur position size kaise nikaalein
- Trade fail ho jaye to kya karna hai (SL hit hone pe revenge trade nahi)
- Kab exit karna chahiye (partial profits, breakeven, trailing)
- Kya galat ho sakta hai (honest bear case)

RULES:
- Roman Urdu + English mix — user ki language match karo.
- HONEST raho: agar signal weak hai (score < 75, consensus 2/4 ya us se kam, indicators against) to clearly bolo aur wajah do. Kabhi force mat karo.
- Sirf isi signal ke levels use karo; agar LIVE ENGINE DATA bhi diya ho to current price zaroor mention karo aur batao price ab entry/SL/target se kahan hai.
- Short sawal ka chhota jawab do; "full analysis" pe detailed A→Z breakdown.
- Educational only — not financial advice. Guarantee kabhi mat do.`;

/** Keeps only discussion-relevant fields of the client's signal payload. */
function sanitizeSignalContext(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const num = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 220) : undefined;

  const signal: Record<string, unknown> = {};
  const put = (key: string, value: unknown): void => {
    if (value !== undefined) signal[key] = value;
  };

  put("symbol", str(raw.symbol));
  put("market", str(raw.market));
  put("timeframe", str(raw.timeframe));
  put("score", num(raw.score));
  put("direction", str(raw.direction));
  put("bias", str(raw.bias));
  put("trend", str(raw.trend));
  put("pattern", str(raw.pattern));
  put("chartPattern", str(raw.chartPattern));
  put("chartPatternNote", str(raw.chartPatternNote));
  put("candlestick", str(raw.candlestickPattern) ?? str(raw.candlestick));
  put("price", num(raw.price) ?? num(raw.currentPrice));
  put("entry1", num(raw.entry1));
  put("entry2", num(raw.entry2));
  put("stopLoss", num(raw.stopLoss) ?? num(raw.SL));
  put("tp1", num(raw.tp1));
  put("tp2", num(raw.tp2));
  put("tp3", num(raw.tp3));
  put("support", num(raw.support));
  put("resistance", num(raw.resistance));
  put("consensus", str(raw.consensus));
  put("reasoning", str(raw.reasoning) ?? str(raw.reason));
  put("status", str(raw.status));
  put("createdAt", num(raw.createdAt));

  // 4-educator panel — role + verdict only (keeps the prompt small).
  if (isRecord(raw.experts) && Array.isArray(raw.experts.educators)) {
    signal.educators = (raw.experts.educators as unknown[]).slice(0, 4).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const role = str(entry.role) ?? str(entry.name);
      const verdict = str(entry.verdict);
      if (!role && !verdict) return [];
      return [{ ...(role ? { role } : {}), ...(verdict ? { verdict } : {}) }];
    });
  }

  // RSI / MACD / EMA / Volume confirmation rows — name + verdict only.
  if (isRecord(raw.confirmations) && Array.isArray(raw.confirmations.indicators)) {
    signal.indicators = (raw.confirmations.indicators as unknown[]).slice(0, 6).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const name = str(entry.name);
      const signalText = str(entry.signalText) ?? str(entry.value);
      if (!name) return [];
      return [{ name, ...(signalText ? { signal: signalText } : {}) }];
    });
  }

  return Object.keys(signal).length >= 2 ? signal : null;
}

/** Honest, data-driven reply used only when every AI provider failed mid-discussion. */
function buildSignalFallbackReply(signal: Record<string, unknown>, message: string): string {
  const str = (key: string): string | null => (typeof signal[key] === "string" ? signal[key] : null);
  const num = (key: string): number | null =>
    typeof signal[key] === "number" && Number.isFinite(signal[key]) ? (signal[key] as number) : null;

  const symbol = str("symbol") ?? "Signal";
  const pattern = str("chartPattern") ?? str("pattern") ?? "No clear pattern";
  const score = num("score");
  const consensus = str("consensus");
  const direction = str("bias") ?? str("trend") ?? str("direction") ?? "—";
  const price = num("price");
  const entry1 = num("entry1");
  const entry2 = num("entry2");
  const sl = num("stopLoss");
  const tp1 = num("tp1");
  const tp2 = num("tp2");
  const tp3 = num("tp3");
  const support = num("support");
  const resistance = num("resistance");
  const status = str("status");

  const fmt = (value: number | null): string =>
    value === null ? "—" : value >= 1000 ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${value.toFixed(value >= 1 ? 2 : 4)}`;

  const weak = (score !== null && score < 75) || (consensus !== null && parseInt(consensus, 10) < 3);
  const asksRisk = /\b(risk|sl|stop|loss|fail|wrong|invalid)\b/i.test(message);
  const asksExit = /\b(exit|target|tp|profit|close)\b/i.test(message);

  const lines: string[] = [];
  lines.push(`🎯 ${symbol} — Saved Signal Plan (engine data):`);
  lines.push(`Direction: ${direction} | Pattern: ${pattern}${score !== null ? ` | Score: ${score}/100` : ""}${consensus ? ` | Consensus: ${consensus}` : ""}`);
  if (price !== null) lines.push(`Price at signal: ${fmt(price)}${status ? ` | Status: ${status}` : ""}`);
  lines.push(`Entry: ${fmt(entry1)} / ${fmt(entry2)}`);
  lines.push(`Stop Loss: ${fmt(sl)} | Targets: ${fmt(tp1)} → ${fmt(tp2)} → ${fmt(tp3)}`);
  if (support !== null || resistance !== null) lines.push(`Support: ${fmt(support)} | Resistance: ${fmt(resistance)}`);
  lines.push("");
  if (asksRisk) {
    lines.push(weak
      ? "⚠️ Honest risk view: ye signal weak side pe hai (score/consensus kam hai). Risk zyada hai — chhota position size ya wait behtar."
      : "Risk plan ke hisaab se controlled hai agar SL per trade rakha jaye. 1% rule follow karein.");
  } else if (asksExit) {
    lines.push("Exit plan: TP1 pe partial profit, SL move to breakeven, phir TP2/TP3 trailing. SL hit ho jaye to exit — revenge trade nahi.");
  } else {
    lines.push(weak
      ? "⚠️ Honest take: ye signal weak hai (score ya consensus target se neeche). Confirm hone tak wait karein."
      : "Signal structure theek hai, lekin confirmation ka intezaar karein aur SL zaroor rakhein.");
  }
  lines.push("");
  lines.push("⚠️ AI providers abhi available nahi the — ye jawab sirf saved signal data se bana hai, levels khud chart pe verify karein. Educational only, not financial advice.");
  return lines.join("\n");
}

/** $2,340 / $1.0850 style money for the fallback reply. */
function money(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

/** Score badge label matching the signals/results pages. */
function scoreTierLabel(score: number): string {
  if (score >= 90) return "🏆 Excellent";
  if (score >= 75) return "⭐ Very Good";
  if (score >= 60) return "👍 Good";
  return "🔍 Developing";
}

function rsiWord(rsi: number): string {
  if (rsi >= 70) return "overbought";
  if (rsi <= 30) return "oversold";
  return "healthy";
}

type RuleBasedFallbackData = { summary: Record<string, string>; details: string[] };

/** Short bilingual "why" line built from the real indicator readings. */
function whyTrendLine(asset: AssetTarget, analysis: AutoAnalysis, romanUrdu: boolean): string {
  const trend = analysis.trend;
  if (romanUrdu) {
    const trendWord = trend === "bullish" ? "uptrend" : trend === "bearish" ? "downtrend" : "range";
    const level = trend === "bullish" ? "Support hold hua." : trend === "bearish" ? "Resistance ke paas selling pressure hai." : "Price abhi range mein hai.";
    const volume = analysis.indicators.volume === "above average" ? "Volume average se upar hai." : "Volume normal hai.";
    return `${asset.name} ${trendWord} mein hai. ${level} ${volume} RSI ${analysis.indicators.rsi} ${rsiWord(analysis.indicators.rsi)} hai. MACD ${analysis.indicators.macd} hai.`;
  }
  const trendWord = trend === "bullish" ? "an uptrend" : trend === "bearish" ? "a downtrend" : "a range";
  const level = trend === "bullish" ? "Support held." : trend === "bearish" ? "Selling pressure near resistance." : "Price is ranging.";
  const volume = analysis.indicators.volume === "above average" ? "Volume is above average." : "Volume is normal.";
  return `${asset.name} is in ${trendWord}. ${level} ${volume} RSI ${analysis.indicators.rsi} is ${rsiWord(analysis.indicators.rsi)}. MACD is ${analysis.indicators.macd}.`;
}

/** Full A→Z analysis from real data: score, levels, pattern, and a full trade plan. */
async function buildFullAnalysisReply(asset: AssetTarget, romanUrdu: boolean, origin?: string): Promise<string | null> {
  let analysis: AutoAnalysis;
  try {
    analysis = await analyzeSymbol(asset.symbol, asset.market, origin);
  } catch (error) {
    console.error("Fallback analysis failed:", error);
    return null;
  }
  // No candles / no price -> nothing honest to show.
  if (!Number.isFinite(analysis.current) || analysis.current <= 0) return null;

  const direction = analysis.trend === "bullish" || analysis.trend === "bearish" ? analysis.trend : "neutral";
  const topPattern = analysis.patterns[0]?.name ?? "No clear pattern";
  const full = generateFullSignal({
    symbol: asset.symbol,
    market: asset.market,
    price: analysis.current,
    direction,
    support: analysis.support,
    resistance: analysis.resistance,
    pattern: topPattern,
    score: analysis.score,
  });

  const trendLabel = analysis.trend === "bullish" ? "Bullish" : analysis.trend === "bearish" ? "Bearish" : "Sideways";
  const lines: string[] = [];
  lines.push(`${asset.label} Analysis:`);
  lines.push("");
  lines.push(`📊 Score: ${analysis.score}/100 ${scoreTierLabel(analysis.score)}`);
  lines.push(`📈 Trend: ${trendLabel}`);
  lines.push(`🎯 Support: ${money(analysis.support)}`);
  lines.push(`🎯 Resistance: ${money(analysis.resistance)}`);
  lines.push(`📊 Pattern: ${topPattern}`);
  lines.push("");
  lines.push(`Entry 1: ${money(full.entry1)}`);
  lines.push(`Entry 2: ${money(full.entry2)}`);
  lines.push(`SL: ${money(full.stopLoss)}`);
  lines.push(`TP1: ${money(full.tp1)}`);
  lines.push(`TP2: ${money(full.tp2)}`);
  lines.push(`TP3: ${money(full.tp3)}`);
  lines.push("");
  lines.push(`🎓 Why ${trendLabel}:`);
  lines.push(whyTrendLine(asset, analysis, romanUrdu));
  lines.push("");
  lines.push("⚠️ Educational only. Not financial advice.");
  return lines.join("\n");
}


/** Short bilingual explainers for common trading-concept questions. */
function generalKnowledgeReply(message: string, romanUrdu: boolean): string | null {
  const lower = message.toLowerCase();
  const has = (needle: RegExp) => needle.test(lower);

  if (has(/\brsi\b/)) {
    return romanUrdu
      ? "RSI (Relative Strength Index) momentum measure hai 0 se 100. 70+ ka matlab overbought (price bohat upar, pullback ka risk), 30- ka matlab oversold (bounce aa sakta hai). 50 se upar bullish, neeche bearish maana jata hai. ⚠️ Educational only."
      : "RSI (Relative Strength Index) is a momentum gauge from 0 to 100. Above 70 = overbought (price ran up, pullback risk); below 30 = oversold (a bounce can come). Above 50 is bullish, below 50 bearish. ⚠️ Educational only.";
  }
  if (has(/\bmacd\b/)) {
    return romanUrdu
      ? "MACD trend + momentum dikhata hai. Jab MACD line signal line ko neeche se upar cross kare → bullish cross. Upar se neeche → bearish cross. Histogram ki height momentum ki taqat batati hai. ⚠️ Educational only."
      : "MACD shows trend + momentum. When the MACD line crosses above the signal line → bullish cross. Crossing below → bearish cross. The histogram height shows momentum strength. ⚠️ Educational only.";
  }
  if (has(/\b(pattern|candlestick|candle|pehchan|identify)\b/)) {
    return romanUrdu
      ? "Pattern pehchanne ke liye: Double Bottom (W) — do barabar lows, upar neckline. Head & Shoulders — teen peaks, beech ka sab se ooncha. Engulfing — ek bari candle pichli choti ko cover kare. Hammer — neeche lambi wick, bottom pe bounce. Hamesha volume + support/resistance se confirm karein. ⚠️ Educational only."
      : "To spot patterns: Double Bottom (W) — two equal lows with a neckline above. Head & Shoulders — three peaks, the middle one highest. Engulfing — a large candle fully covers the prior small one. Hammer — long lower wick, a bounce at the bottom. Always confirm with volume + support/resistance. ⚠️ Educational only.";
  }
  if (has(/\bsupport\b/)) {
    return romanUrdu
      ? "Support woh price level hai jahan buying aati hai aur price neeche na girta. Buyers yahan active hote hain. Jab support toot jaye to wo resistance ban jata hai. ⚠️ Educational only."
      : "Support is the price level where buying interest stops a fall. Buyers become active there. Once broken, support often turns into resistance. ⚠️ Educational only.";
  }
  if (has(/\bresistance\b/)) {
    return romanUrdu
      ? "Resistance woh price level hai jahan selling aati hai aur price upar na ja pata. Sellers yahan active hote hain. Jab resistance toot jaye to wo support ban jata hai. ⚠️ Educational only."
      : "Resistance is the price level where selling pressure caps a rally. Sellers become active there. Once broken, resistance often turns into support. ⚠️ Educational only.";
  }
  if (has(/\b(stop ?loss|sl|risk)\b/)) {
    return romanUrdu
      ? "Stop loss ek fixed price hai jahan aap trade khud band kar dete taake loss control mein rahe. Har trade pe 1-2% se zyada risk na lein. Bina SL ke trade lena sab se bara ghalti hai. ⚠️ Educational only."
      : "A stop loss is a set price where you exit so the loss stays controlled. Risk only 1-2% per trade. Trading without a stop loss is the biggest mistake. ⚠️ Educational only.";
  }
  if (has(/\b(trend|uptrend|downtrend)\b/)) {
    return romanUrdu
      ? "Trend market ki overall direction hai. Uptrend = higher highs + higher lows. Downtrend = lower highs + lower lows. Sideways = range. Trend ke saath trade karna risky kam hota hai. ⚠️ Educational only."
      : "Trend is the market's overall direction. Uptrend = higher highs + higher lows. Downtrend = lower highs + lower lows. Sideways = ranging. Trading with the trend is lower risk. ⚠️ Educational only.";
  }
  if (has(/\bvolume\b/)) {
    return romanUrdu
      ? "Volume batata hai kitni buying/selling hui. Strong move ke saath zyada volume us move ko valid banata hai. Kam volume par move often fake hota hai. ⚠️ Educational only."
      : "Volume shows how much buying/selling happened. A strong move on high volume validates that move. A move on low volume is often fake. ⚠️ Educational only.";
  }
  return null;
}

/** Rule-based fallback when ALL AI providers are exhausted. */
async function getRuleBasedFallback(
  message: string,
  _tier: string,
  _marketContext: unknown,
  riskReward: RuleBasedFallbackData,
  origin?: string,
): Promise<string> {
  const lower = message.toLowerCase();

  // Detect user language (Roman Urdu vs English) so the reply matches.
  const romanUrdu = ROMAN_URDU_MARKERS.some((marker) => lower.includes(marker));

  // 1) General trading-concept questions ("RSI kya hai?", "pattern kaise pehchane?").
  const knowledge = generalKnowledgeReply(message, romanUrdu);
  if (knowledge) return knowledge;

  // 2) Asset request ("Muje gold ka bare ma batao") -> full A→Z analysis from live data.
  const asset = detectAssetSymbol(message);
  if (asset) {
    const analysis = await buildFullAnalysisReply(asset, romanUrdu, origin);
    if (analysis) return analysis;
    // Candles unavailable -> graceful note instead of an empty/broken reply.
    return romanUrdu
      ? `${asset.label} ka live data abhi available nahi hai. Thori der baad dobara try karein. Aap BTC, ETH, Silver ya EUR ka analysis bhi poochh sakte hain. ⚠️ Educational only.`
      : `Live data for ${asset.label} is not available right now. Please try again shortly. You can also ask about BTC, ETH, Silver, or EUR. ⚠️ Educational only.`;
  }

  const parts: string[] = [];

  if (lower.includes("risk") || lower.includes("position") || lower.includes("lot")) {
    const calc = riskReward.details.length ? ` ${riskReward.details.join(" ")}` : "";
    parts.push(`I can calculate risk/reward if you provide account balance, risk amount, entry, and stop-loss.${calc} Educational only.`);
  }

  if (lower.includes("help") || lower.includes("what can you do") || lower.includes("how do you work")) {
    parts.push("I can help with crypto, forex, stocks and metals analysis. I talk in English, Urdu, and Roman Urdu. Ask about BTC, ETH, Gold, Silver, EUR/USD, or any trading concept. Educational only, not financial advice.");
  }

  if (parts.length === 0) {
    // MASLA 1 — honest error instead of a generic "service busy" reply.
    return romanUrdu
      ? "Maazrat — saare AI providers abhi available nahi hain (API limit ya outage), is liye is sawal ka bina AI ke theek se jawab nahi de sakta. Aap koi asset analysis poochhain (misal: \"BTC analysis\", \"DOGE analysis\") — us ka real-data analysis abhi bhi milega — ya 1-2 minute baad dobara try karein. ⚠️ Educational only. Not financial advice."
      : "Sorry — every AI provider is currently unavailable (API limit or outage), so I cannot answer this one honestly without AI. You can still ask for asset analysis (e.g. \"BTC analysis\", \"DOGE analysis\") which runs on real engine data, or try again in a minute or two. ⚠️ Educational only. Not financial advice.";
  }

  return parts.join(" ");
}