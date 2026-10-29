/**
 * crypto-dashboard Firebase Cloud Functions
 * Region: asia-south1 (Karachi proximity, low latency)
 * Runtime: Node.js 20
 *
 * - scanner: every 5 minutes (Asia/Karachi), scans 30 coins, max 10 signals/day
 * - rotator: every day 00:00 (Asia/Karachi), archives today->week, week->month
 *
 * Educational analysis only — not financial advice.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

/* ──────────────────────────────────────────────────────────
   Universe — exact coins per market (30 total per scan)
   7 Crypto + 7 Forex + 7 Stocks + 9 Metals = 30
   ────────────────────────────────────────────────────────── */

const CRYPTO_COINS = [
  "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "ADA-USD", "DOGE-USD",
  "AVAX-USD", "LINK-USD", "LTC-USD", "TRX-USD", "MATIC-USD", "DOT-USD",
  "ALGO-USD", "UNI-USD", "SHIB-USD", "NEAR-USD", "APT-USD", "ATOM-USD",
  "FIL-USD", "ETC-USD", "XLM-USD", "HBAR-USD", "VET-USD", "ICP-USD",
  "ARB-USD", "OP-USD", "INJ-USD", "SUI-USD", "SEI-USD", "RUNE-USD",
  "AAVE-USD", "MKR-USD", "LDO-USD", "GRT-USD", "SAND-USD", "MANA-USD",
  "THETA-USD", "EOS-USD", "KAVA-USD", "FTM-USD", "ONE-USD", "EGLD-USD",
  "XTZ-USD", "FLOW-USD", "CHZ-USD", "ENJ-USD", "CRV-USD",
];

const FOREX_COINS = [
  "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCHF=X", "AUDUSD=X", "USDCAD=X",
  "NZDUSD=X", "EURGBP=X", "EURJPY=X", "GBPJPY=X", "AUDJPY=X", "EURAUD=X",
  "EURCHF=X", "GBPCHF=X", "USDCNH=X", "USDTRY=X", "EURTRY=X", "XAUUSD=X",
  "XAGUSD=X",
];

const STOCKS_COINS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD",
  "INTC", "IBM", "ORCL", "CSCO", "QCOM", "TXN", "AVGO", "COST", "WMT",
  "HD", "JPM", "V", "MA", "PG", "JNJ", "UNH", "DIS", "NKE", "SBUX",
  "MCD", "VZ", "T", "PFE", "ABT", "KO", "PEP", "MRK", "TMO", "DHR",
  "VRTX", "REGN", "ISRG", "GILD", "AMGN", "GD", "BA", "CAT",
];

const METALS_COINS = [
  "GC=F", "SI=F", "PL=F", "PA=F", "HG=F", "CL=F", "NG=F", "ZC=F", "ZW=F",
  "IAU", "GDX", "GDXJ", "SLV", "SIVR", "PSLV", "GLD", "GLDM", "PPLT",
  "PALL", "CPER", "USO", "USL", "UUP",
];

/* Rotate through each market's universe using a Firestore counter doc. */
async function getRotationOffset(market: string): Promise<number> {
  const ref = db.collection("_rotation").doc(market);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as { offset?: number }) : {};
  return data.offset ?? 0;
}

async function incrementRotationOffset(market: string): Promise<void> {
  const ref = db.collection("_rotation").doc(market);
  await ref.set({ offset: admin.firestore.FieldValue.increment(1) }, { merge: true });
}

function pickRotatedCoins(universe: string[], count: number, offset: number): string[] {
  const n = universe.length;
  if (n === 0) return [];
  const start = offset % n;
  const picked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(universe[(start + i) % n]);
  }
  return picked;
}

