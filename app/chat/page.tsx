"use client";

// AI Assistant chat page — single window, fast, text-only replies.
// Educational analysis only. Not financial advice.
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loadSignalBackup, saveSignalBackup, subscribeSignals, type CloudDoc } from "@/src/lib/signalCloud";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

const STORAGE_KEY = "ai-chat:sessions:v1";
const ACTIVE_KEY = "ai-chat:active:v1";
const MAX_HISTORY = 10; // last 10 chats in the dropdown
const HISTORY_TURNS = 3; // send only the last 3 messages (fast)
const TIMEOUT_MS = 10000; // 10s max

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: number;
}

interface Session {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

/** MASLA 3 — suggested questions shown while a signal discussion is active. */
const SIGNAL_QUESTIONS = [
  "Explain this pattern",
  "What's the risk?",
  "When to exit?",
  "Should I take this trade?",
  "What if it goes wrong?",
];

/** Client cache for common queries so repeat asks are instant. */
const queryCache = new Map<string, string>();

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Short string field of a cloud signal doc, or null. */
function sigStr(signal: CloudDoc, key: string): string | null {
  const value = signal[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Finite number field of a cloud signal doc, or null. */
function sigNum(signal: CloudDoc, key: string): number | null {
  const value = signal[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Newest-first signal list (max 10). */
function sortSignals(list: CloudDoc[]): CloudDoc[] {
  return [...list]
    .filter((signal) => typeof signal?.symbol === "string")
    .sort((a, b) => (sigNum(b, "createdAt") ?? 0) - (sigNum(a, "createdAt") ?? 0))
    .slice(0, 10);
}

function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean || "New chat";
}

function loadSessions(): Session[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return (parsed as Session[])
      .filter((s) => s && typeof s.id === "string" && Array.isArray(s.messages))
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function loadActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function newSession(): Session {
  return { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
}

/** Text-only reply extraction: never expose candles or raw numbers. */
function extractReply(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const candidate = record.response ?? record.reply ?? record.content ?? record.text;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: BG, color: MUTED }}>Loading chat…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const symbolParam = searchParams.get("symbol")?.trim() ?? "";
  const handledSymbolRef = useRef<string>("");
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string>(() => loadActive() ?? loadSessions()[0]?.id ?? newSession().id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState(""); // typing effect for the streaming reply
  const [showHistory, setShowHistory] = useState(false);
  // MASLA 3 — latest signals from Firestore (or localStorage backup) + the
  // signal currently being discussed in this chat.
  const [signals, setSignals] = useState<CloudDoc[]>([]);
  const [signalCtx, setSignalCtx] = useState<CloudDoc | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typingTimer = useRef<number | null>(null);

  // Ensure the active session always exists in the list.
  useEffect(() => {
    setSessions((prev) => (prev.some((s) => s.id === activeId) ? prev : [currentOrNew(activeId), ...prev]));
  }, [activeId]);

  // MASLA 3 — load the latest signal (instant restore from the localStorage
  // backup, then live updates from the Firestore `signals` collection).
  useEffect(() => {
    setSignals(sortSignals(loadSignalBackup()));
    const unsubscribe = subscribeSignals((fresh) => {
      const sorted = sortSignals(fresh);
      setSignals(sorted);
      saveSignalBackup(sorted);
    });
    return unsubscribe;
  }, []);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? currentOrNew(activeId),
    [sessions, activeId]
  );

  const updateActive = useCallback((messages: Message[], title?: string) => {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === activeId
          ? {
              ...s,
              messages,
              title: title ?? (s.messages.length === 0 && messages[0] ? titleFrom(messages[0].text) : s.title),
              updatedAt: Date.now(),
            }
          : s
      );
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_HISTORY)));
        localStorage.setItem(ACTIVE_KEY, activeId);
      } catch { /* ignore */ }
      return next;
    });
  }, [activeId]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active.messages.length, typed, loading]);

  useEffect(() => () => {
    if (typingTimer.current) window.clearInterval(typingTimer.current);
    abortRef.current?.abort();
  }, []);

  const runTyping = useCallback((full: string) => {
    if (typingTimer.current) window.clearInterval(typingTimer.current);
    setTyped("");
    // Fast typing effect: reveal a few chars per tick so it feels like streaming.
    const step = Math.max(2, Math.ceil(full.length / 90));
    let index = 0;
    typingTimer.current = window.setInterval(() => {
      index = Math.min(full.length, index + step);
      setTyped(full.slice(0, index));
      if (index >= full.length && typingTimer.current) {
        window.clearInterval(typingTimer.current);
        typingTimer.current = null;
      }
    }, 16);
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: uid(), role: "user", text, time: Date.now() };
    const nextMessages = [...active.messages, userMsg];
    updateActive(nextMessages);
    setInput("");
    setLoading(true);
    setTyped("");

    const cacheKey = text.toLowerCase();
    // Cache hit for common queries (BTC, Gold, etc.) — instant reply.
    // Signal discussions skip the cache: every answer is signal-specific.
    const cached = signalCtx ? undefined : queryCache.get(cacheKey);
    if (cached) {
      runTyping(cached);
      setLoading(false);
      updateActive([...nextMessages, { id: uid(), role: "assistant", text: cached, time: Date.now() }]);
      setTyped("");
      return;
    }

    // Send only the last 3 turns as history (fast).
    const history = nextMessages.slice(-HISTORY_TURNS * 2, -1).map((m) => ({ role: m.role, content: m.text }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, signalContext: signalCtx ?? undefined }),
        signal: controller.signal,
      });
      const payload: unknown = await res.json().catch(() => null);
      const reply = extractReply(payload) || "Sorry, main abhi jawab nahi de paaya. Thodi der baad try karein.";
      if (!signalCtx) queryCache.set(cacheKey, reply);
      runTyping(reply);
      updateActive([...nextMessages, { id: uid(), role: "assistant", text: reply, time: Date.now() }]);
    } catch {
      const errText = "Connection slow ya timeout ho gaya. Dobara try karein.";
      runTyping(errText);
      updateActive([...nextMessages, { id: uid(), role: "assistant", text: errText, time: Date.now() }]);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
      setTyped("");
    }
  }, [active.messages, loading, signalCtx, updateActive, runTyping]);

  const newChat = () => {
    const session = newSession();
    setActiveId(session.id);
    setSessions((prev) => [session, ...prev].slice(0, MAX_HISTORY));
    setTyped("");
    setShowHistory(false);
    try {
      localStorage.setItem(ACTIVE_KEY, session.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([session, ...loadSessions()].slice(0, MAX_HISTORY)));
    } catch { /* ignore */ }
  };

  const openSession = (id: string) => {
    setActiveId(id);
    setTyped("");
    setShowHistory(false);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
  };

  const latestSignal = signals[0] ?? null;

  // MASLA 3 — "Discuss this signal": load the signal context into the chat so
  // every following question is answered against THIS signal's data. Reused by
  // the "Discuss this signal" button and the /chat?symbol= deep-link (Feature 4).
  const loadSignalCtx = (target: CloudDoc) => {
    if (signalCtx) return;
    setSignalCtx(target);
    const symbol = sigStr(target, "symbol") ?? "Signal";
    const pattern = sigStr(target, "chartPattern") ?? sigStr(target, "pattern") ?? "No clear pattern";
    const score = sigNum(target, "score");
    const bias = sigStr(target, "bias") ?? sigStr(target, "direction") ?? "";
    const note: Message = {
      id: uid(),
      role: "assistant",
      text: `🎯 Signal context load ho gaya: ${symbol}\nPattern: ${pattern}${score !== null ? ` | Score: ${score}/100` : ""}${bias ? ` | Direction: ${bias}` : ""}\n\nAb is signal ke baare mein A→Z kuch bhi poochhain — pattern, entry, SL, TP, risk, exit, position size. Neeche diye gaye sawal click karein ya apna sawal likhein.`,
      time: Date.now(),
    };
    updateActive([...active.messages, note]);
  };

  const discussLatest = () => {
    if (!latestSignal) return;
    loadSignalCtx(latestSignal);
  };

  // Feature 4 — when arriving from /chat?symbol=BTCUSDT, auto-load that exact
  // signal once the Firestore list has arrived (handled once per symbol).
  useEffect(() => {
    if (!symbolParam || signalCtx) return;
    if (handledSymbolRef.current === symbolParam) return;
    const match = signals.find((s) => {
      const sym = sigStr(s, "symbol");
      if (!sym) return false;
      const base = sym.toUpperCase().replace(/[-=].*$/, "");
      const want = symbolParam.toUpperCase().replace(/[-=].*$/, "");
      return base === want || sym.toUpperCase() === symbolParam.toUpperCase();
    });
    if (!match) return;
    handledSymbolRef.current = symbolParam;
    loadSignalCtx(match);
  }, [symbolParam, signals, signalCtx, loadSignalCtx]);

  const lastAssistant = active.messages[active.messages.length - 1];
  const isTyping = loading || (typed.length > 0 && lastAssistant?.role !== "assistant");

  return (
    <main className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: TEXT }}>💬 AI Assistant</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={newChat}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: GREEN, color: BG }}
          >
            New Chat
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: CARD, color: TEXT, borderColor: BORDER }}
            >
              History ▾
            </button>
            {showHistory && (
              <div
                className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border shadow-lg"
                style={{ backgroundColor: CARD, borderColor: BORDER }}
              >
                {sessions.length === 0 ? (
                  <p className="px-3 py-2 text-xs" style={{ color: MUTED }}>No chats yet.</p>
                ) : (
                  sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSession(s.id)}
                      className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-[#22263199]"
                      style={{ color: s.id === activeId ? GREEN : TEXT }}
                    >
                      {s.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages (scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-2xl border p-3"
        style={{ backgroundColor: BG, borderColor: BORDER }}
      >
        {active.messages.length === 0 && !loading && (
          <p className="py-8 text-center text-sm" style={{ color: MUTED }}>
            Salam! Kuch bhi poochhein — koi bhi coin (BTC, DOGE, SOL…), market scan, trading concepts, ya apne last signal ki A→Z discussion. 👋
          </p>
        )}
        {active.messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[80%] rounded-2xl px-3 py-2"
              style={{
                backgroundColor: m.role === "user" ? GREEN : CARD,
                color: m.role === "user" ? BG : TEXT,
                border: m.role === "assistant" ? `1px solid ${BORDER}` : "none",
              }}
            >
              <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
              <p className="mt-1 text-[10px] opacity-70">
                {new Date(m.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl border px-3 py-2" style={{ backgroundColor: CARD, borderColor: BORDER }}>
              <span className="flex gap-1">
                <Dot /> <Dot delay={150} /> <Dot delay={300} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* MASLA 3 — last-signal card (discuss A→Z in chat) */}
      {latestSignal && (
        <div className="mt-3 rounded-2xl border p-3" style={{ backgroundColor: CARD, borderColor: BORDER }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: TEXT }}>
                🎯 Last Signal: {sigStr(latestSignal, "symbol") ?? "—"}
              </p>
              <p className="truncate text-xs" style={{ color: MUTED }}>
                Pattern: {sigStr(latestSignal, "chartPattern") ?? sigStr(latestSignal, "pattern") ?? "No clear pattern"}
                {sigNum(latestSignal, "score") !== null ? ` | Score: ${sigNum(latestSignal, "score")}` : ""}
                {sigStr(latestSignal, "timeframe") ? ` | ${sigStr(latestSignal, "timeframe")}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={discussLatest}
              disabled={Boolean(signalCtx)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: GREEN, color: BG }}
            >
              {signalCtx ? "Discussing…" : "Discuss this signal"}
            </button>
          </div>
        </div>
      )}

      {/* Active signal discussion banner */}
      {signalCtx && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ backgroundColor: CARD, borderColor: GREEN }}>
          <span className="truncate text-xs font-semibold" style={{ color: TEXT }}>
            🎯 Discussing: {sigStr(signalCtx, "symbol") ?? "Signal"}
          </span>
          <button
            type="button"
            onClick={() => setSignalCtx(null)}
            className="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: MUTED, borderColor: BORDER }}
          >
            ✕ End
          </button>
        </div>
      )}

      {/* Quick actions — dynamic, not hardcoded */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void send("Scan the market and show me the top high-confluence setups")}
          className="rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: CARD, color: TEXT, borderColor: BORDER }}
        >
          🔍 Scan Market Now
        </button>
        {latestSignal && !signalCtx && (
          <button
            type="button"
            onClick={discussLatest}
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: CARD, color: TEXT, borderColor: BORDER }}
          >
            🎯 Discuss My Last Signal
          </button>
        )}
        {signals.slice(0, 5).map((signal) => {
          const symbol = sigStr(signal, "symbol") ?? "?";
          return (
            <button
              key={`${symbol}-${sigNum(signal, "createdAt") ?? 0}`}
              type="button"
              onClick={() => void send(`${symbol} analysis`)}
              className="rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: CARD, color: TEXT, borderColor: BORDER }}
            >
              {symbol.replace(/[-=].*$/, "")}
            </button>
          );
        })}
      </div>

      {/* MASLA 3 — suggested questions while discussing a signal */}
      {signalCtx && (
        <div className="mt-2 flex flex-wrap gap-2">
          {SIGNAL_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => void send(question)}
              className="rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: CARD, color: GREEN, borderColor: GREEN }}
            >
              {question}
            </button>
          ))}
        </div>
      )}

      {/* Input + Send */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          placeholder="Message..."
          className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
          style={{ backgroundColor: CARD, color: TEXT, borderColor: BORDER }}
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: GREEN, color: BG }}
        >
          Send
        </button>
      </div>

      <footer className="mt-3 text-center text-xs" style={{ color: MUTED }}>
        ⚠️ Educational analysis only. Not financial advice.
      </footer>
    </main>
  );
}

function currentOrNew(id: string): Session {
  return { id, title: "New chat", updatedAt: Date.now(), messages: [] };
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
      style={{ backgroundColor: MUTED, animationDelay: `${delay}ms` }}
    />
  );
}

