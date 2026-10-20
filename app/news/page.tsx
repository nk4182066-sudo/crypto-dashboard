"use client";
import AuthGuard from "@/components/AuthGuard";

// News — live world market headlines (Crypto, Forex, Stocks, Gold/Metals).
// Data comes from /api/news, which aggregates free public RSS feeds server-side.
// The page auto-refreshes every 5 minutes. Educational only. Not financial advice.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const BG = "#0B0E11";
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const GREEN = "#00C087";

type NewsTag = "Crypto" | "Forex" | "Stock" | "Gold";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  link: string;
  publishedAt: string | null;
  timeAgo: string;
  tag: NewsTag;
  category: string;
}

const TAGS: { key: NewsTag | "All"; label: string; color: string }[] = [
  { key: "All", label: "All", color: GREEN },
  { key: "Crypto", label: "Crypto", color: "#F7931A" },
  { key: "Forex", label: "Forex", color: "#3B82F6" },
  { key: "Stock", label: "Stock", color: "#8B5CF6" },
  { key: "Gold", label: "Gold", color: "#EAB308" },
];

/** Auto-refresh interval — 5 minutes, per spec. */
const REFRESH_MS = 5 * 60 * 1000;

function NewsContent() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [tag, setTag] = useState<NewsTag | "All">("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/news?limit=60", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { items?: NewsItem[]; error?: string };
      setItems(Array.isArray(data.items) ? data.items : []);
      setError(null);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load news");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 5 minute auto-refresh.
  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(
    () => (tag === "All" ? items : items.filter((i) => i.tag === tag)),
    [items, tag],
  );


  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: BG }}>
      {/* Header */}
      <div className="px-4 pt-5">
        <h1 className="text-xl font-bold" style={{ color: TEXT }}>
          📰 News
        </h1>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          {loading
            ? "Live market headlines loading..."
            : `Latest ${filtered.length} headlines from Crypto, Forex, Stock & Gold sources${
                updatedAt ? ` · updated ${updatedAt}` : ""
              }`}
        </p>
      </div>

      {/* Tag filter */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap px-4 py-4">
        {TAGS.map((t) => {
          const active = tag === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTag(t.key)}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={
                active
                  ? { backgroundColor: t.color, color: "#0B0E11" }
                  : { backgroundColor: CARD, color: MUTED, border: `1px solid ${BORDER}` }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="px-4 pb-3 text-sm" style={{ color: "#F6465D" }}>
          ⚠️ {error}
        </p>
      )}


      {/* News cards */}
      <div className="mx-4 flex flex-col gap-3">
        {loading && items.length === 0 && (
          <div className="animate-pulse space-y-3" role="status" aria-label="Loading news">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
                <div className="h-3 w-24 rounded" style={{ backgroundColor: "#2B3139" }} />
                <div className="mt-3 h-4 w-full rounded" style={{ backgroundColor: "#23272f" }} />
                <div className="mt-2 h-4 w-4/5 rounded" style={{ backgroundColor: "#23272f" }} />
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="rounded-2xl border p-8 text-center" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <p className="text-sm" style={{ color: MUTED }}>
              Abhi koi news load nahi hui. Thori der baad refresh ho jayega.
            </p>
          </div>
        )}

        {filtered.map((item) => {
          const tagColor = TAGS.find((t) => t.key === item.tag)?.color ?? GREEN;
          return (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border p-4 transition-opacity hover:opacity-80"
              style={{ backgroundColor: CARD, borderColor: BORDER }}
            >
              {/* Source + time + tag */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold" style={{ color: TEXT }}>
                  {item.source}
                </span>
                <span className="text-xs" style={{ color: MUTED }}>
                  · {item.timeAgo}
                </span>
                <span
                  className="ml-auto rounded px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: `${tagColor}22`, color: tagColor }}
                >
                  {item.tag}
                </span>
              </div>

              {/* Headline */}
              <h2 className="mt-2 text-sm font-semibold leading-snug" style={{ color: TEXT }}>
                {item.title}
              </h2>
            </a>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 px-4 pb-4 text-center">
        <Link
          href="/signals"
          className="inline-block rounded-xl px-5 py-2.5 text-sm font-bold"
          style={{ backgroundColor: GREEN, color: BG }}
        >
          View 85+ Signals
        </Link>
        <p className="mt-4 text-xs" style={{ color: MUTED }}>
          ⚠️ Educational only. Headlines are from third-party publishers. Not financial advice.
        </p>
      </div>
    </main>
  );
}

export default function NewsPage() {
  return (
    <AuthGuard>
      <NewsContent />
    </AuthGuard>
  );
}