/* ──────────────────────────────────────────────────────────
   Yahoo Finance candle fetch (server-side, no browser needed)
   ────────────────────────────────────────────────────────── */

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchYahooCandles(
  symbol: string,
  market: string,
  interval: "1h" | "4h" | "1d"
): Promise<Candle[]> {
  let yahooSymbol = symbol;
  if (market === "forex" && !symbol.includes("=")) yahooSymbol = `${symbol}=X`;
  if (market === "metals") {
    const bare = ["GDX","GDXJ","SLV","SIVR","PSLV","GLD","GLDM","PPLT","PALL","CPER","USO","USL","UUP","IAU"];
    if (!bare.includes(symbol)) yahooSymbol = `${symbol}=X`;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=1mo`;

  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const payload: any = await response.json();
    const result = payload.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0] ?? {};
    const opens: (number|null)[] = quotes.open ?? [];
    const highs: (number|null)[] = quotes.high ?? [];
    const lows: (number|null)[] = quotes.low ?? [];
    const closes: (number|null)[] = quotes.close ?? [];
    const vols: (number|null)[] = quotes.volume ?? [];
    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const o = opens[i]; const h = highs[i]; const l = lows[i]; const c = closes[i]; const v = vols[i] ?? 0;
      if (o === null || h === null || l === null || c === null) continue;
      if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
      candles.push({ time: timestamps[i] * 1000, open: o, high: h, low: l, close: c, volume: Number(v) });
    }
    return candles;
  } catch {
    return [];
  }
}

/* ──────────────────────────────────────────────────────────
   Technical indicators (inline, server-side)
   ────────────────────────────────────────────────────────── */

function ema(closes: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    if (prev === null) prev = c;
    else prev = c * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0; let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gains += ch; else losses -= ch;
  }
  let avgGain = gains / period; let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0; const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { line: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    macdLine.push(e12[i] - e26[i]);
  }
  const macdSignalArr = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const signal = macdSignalArr[last];
  const hist = macdLine[last] - signal;
  return { line: macdLine[last], signal, histogram: hist };
}

function prevMacd(closes: number[]): { line: number; signal: number; histogram: number } | null {
  if (closes.length < 36) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    macdLine.push(e12[i] - e26[i]);
  }
  const macdSignalArr = ema(macdLine, 9);
  const last = macdLine.length - 2;
  const signal = macdSignalArr[last];
  const hist = macdLine[last] - signal;
  return { line: macdLine[last], signal, histogram: hist };
}

function atr(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  let trSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const c = candles[i]; const pc = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc.close), Math.abs(c.low - pc.close));
    trSum += tr;
  }
  return trSum / period;
}

function supportResistance(candles: Candle[]): { support: number; resistance: number } {
  const n = candles.length;
  const support = Math.min(...candles.slice(Math.max(0, n - 50)).map((c) => c.low));
  const resistance = Math.max(...candles.slice(Math.max(0, n - 50)).map((c) => c.high));
  return { support, resistance };
}

/* ──────────────────────────────────────────────────────────
   Expert opinions (4 experts)
   ────────────────────────────────────────────────────────── */

interface ExpertVerdict { name: string; agree: boolean; confidence: number; reason: string; }

function expertTrend(candles1h: Candle[], candles4h: Candle[], direction: "bullish" | "bearish"): ExpertVerdict {
  const e20 = ema(candles1h.map((c) => c.close), 20);
  const e50 = ema(candles1h.map((c) => c.close), 50);
  const e200 = ema(candles1h.map((c) => c.close), 200);
  const last = e20.length - 1;
  const aligned =
    direction === "bullish" ? e20[last] > e50[last] && e50[last] > e200[last] :
                              e20[last] < e50[last] && e50[last] < e200[last];
  const h4Trend = candles4h.length >= 50
    ? (ema(candles4h.map((c) => c.close), 20)[candles4h.length - 1] >
      ema(candles4h.map((c) => c.close), 50)[candles4h.length - 1] ? "bullish" : "bearish")
    : direction;
  const agree = aligned && h4Trend === direction;
  return { name: "Trend", agree, confidence: agree ? 85 : 40, reason: aligned ? "EMA aligned" : "EMA misaligned" };
}

function expertMomentum(closes: number[], direction: "bullish" | "bearish"): ExpertVerdict {
  const r = rsi(closes);
  const agree = direction === "bullish" ? r < 65 && r > 25 : r > 35 && r < 75;
  return { name: "Momentum", agree, confidence: agree ? 80 : 35, reason: `RSI ${r.toFixed(0)}` };
}

function expertVolume(candles: Candle[], direction: "bullish" | "bearish"): ExpertVerdict {
  const n = candles.length;
  if (n < 20) return { name: "Volume", agree: false, confidence: 0, reason: "Not enough candles" };
  const recent = candles.slice(n - 5).reduce((s, c) => s + c.volume, 0) / 5;
  const avg = candles.slice(0, n - 5).reduce((s, c) => s + c.volume, 0) / Math.max(1, n - 5);
  const agree = recent > avg * 1.2;
  return { name: "Volume", agree, confidence: agree ? 85 : 30, reason: `Vol ${(recent / Math.max(1, avg)).toFixed(2)}x avg` };
}

function expertSupportResistance(
  candles: Candle[], price: number, direction: "bullish" | "bearish"
): ExpertVerdict {
  const { support, resistance } = supportResistance(candles);
  const atrVal = atr(candles);
  const proximity = 1.5 * atrVal;
  let agree = false;
  if (direction === "bullish") {
    const dist = price - support;
    agree = support > 0 && dist >= 0 && dist <= proximity;
  } else {
    const dist = resistance - price;
    agree = resistance > 0 && dist >= 0 && dist <= proximity;
  }
  return { name: "S/R", agree, confidence: agree ? 80 : 30, reason: `S=${support.toFixed(2)} R=${resistance.toFixed(2)}` };
}

/* ──────────────────────────────────────────────────────────
   Quality filter — 8 conditions + 4 experts
   ────────────────────────────────────────────────────────── */

interface AnalysisResult {
  symbol: string; market: string; price: number; direction: "bullish" | "bearish";
  conditionsPassed: number; conditionsTotal: number;
  expertsAgreed: number; expertsTotal: number;
  support: number; resistance: number; atr: number;
  trend: string; pattern: string | null; candlestick: string | null;
  score: number;
}

function analyzeSymbol(
  symbol: string,
  market: string,
  candles1h: Candle[],
  candles4h: Candle[],
  candles1d: Candle[]
): AnalysisResult | null {
  if (candles1h.length < 50) return null;
  const closes = candles1h.map((c) => c.close);
  const price = closes[closes.length - 1];
  if (!price || price <= 0) return null;

  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const last = closes.length - 1;

  let direction: "bullish" | "bearish";
  if (e20[last] > e50[last] && e50[last] > e200[last]) direction = "bullish";
  else if (e20[last] < e50[last] && e50[last] < e200[last]) direction = "bearish";
  else direction = closes[last] > closes[Math.max(0, last - 10)] ? "bullish" : "bearish";

  const r = rsi(closes);
  const macdCur = macd(closes);
  const macdPrev = prevMacd(closes);

  const { support, resistance } = supportResistance(candles1h);
  const atrVal = atr(candles1h);
  const proximity = 1.5 * atrVal;
  const nearSupport = direction === "bullish" && support > 0 && (price - support) <= proximity;
  const nearResistance = direction === "bearish" && resistance > 0 && (resistance - price) <= proximity;
  const chartPattern = (nearSupport || nearResistance) ? (direction === "bullish" ? "Double Bottom" : "Double Top") : null;
  const condChartPattern = chartPattern !== null;

  const lastCandle = candles1h[candles1h.length - 1];
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const candleRange = lastCandle.high - lastCandle.low;
  const condCandlestick = candleRange > 0 && body / candleRange > 0.6;

  const condTrend =
    (direction === "bullish" && e20[last] > e50[last] && e50[last] > e200[last]) ||
    (direction === "bearish" && e20[last] < e50[last] && e50[last] < e200[last]);

  const condRsi = direction === "bullish" ? r < 65 && r > 25 : r > 35 && r < 75;

  const condMacd = macdCur !== null && macdPrev !== null &&
    ((direction === "bullish" && macdPrev.histogram <= 0 && macdCur.histogram > 0) ||
     (direction === "bearish" && macdPrev.histogram >= 0 && macdCur.histogram < 0));

  const condEma = condTrend;

  const n = candles1h.length;
  const recentVol = candles1h.slice(n - 5).reduce((s, c) => s + c.volume, 0) / 5;
  const avgVol = candles1h.slice(0, n - 5).reduce((s, c) => s + c.volume, 0) / Math.max(1, n - 5);
  const condVolume = recentVol > avgVol * 1.5;

  let sl = 0; let tp1 = 0; let tp3 = 0;
  if (direction === "bullish") {
    sl = support > 0 ? support * 0.985 : price * 0.97;
    const risk = price - sl;
    tp1 = price + risk * 1.5;
    tp3 = price + risk * 3.5;
  } else {
    sl = resistance > 0 ? resistance * 1.015 : price * 1.03;
    const risk = sl - price;
    tp1 = price - risk * 1.5;
    tp3 = price - risk * 3.5;
  }
  const slPct = Math.abs(price - sl) / price * 100;
  const rr3 = tp3 !== price ? Math.abs(tp3 - price) / Math.abs(price - sl) : 0;
  const condRiskReward = rr3 >= 3.5 && slPct <= 3;

  const conditions = [condChartPattern, condCandlestick, condTrend, condRsi, condMacd, condEma, condVolume, condRiskReward];
  const conditionsPassed = conditions.filter(Boolean).length;

  const experts = [
    expertTrend(candles1h, candles4h, direction),
    expertMomentum(closes, direction),
    expertVolume(candles1h, direction),
    expertSupportResistance(candles1h, price, direction),
  ];
  const expertsAgreed = experts.filter((e) => e.agree).length;

  let score = 0;
  if (conditionsPassed >= 8) score = 100;
  else if (conditionsPassed >= 7) score = 88;
  else if (conditionsPassed >= 6) score = 75;
  else if (conditionsPassed >= 5) score = 63;
  else if (conditionsPassed >= 4) score = 50;
  else score = conditionsPassed * 12.5;

  return {
    symbol, market, price, direction,
    conditionsPassed, conditionsTotal: 8,
    expertsAgreed, expertsTotal: 4,
    support, resistance, atr: atrVal,
    trend: direction,
    pattern: chartPattern,
    candlestick: condCandlestick ? (direction === "bullish" ? "Bullish Candle" : "Bearish Candle") : null,
    score,
  };
}

/* ──────────────────────────────────────────────────────────
   AI confirmation
   ────────────────────────────────────────────────────────── */

async function aiConfirm(analysis: AnalysisResult): Promise<boolean> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const prompt = `You are a strict trading signal validator. Reply with exactly ONE word: "CONFIRM" or "REJECT".

Symbol: ${analysis.symbol} (${analysis.market})
Price: ${analysis.price}
Direction: ${analysis.direction}
Score: ${analysis.score}/100
Conditions: ${analysis.conditionsPassed}/${analysis.conditionsTotal}
Experts: ${analysis.expertsAgreed}/${analysis.expertsTotal}
Support: ${analysis.support} Resistance: ${analysis.resistance}
ATR: ${analysis.atr}

Confirm only if the setup has a clear trend, good R:R, and is not overbought/oversold. Reply with exactly one word: CONFIRM or REJECT.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (response.ok) {
        const data: any = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const upper = text.trim().toUpperCase();
        if (upper.includes("CONFIRM")) return true;
        if (upper.includes("REJECT")) return false;
      }
    } catch {
      /* fall through to rule-based fallback */
    }
  }

  return analysis.conditionsPassed >= 6 && analysis.expertsAgreed >= 3 && analysis.score >= 75;
}

