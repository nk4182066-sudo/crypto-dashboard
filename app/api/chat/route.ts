import { cached } from "@/src/lib/cache";
import { callAI, type AIMessage, type AIResult } from "@/src/lib/aiProvider";
import { analyzeSymbol } from "@/src/lib/autoAnalysis";
import { compactMarketContext, selectTier, systemPromptFor } from "@/src/lib/llm";
import { buildProTraderPrompt } from "@/src/lib/proTraderPrompt";

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

const systemPrompt = `You are ${assistantName}, a professional trading analyst for crypto, forex, stocks, and metals. Draw on 100 years of combined market study and published knowledge; do not claim personal experience, credentials, or a human career. You have studied chart patterns, candlestick patterns, RSI, MACD, Moving Averages, Bollinger Bands, and Fibonacci. Give honest, evidence-based analysis: when the market is unclear, say Wait. Never guarantee accuracy or profit. Explain everything in simple English, Urdu, or Roman Urdu for beginners. This is educational analysis, not a guarantee or personalized financial advice.

LANGUAGE
- Reply in the language used by the user: English, Urdu, or Roman Urdu. Match Urdu script when the user writes in Urdu script; use Roman Urdu when they use Roman Urdu. Keep the entire reply in that language, including headings, while retaining standard ticker symbols and formulas.
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

export async function POST(request: Request) {
  try {
    const { message, marketContext, tradingParams, history } = await request.json();

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

    if (englishGreetingOnly || urduScriptGreetingOnly || romanUrduGreetingOnly) {
      const greeting = urduScriptGreetingOnly
        ? "السلام علیکم! میں محمد نومان کا اسسٹنٹ AI ہوں، Trading Student Expert AI کی جانب سے۔ میں کرپٹو، فاریکس، یا اسٹاک مارکیٹ کے تجزیے میں آپ کی کیا مدد کر سکتا ہوں؟"
        : englishGreetingOnly
          ? englishGreeting
          : romanUrduHowAreYou
            ? "Main theek hoon, shukriya! Main Muhammad Noman's Assistant AI hoon. Crypto, forex, ya stock market ke hawale se aapki kya madad karoon?"
            : "Assalam-o-alaikum! Main Muhammad Noman's Assistant AI hoon, Trading Student Expert AI ki taraf se. Crypto, forex, ya stock market analysis mein aapki kya madad kar sakta hoon?";
      return Response.json({ reply: greeting });
    }

    // Masla 21 — serve repeat common queries (BTC, Gold, ETH…) from cache.
    const cachedReply = getCachedReply(normalizedMessage);
    if (cachedReply) {
      return Response.json({ reply: cachedReply });
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

    const systemContent = tier === "deep"
      ? `${buildProTraderPrompt()}\n\n${systemPrompt}`
      : systemPromptFor(tier, systemPrompt, englishGreeting);

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
        const fallback = await getRuleBasedFallback(userMessage, tier, marketContext, riskReward);
        setCachedReply(normalizedMessage, fallback);
        return Response.json({ reply: fallback });
      }
      console.error("Error in chat API:", error);
      return Response.json({ error: "Failed to process message" }, { status: 500 });
    }

    const aiResponse = toTextOnly(result.text);
    const reply = aiResponse || "Please rephrase your question — I can help with crypto, forex, stocks, and metals analysis.";
    setCachedReply(normalizedMessage, reply);
    return Response.json({ reply });
  } catch (error) {
    console.error("Error in chat API:", error);
    return Response.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}

type RuleBasedFallbackData = { summary: Record<string, string>; details: string[] };

/** Rule-based fallback when ALL AI providers are exhausted. */
async function getRuleBasedFallback(
  message: string,
  tier: string,
  marketContext: unknown,
  riskReward: RuleBasedFallbackData,
): Promise<string> {
  const lower = message.toLowerCase();
  const parts: string[] = [];

  if (lower.includes("btc") || lower.includes("bitcoin")) {
    parts.push("BTC: Market unclear right now. Wait for a validated setup. Educational only, not financial advice.");
  }

  if (lower.includes("eth") || lower.includes("ethereum")) {
    parts.push("ETH: Market unclear right now. Wait for a validated setup. Educational only, not financial advice.");
  }

  if (lower.includes("risk") || lower.includes("position") || lower.includes("lot")) {
    const calc = riskReward.details.length ? ` ${riskReward.details.join(" ")}` : "";
    parts.push(`I can calculate risk/reward if you provide account balance, risk amount, entry, and stop-loss.${calc} Educational only.`);
  }

  if (lower.includes("help") || lower.includes("what can you do") || lower.includes("how do you work")) {
    parts.push("I can help with crypto, forex, and stock market analysis. I talk in English, Urdu, and Roman Urdu. I rotate across multiple AI providers for reliability. Educational only, not financial advice.");
  }

  if (parts.length === 0) {
    return `I understand you're asking about: ${message}. I'm a text-only AI assistant. I can analyze crypto, forex, and stock markets. Educational only, not financial advice.`;
  }

  return parts.join(" ");
}