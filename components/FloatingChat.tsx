"use client";

// Floating AI chat (MASLA 4) — 60x60 green pulse button at the bottom-right
// (fixed, bottom 90px / right 20px / z 9999) opening a 350x500 popup with the
// SAME AI chat logic as /chat: POST /api/chat with the last 3 turns of history,
// a client query cache for instant repeats, a 10s abort timeout and typing
// dots. Full-screen on mobile. Hidden on /chat itself (the full page covers
// it there). Educational analysis only — not financial advice.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#9CA3AF";
const GREEN = "#00C087";

const HISTORY_TURNS = 3; // send only the last 3 messages (fast)
const TIMEOUT_MS = 10000; // 10s max
const QUICK = ["BTC Analysis", "Gold", "EUR/USD", "ETH"];

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: number;
}

/** Client cache for common queries so repeat asks are instant. */
const queryCache = new Map<string, string>();

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Text-only reply extraction: never expose candles or raw numbers. */
function extractReply(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const candidate = record.response ?? record.reply ?? record.content ?? record.text;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export default function FloatingChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  // Abort any in-flight request when the widget unmounts (/chat navigation).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Same send pipeline as app/chat/page.tsx (cache → history → fetch → timeouts).
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;

      const userMsg: Message = { id: uid(), role: "user", text, time: Date.now() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      const cacheKey = text.toLowerCase();
      const cached = queryCache.get(cacheKey);
      if (cached) {
        setMessages([...nextMessages, { id: uid(), role: "assistant", text: cached, time: Date.now() }]);
        setLoading(false);
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
          body: JSON.stringify({ message: text, history }),
          signal: controller.signal,
        });
        const payload: unknown = await res.json().catch(() => null);
        const reply = extractReply(payload) || "Sorry, main abhi jawab nahi de paaya. Thodi der baad try karein.";
        queryCache.set(cacheKey, reply);
        setMessages([...nextMessages, { id: uid(), role: "assistant", text: reply, time: Date.now() }]);
      } catch {
        const errText = "Connection slow ya timeout ho gaya. Dobara try karein.";
        setMessages([...nextMessages, { id: uid(), role: "assistant", text: errText, time: Date.now() }]);
      } finally {
        window.clearTimeout(timeout);
        setLoading(false);
      }
    },
    [messages, loading],
  );

  // Hidden on the full chat page itself.
  if (pathname === "/chat") return null;

  return (
    <>
      {/* 60x60 green pulse button — fixed bottom-right (spec: 90px / 20px / z 9999). */}
      <button
        type="button"
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-[90px] right-5 z-[9999] flex h-[60px] w-[60px] animate-pulse items-center justify-center rounded-full text-2xl shadow-xl transition-transform hover:scale-105"
        style={{ backgroundColor: GREEN, color: BG }}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Popup — full-screen on mobile, 350x500 card above the button on sm+. */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col border sm:inset-auto sm:bottom-[162px] sm:right-5 sm:h-[500px] sm:w-[350px] sm:rounded-2xl sm:shadow-2xl"
          style={{ backgroundColor: BG, borderColor: BORDER }}
          role="dialog"
          aria-label="AI chat"
        >
          {/* Header — close (X) top-right (spec). */}
          <div
            className="flex items-center justify-between border-b px-3 py-2"
            style={{ backgroundColor: CARD, borderColor: BORDER }}
          >
            <p className="text-sm font-bold" style={{ color: TEXT }}>💬 AI Assistant</p>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
              style={{ backgroundColor: BORDER, color: TEXT }}
            >
              ✕
            </button>
          </div>

          {/* Messages (scrollable) */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && !loading && (
              <p className="py-8 text-center text-sm" style={{ color: MUTED }}>
                Salam! Poochein BTC, Gold, EUR/USD ya ETH ke baare mein. 👋
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2"
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
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border px-3 py-2" style={{ backgroundColor: CARD, borderColor: BORDER }}>
                  <span className="flex gap-1">
                    <Dot /> <Dot delay={150} /> <Dot delay={300} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 px-3 pb-1">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: CARD, color: TEXT, borderColor: BORDER }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input + Send */}
          <div className="flex items-center gap-2 border-t p-3" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Message..."
              className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: BG, color: TEXT, borderColor: BORDER }}
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
        </div>
      )}
    </>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
      style={{ backgroundColor: MUTED, animationDelay: `${delay}ms` }}
    />
  );
}