/* ──────────────────────────────────────────────────────────
   Scanner Cloud Function
   ────────────────────────────────────────────────────────── */

export const scanner = functions
  .region("asia-south1")
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .pubsub.schedule("every 5 minutes")
  .timeZone("Asia/Karachi")
  .onRun(async () => {
    console.log("[scanner] Starting scan cycle");

    const today = new Date().toISOString().split("T")[0];
    const todaySnap = await db.collection("signals").where("date", "==", today).get();
    const count = todaySnap.size;
    console.log(`[scanner] Today's signals: ${count}/10`);
    if (count >= 10) {
      console.log("Daily 10 limit reached, stopping");
      return null;
    }

    const remaining = 10 - count;
    console.log(`[scanner] Remaining slots today: ${remaining}`);

    const cryptoOffset = await getRotationOffset("crypto");
    const forexOffset = await getRotationOffset("forex");
    const stocksOffset = await getRotationOffset("stocks");
    const metalsOffset = await getRotationOffset("metals");

    const cryptoPicks = pickRotatedCoins(CRYPTO_COINS, 7, cryptoOffset);
    const forexPicks = pickRotatedCoins(FOREX_COINS, 7, forexOffset);
    const stocksPicks = pickRotatedCoins(STOCKS_COINS, 7, stocksOffset);
    const metalsPicks = pickRotatedCoins(METALS_COINS, 9, metalsOffset);

    const targets: Array<{ symbol: string; market: string }> = [
      ...cryptoPicks.map((s) => ({ symbol: s, market: "crypto" })),
      ...forexPicks.map((s) => ({ symbol: s, market: "forex" })),
      ...stocksPicks.map((s) => ({ symbol: s, market: "stocks" })),
      ...metalsPicks.map((s) => ({ symbol: s, market: "metals" })),
    ];

    console.log(`[scanner] Scanning ${targets.length} coins: ${targets.map((t) => `${t.symbol}(${t.market})`).join(", ")}`);

    let signalsSaved = 0;

    for (const target of targets) {
      if (signalsSaved >= remaining) break;

      try {
        const [h1, h4, d1] = await Promise.all([
          fetchYahooCandles(target.symbol, target.market, "1h"),
          fetchYahooCandles(target.symbol, target.market, "4h"),
          fetchYahooCandles(target.symbol, target.market, "1d"),
        ]);

        const analysis = analyzeSymbol(target.symbol, target.market, h1, h4, d1);
        if (!analysis) continue;

        if (analysis.conditionsPassed < 6 || analysis.expertsAgreed < 3) {
          console.log(`[scanner] SKIP ${target.symbol}: ${analysis.conditionsPassed}/8 conditions, ${analysis.expertsAgreed}/4 experts`);
          continue;
        }

        console.log(`[scanner] QUALITY PASS ${target.symbol}: ${analysis.conditionsPassed}/8 conditions, ${analysis.expertsAgreed}/4 experts, score ${analysis.score}`);

        const aiOk = await aiConfirm(analysis);
        if (!aiOk) {
          console.log(`[scanner] AI REJECT ${target.symbol} — not counted in daily limit`);
          continue;
        }

        console.log(`[scanner] AI CONFIRM ${target.symbol} — saving to Firestore`);

        const now = new Date();
        const karachiTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
        const timeStr = karachiTime.toLocaleTimeString("en-PK", { hour12: false, timeZone: "Asia/Karachi" });

        const identity = `${target.market}|${target.symbol}|1h|${today}`;
        const signalIdentity = Buffer.from(identity).toString("base64").replace(/[/+=]/g, "_");

        const docData = {
          symbol: target.symbol,
          market: target.market,
          date: today,
          time: timeStr,
          status: "today",
          _identity: identity,
          signalIdentity,
          price: analysis.price,
          direction: analysis.direction,
          score: analysis.score,
          conditionsPassed: analysis.conditionsPassed,
          conditionsTotal: analysis.conditionsTotal,
          expertsAgreed: analysis.expertsAgreed,
          expertsTotal: analysis.expertsTotal,
          support: analysis.support,
          resistance: analysis.resistance,
          atr: analysis.atr,
          trend: analysis.trend,
          pattern: analysis.pattern,
          candlestick: analysis.candlestick,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection("signals").add(docData);
        signalsSaved += 1;
        console.log(`[scanner] Saved signal #${signalsSaved}: ${target.symbol} (${target.market})`);

      } catch (error) {
        console.warn(`[scanner] ${target.symbol} failed:`, error instanceof Error ? error.message : error);
      }
    }

    await incrementRotationOffset("crypto");
    await incrementRotationOffset("forex");
    await incrementRotationOffset("stocks");
    await incrementRotationOffset("metals");

    console.log(`[scanner] Scan complete. Saved ${signalsSaved} signals.`);
    return null;
  });

/* ──────────────────────────────────────────────────────────
   Rotator Cloud Function
   ────────────────────────────────────────────────────────── */

export const rotator = functions
  .region("asia-south1")
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .pubsub.schedule("every day 00:00")
  .timeZone("Asia/Karachi")
  .onRun(async () => {
    console.log("[rotator] Starting daily rotation");

    const now = new Date();
    const karachiOffsetMs = 5 * 60 * 60 * 1000;
    const todayKarachi = new Date(now.getTime() + karachiOffsetMs).toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() + karachiOffsetMs - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() + karachiOffsetMs - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const todaySnap = await db.collection("signals").where("date", "==", yesterday).where("status", "==", "today").get();
    let movedToWeek = 0;
    const batch1 = db.batch();
    for (const doc of todaySnap.docs) {
      batch1.update(doc.ref, { status: "week" });
      movedToWeek += 1;
    }
    if (movedToWeek > 0) await batch1.commit();
    console.log(`[rotator] Moved ${movedToWeek} signals: today -> week (date=${yesterday})`);

    const weekSnap = await db.collection("signals").where("status", "==", "week").get();
    let movedToMonth = 0;
    const batch2 = db.batch();
    for (const doc of weekSnap.docs) {
      const data = doc.data();
      const docDate = data.date ?? "";
      if (docDate && docDate < weekAgo) {
        batch2.update(doc.ref, { status: "month" });
        movedToMonth += 1;
      }
    }
    if (movedToMonth > 0) await batch2.commit();
    console.log(`[rotator] Moved ${movedToMonth} signals: week -> month (older than ${weekAgo})`);

    console.log("[rotator] Rotation complete");
    return null;
  });