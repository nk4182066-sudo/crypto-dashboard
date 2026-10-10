// AITeacherChat: floating companion chat on the dashboard. Educational tool only.

"use client";

import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  language?: "English" | "Urdu" | "Roman Urdu";
  image?: string | null;
}

interface ChatSession {
  id: string;
  title: string;
  topic: string;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = "ai-teacher-chat-history-v1";

const chatGreeting: ChatMessage = {
  role: "assistant",
  content:
    "Waaleykum Assalam! Main Muhammad Noman's Assistant AI. Main aapko crypto, forex, ya stock market analysis mein madad kar sakta hoon. Koi sawal hai?",
  language: "Roman Urdu",
};

function loadHistory(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ChatSession[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveHistory(sessions: ChatSession[]) {
  try {
    const bounded = sessions.slice(0, 30).map((s) => ({
      ...s,
      messages: s.messages.slice(-40),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    try {
      const textOnly = sessions.map((s) => ({
        ...s,
        messages: s.messages.map((m) => {
          const t = { ...m };
          delete t.image;
          return t;
        }),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function chatTitleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 45)}...` : clean || "New Chat";
}

function createSession(topic = ""): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    topic,
    updatedAt: Date.now(),
    messages: [{ ...chatGreeting }],
  };
}

function formatMessageTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Raw OHLCV dumps (e.g. `1788960600:331.69,332.1,...`) are market context,
 * never a chat reply — hide them so only prose text is displayed.
 */
function showText(content: string): string {
  return content
    .replace(/\b\d{10,13}\s*:\s*\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)+/g, " ")
    .replace(/\b\d{10,13}\s*:\s*\d+(?:\.\d+)?/g, " ")
    .replace(/(?:\s*\|\s*)+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const chatWelcome = `Waaleykum Assalam! Main Muhammad Noman's Assistant AI. Main aapko crypto, forex, ya stock market analysis mein madad kar sakta hoon. Koi sawal hai?`

export default function AITeacherChat() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadHistory());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessions.length > 0 && !activeId) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId]);

  const activeSession = sessions.find((s) => s.id === activeId);

  const chatHistory = sessions.filter((s) => s.id !== activeId);


  const saveAndSync = (updated: ChatSession[]) => {
    setSessions(updated);
    saveHistory(updated);
  };

  const startNewChat = () => {
    const session = createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    setChatOpen(true);
    setInput("");
    setError(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const selectChat = (id: string) => {
    setActiveId(id);
    setChatOpen(true);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !activeId || loading) return;

    setLoading(true);
    setError(null);

    const session = sessions.find((s) => s.id === activeId);
    if (!session) { setLoading(false); return; }

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...session.messages, userMessage];

    // Optimistically store the user's turn, then fill in the assistant reply.
    const withUser: ChatSession = {
      ...session,
      messages: updatedMessages,
      updatedAt: Date.now(),
      title: session.title === "New Chat" ? chatTitleFromMessage(trimmed) : session.title,
    };
    const others = sessions.filter((s) => s.id !== activeId);
    saveAndSync([withUser, ...others]);
    setInput("");

    // OpenAI-style history from prior turns (exclude the greeting).
    const priorHistory = updatedMessages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content !== chatGreeting.content)
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: priorHistory,
        }),
      });

      const data = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || data.error) {
        throw new Error(data.error || "Response aa nahi saka. Dobara koshish karein.");
      }

      // Text-only: strip any raw candle/numerical dumps before displaying.
      const reply = showText(data.reply ?? "").trim()
        || "Sorry, koi jawab nahi mila. Dobara poochhein.";

      const finalSession: ChatSession = {
        ...withUser,
        messages: [...updatedMessages, { role: "assistant", content: reply }],
        updatedAt: Date.now(),
      };
      saveAndSync([finalSession, ...others]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Response aa nahi saka. Dobara koshish karein.";
      setError(message);
      const finalSession: ChatSession = {
        ...withUser,
        messages: [...updatedMessages, { role: "assistant", content: message }],
        updatedAt: Date.now(),
      };
      saveAndSync([finalSession, ...others]);
    } finally {
      setLoading(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  };


  return (
    <>
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-[80px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-lg transition-all hover:from-purple-700 hover:to-blue-700 hover:scale-105"
          aria-label="Open AI Teacher Chat"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      )}

      {chatOpen && (
        <div className="fixed bottom-[80px] right-4 z-40 flex h-[calc(100vh-8rem)] w-[calc(100vw-4rem)] max-w-[420px] flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white">
                <span className="text-sm font-bold">AI</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {activeSession?.title ?? "AI Teacher"}
                </p>
                <p className="text-[10px] text-green-400">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={startNewChat}
                aria-label="New Chat"
                className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setChatOpen(false);
                  setSessions([]);
                  localStorage.removeItem(STORAGE_KEY);
                }}
                aria-label="Close Chat"
                className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* History sidebar */}
          {chatHistory.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col border-r border-zinc-800 overflow-hidden">

              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {sessions.filter((s) => s.id !== activeId).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => selectChat(session.id)}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      session.id === activeId
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="block truncate font-medium">{session.title}</span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      {new Date(session.updatedAt).toLocaleDateString("en-GB")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto p-3"
            role="log"
            aria-live="polite"
          >
            {activeSession?.messages.map((msg, i) => (
              <div
                key={i}
                className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                    msg.role === "user"
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-800 text-zinc-200"
                  }`}
                >
                  {showText(msg.content)}
                  <span
                    className={`block mt-1 text-[9px] ${
                      msg.role === "user" ? "text-purple-200" : "text-zinc-500"
                    }`}
                  >
                    {formatMessageTime(
                      i === 0 ? (msg as any).timestamp ?? Date.now() : Date.now()
                    )}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-zinc-200">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-[10px]">Thinking...</span>
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                placeholder="Message the AI Teacher..."
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
                maxLength={500}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <p className="mt-1 text-[9px] text-zinc-600">
              Educational AI. Always verify with your own analysis.
            </p>
          </div>
        </div>
      )}
    </>
  );
}


