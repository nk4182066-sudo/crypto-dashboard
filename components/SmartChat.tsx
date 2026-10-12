// Rule-based smart chat. No external AI.
// Educational analysis only.

"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeSymbol, type AutoAnalysis } from "@/src/lib/autoAnalysis";

interface Msg {
  role: "user" | "bot";
  text: string;
}

interface Sym {
  label: string;
  symbol: string;
  market: string;
}

const SYMS: (Sym & { test: RegExp })[] = [
  { label: "BTC", symbol: "BTC-USD", market: "crypto", test: /\b(btc|bitcoin)\b/i },
  { label: "ETH", symbol: "ETH-USD", market: "crypto", test: /\b(eth|ethereum)\b/i },
  { label: "GOLD", symbol: "XAU-USD", market: "metals", test: /\b(gold|xau)\b/i },
  { label: "EUR/USD", symbol: "EURUSD=X", market: "forex", test: /\beur\b/i },
];

const QUICK = ["BTC Analysis", "Gold Analysis", "EUR/USD", "ETH Analysis"];

const GREET =
  'Salam! 👋 Main Smart Chat hoon — bina AI API ke, sirf code se jawab. Symbol likho jaise "BTC analysis" ya neeche se button dabao. 📚';

const HELP = `🤔 Samajh nahi aya. Main yeh pooch sakte ho:

• Symbol analysis — "BTC analysis", "Gold kaisa hai"
• Levels — "BTC support", "resistance dikhao"
• Trend — "ETH trend"
• Kya karu — "kya karu ab?"
• Chart — "chart dikhao"

📚 Ye sab rule-based analysis hai, koi AI API nahi. Educational only.`;

const fmt = (value: number): string =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : 4 })}`;

const trendWord = (trend: AutoAnalysis["trend"]): string =>
  trend === "bullish" ? "Bullish" : trend === "bearish" ? "Bearish" : "Neutral";

const verdictWord = (verdict: AutoAnalysis["verdict"]): string =>
  verdict === "STRONG_SETUP" ? "Setup Detected" : verdict === "MODERATE" ? "Watch" : "Wait";


function formatAnalysis(a: AutoAnalysis): string {
  return [
    `📊 ${a.symbol} ANALYSIS`,
    `Trend: ${trendWord(a.trend)}`,
    `Timeframes: ${a.timeframeAlignment}`,
    `Support: ${fmt(a.support)}`,
    `Resistance: ${fmt(a.resistance)}`,
    `Score: ${a.score}/100`,
    "",
    "🎓 TEACHER EXPLANATION:",
    a.explanation,
    "",
    `⚠️ Verdict: ${verdictWord(a.verdict)}`,
    "",
    "📚 Educational only",
  ].join("\n");
}

async function get(s: Sym): Promise<AutoAnalysis | null> {
  try {
    return await analyzeSymbol(s.symbol, s.market);
  } catch {
    return null;
  }
}

export default function SmartChat() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: GREET }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const lastRef = useRef(SYMS[0]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const respond = async (text: string): Promise<string> => {
    const lower = text.toLowerCase();
    const hit = SYMS.find((s) => s.test.test(lower));
    if (hit) {
      lastRef.current = hit;
      const a = await get(hit);
      return a
        ? formatAnalysis(a)
        : `⚠️ ${hit.label} ka analysis abhi available nahi, thot der baad try karein.`;
    }
    const sym = lastRef.current;
    if (/\b(support|resistance|levels?)\b/.test(lower)) {
      const a = await get(sym);
      if (!a) return `⚠️ ${sym.label} ke levels abhi load nahi ho rahe.`;
      return [
        `📏 ${sym.label} KEY LEVELS`,
        `Support: ${fmt(a.support)}`,
        `Resistance: ${fmt(a.resistance)}`,
        `Current: ${fmt(a.current)}`,
        "",
        "📚 Educational only",
      ].join("\n");
    }
    if (/\btrend\b/.test(lower)) {
      const a = await get(sym);
      if (!a) return `⚠️ ${sym.label} ka trend abhi load nahi ho raha.`;
      return [
        `📈 ${sym.label} TREND`,
        `Trend: ${trendWord(a.trend)}`,
        `Timeframes: ${a.timeframeAlignment}`,
        `RSI: ${a.indicators.rsi.toFixed(1)} | MACD: ${a.indicators.macd}`,
        "",
        "📚 Educational only",
      ].join("\n");
    }
    if (/(kya karu|kya karun|what to do|should i do)/.test(lower)) {
      const a = await get(sym);
      if (!a) return `⚠️ ${sym.label} ka verdict abhi load nahi ho raha.`;
      return [
        `🧠 ${sym.label} VERDICT`,
        `Score: ${a.score}/100`,
        `⚠️ Verdict: ${verdictWord(a.verdict)}`,
        "",
        a.explanation,
        "",
        "📚 Educational only — ye financial advice nahi hai.",
      ].join("\n");
    }
    if (/\bchart\b/.test(lower)) {
      document.querySelector("canvas")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return "📈 Chart pe focus kar raha hoon — trading chart dashboard mein upar hai.";
    }
    if (/\b(hello|hi|hey|salam|salam|aoa|assalam)\b/i.test(lower)) {
      return 'Wa alaikum assalam! 👋 Koi symbol likho jaise "BTC analysis" ya "kya karu ab?".';
    }
    return HELP;
  };

  const send = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    const reply = await respond(text);
    setMsgs((m) => [...m, { role: "bot", text: reply }]);
    setBusy(false);
  };

  return (
    <section className="flex h-96 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        <h3 className="text-sm font-semibold text-white">Smart Chat</h3>
        <span className="ml-auto text-[10px] text-zinc-500">Rule-based · No AI API</span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-200"}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="w-fit animate-pulse rounded-2xl bg-zinc-800 px-3 py-2 text-xs text-zinc-400">Analyzing...</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-zinc-800 px-3 py-2">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => void send(q)} disabled={busy} className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[10px] text-zinc-300 transition-colors hover:border-indigo-500 hover:text-white disabled:opacity-50">{q}</button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-zinc-800 p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(input); }} placeholder="Sawal likho... (BTC, trend, kya karu)" maxLength={200} className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none" />
        <button type="button" onClick={() => void send(input)} disabled={busy || !input.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">Send</button>
      </div>
      <p className="px-3 pb-2 text-[9px] text-zinc-600">📚 Educational only — not financial advice.</p>
    </section>
  );
}

