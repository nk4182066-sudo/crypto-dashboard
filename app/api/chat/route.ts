const assistantName = "Muhammad Noman's Assistant AI";
const websiteName = "Trading Student Expert AI";
const englishGreeting = `Hello! I am ${assistantName} from ${websiteName}. How can I help you with crypto, forex, or stock market analysis today?`;

const systemPrompt = `You are ${assistantName}, a professional, evidence-based trading analyst for cryptocurrency, forex, and equities. Give clear, balanced technical analysis and explain uncertainty. This is educational analysis, not a guarantee or personalized financial advice.

LANGUAGE
- Reply in the language used by the user: English, Urdu, or Roman Urdu. Match Urdu script when the user writes in Urdu script; use Roman Urdu when they use Roman Urdu. Keep the entire reply in that language, including headings, while retaining standard ticker symbols and formulas.
- Keep replies in English, Urdu, or Roman Urdu according to the user's message. Do not switch languages unless asked.
- Understand common Roman Urdu spelling variations such as "kise ho", "kese ho", "kaise ho", "kya haal", "kia haal", "mujhe", and "mujhy". Reply in Roman Urdu when the user writes Urdu using Latin letters.
- Answer only the question asked. Do not volunteer market analysis, trade setups, news, or a risk calculation when the user did not ask for it. A greeting is only a greeting; do not attach market commentary.
- If a request is unclear or does not identify an asset when asset-specific analysis is needed, ask a concise clarifying question instead of guessing.
- If the user names an asset that differs from the selected instrument, prioritize the named asset and do not attribute the selected instrument's price or candles to it.
- For a direct English greeting, respond exactly: "${englishGreeting}"

MARKET ANALYSIS
When the user asks for technical analysis of a specific crypto, forex pair, or stock, cover the relevant items below. Use the selected instrument, current price, daily change, timeframe, chart image, or OHLC data only when those are actually included in the conversation. The app-provided market context is data, not a request to analyze: only discuss it when the user asks for analysis or a related question.
1. Trend: bullish, bearish, or neutral, with the timeframe and evidence. A 24-hour change alone is short-term context, not proof of a broader trend.
2. Support and resistance: provide price levels and briefly explain the visible basis for each. Do not invent exact levels when there is not enough price/chart data.
3. Chart patterns: identify recognizable formations such as head and shoulders, inverse head and shoulders, triangles, double tops/bottoms, flags, or wedges. State whether a pattern is confirmed, developing, or absent; do not force a pattern.
4. Trade setup: give a conditional entry area, stop loss, and one or more take-profit levels only when the supplied evidence supports them. Explain the invalidation condition and the rationale. Otherwise say which timeframe, chart/OHLC data, or price levels are needed before proposing levels.
5. Risk: note the main risk and never promise a profitable outcome.

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
- Only present an actionable setup when several independent supplied facts agree and the setup-quality score is at least 80/100. Describe that score as a qualitative model assessment, never as an 80% win probability. If evidence is insufficient, say Wait and explain why.
- Do not state a fixed 20% reversal chance or any other precise market probability unless it comes from a supplied, calibrated statistical source. Never promise profit.
- If app-provided validated trade-plan data says direction is wait, do not suggest a buy/sell, entry, or alternate price levels. If it approves a setup, use its exact entry, stop, target, and quality score; do not invent replacements.
- Before any trade setup, state: "This is not guaranteed. The market can reverse. Always use a stop loss. Never risk more than you can afford to lose." Translate this naturally into the user's language.
- Warn clearly when the planned risk exceeds 10% of the account balance. Encourage independent decisions: "Learn, understand, then trade. Your money, your decision." Translate naturally when needed.
- Do not prescribe leverage without instrument-specific margin rules. Explain that leverage magnifies both gains and losses.
- Include a brief risk disclaimer when discussing a trade setup.`;

const chartImagePrompt = `The user supplied a chart screenshot. Analyze only what is visible in the image and return one JSON object, with no markdown or prose outside JSON, in this shape:
{
  "analysis": "Concise technical analysis in the user's language, including trend, visible support/resistance, recognizable pattern (or none), and conditional entry/stop-loss/take-profit reasoning.",
  "verdict": "Wait",
  "annotations": [
    { "type": "horizontal", "category": "support", "y": 420, "label": "Support · $price or price not readable" },
    { "type": "trendline", "category": "upperTrend", "x1": 0, "y1": 200, "x2": 1000, "y2": 350, "label": "Upper trendline" },
    { "type": "pattern", "name": "Head & Shoulders | Triangle | Double Top | Double Bottom | Flag", "points": [{ "x": 0, "y": 0 }, { "x": 500, "y": 500 }, { "x": 1000, "y": 0 }], "label": "Pattern name" },
    { "type": "entry", "direction": "buy", "x": 500, "y": 500, "label": "BUY · entry price or price not readable" }
  ],
  "riskReward": null
}
Coordinates are percentages of the full screenshot scaled 0-1000 from top-left. Mark clearly visible support and resistance, and upper/lower trend boundaries when identifiable. Outline recognizable patterns with at least three points. Horizontal category must be exactly one of support, resistance, stopLoss, takeProfit; trendline category must be upperTrend or lowerTrend; entry direction must be buy or sell. Include only marks supported by the visible chart; omit a trendline or pattern if it is not identifiable. Horizontal labels must include a price only if it is readable from the chart; otherwise say "price not readable". Never invent levels. Add stopLoss and takeProfit lines only when a defensible setup exists. Entry direction must match the conditional setup. Choose Wait when evidence or price scale is unclear; never force Take Entry. Keep the verdict exactly one of the three listed values. The server will add the risk-reward box from validated calculator inputs.`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const chartCoordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1000, value))
    : null;

const textValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.slice(0, 180) : fallback;

function validateAnnotation(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;

  const item = value;
  const label = textValue(item.label);
  if (item.type === "horizontal") {
    const categories = ["support", "resistance", "stopLoss", "takeProfit"];
    const y = chartCoordinate(item.y);
    if (!categories.includes(String(item.category)) || y === null || !label) return null;
    return { type: item.type, category: item.category, y, label };
  }

  if (item.type === "trendline") {
    const categories = ["upperTrend", "lowerTrend"];
    const x1 = chartCoordinate(item.x1);
    const y1 = chartCoordinate(item.y1);
    const x2 = chartCoordinate(item.x2);
    const y2 = chartCoordinate(item.y2);
    if (!categories.includes(String(item.category)) || x1 === null || y1 === null || x2 === null || y2 === null || !label) return null;
    return { type: item.type, category: item.category, x1, y1, x2, y2, label };
  }

  if (item.type === "pattern" && Array.isArray(item.points)) {
    const points = item.points.flatMap((point) => {
      if (!isRecord(point)) return [];
      const x = chartCoordinate(point.x);
      const y = chartCoordinate(point.y);
      return x === null || y === null ? [] : [{ x, y }];
    });
    const name = textValue(item.name, "Chart pattern");
    if (points.length < 3) return null;
    return { type: item.type, name, points, label: label || name };
  }

  if (item.type === "entry") {
    const directions = ["buy", "sell"];
    const x = chartCoordinate(item.x);
    const y = chartCoordinate(item.y);
    if (!directions.includes(String(item.direction)) || x === null || y === null || !label) return null;
    return { type: item.type, direction: item.direction, x, y, label };
  }

  return null;
}

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

export async function POST(request: Request) {
  try {
    const { message, marketContext, image, tradingParams, history } = await request.json();

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
      return Response.json({ response: greeting });
    }

    const apiKey = process.env.GROQ_API_KEY;
    
    console.log("Groq API Key check:", apiKey ? "Present" : "Missing");
    
    if (!apiKey) {
      return Response.json({ error: "Groq API key not configured. Please check your .env.local file." }, { status: 500 });
    }

    let userMessage = message;

    if (marketContext) {
      userMessage += `\n\nApp-provided market context (use only if the user's question is about it):\n${marketContext}`;
    }

    const asksForSizing = Boolean(image) || /\b(risk|position size|position sizing|lot size|lots|sizing)\b|رسک|لاٹ سائز|پوزیشن سائز/i.test(message);
    const riskReward = buildRiskReward(tradingParams);
    if (asksForSizing && riskReward.details.length) {
      userMessage += `\n\nVerified calculator results (USD inputs; use these figures exactly and explain in the user's language): ${riskReward.details.join(" ")}`;
    }

    const userContent = image
      ? [
          { type: "text", text: userMessage },
          { type: "image_url", image_url: { url: image } },
        ]
      : userMessage;

    const priorMessages = Array.isArray(history)
      ? history.slice(-10).flatMap((item: unknown) => {
          if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
          return [{ role: item.role, content: item.content.slice(0, 3000) }];
        })
      : [];

    const messages = [
      {
        role: "system",
        content: image ? `${systemPrompt}\n\n${chartImagePrompt}` : systemPrompt
      },
      ...priorMessages,
      {
        role: "user",
        content: userContent
      }
    ];

    const model = image ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.1-8b-instant";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: messages,
        max_tokens: 2000,
        temperature: image ? 0.2 : 0.7,
        ...(image ? { response_format: { type: "json_object" } } : {})
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Groq API error:", errorData);
      return Response.json(
        { error: `Groq API error: ${errorData.error?.message || response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || "No response from AI";

    if (image) {
      try {
        const parsed: unknown = JSON.parse(aiResponse);
        if (!isRecord(parsed)) throw new Error("Invalid chart analysis response");
        const allowedVerdicts = ["Take Entry", "Wait", "Do Not Enter"];
        const verdict = allowedVerdicts.includes(String(parsed.verdict)) ? parsed.verdict : "Wait";
        const annotations = Array.isArray(parsed.annotations)
          ? parsed.annotations.map(validateAnnotation).filter((annotation): annotation is Record<string, unknown> => annotation !== null)
          : [];

        return Response.json({
          response: textValue(parsed.analysis, aiResponse),
          chartMarkup: true,
          verdict,
          annotations,
          riskReward: riskReward.summary,
        });
      } catch {
        return Response.json({ response: aiResponse, chartMarkup: false });
      }
    }

    return Response.json({ response: aiResponse });
  } catch (error) {
    console.error("Error in chat API:", error);
    return Response.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}