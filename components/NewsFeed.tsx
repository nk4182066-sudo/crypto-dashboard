// News feed from public API. Educational only.

"use client";

import { useCallback, useEffect, useState } from "react";

interface CoinGeckoNewsItem {
  id: string;
  title: string;
  source: { name: string; url: string };
  image: string;
  date_added: string;
  tickers: string[];
  platform: string;
}

interface CoinGeckoNewsResponse {
  news: CoinGeckoNewsItem[];
}

interface NewsFeedProps {
  limit?: number;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hours ago`;
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NewsFeed({ limit = 10 }: NewsFeedProps) {
  const [news, setNews] = useState<CoinGeckoNewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/news?order_by=date_added&sort_direction=desc&page=1&pagination=10"
      );
      if (!response.ok) {
        throw new Error("Failed to fetch news");
      }
      const data: CoinGeckoNewsResponse = await response.json();
      setNews(data.news || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = window.setInterval(fetchNews, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchNews]);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-lg">
      <h2 className="text-lg font-bold text-zinc-200 mb-4">
        📰 Taaza Khabrein
      </h2>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-4 bg-zinc-700 rounded animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm mb-4">
          ⚠️ Error: {error}
        </div>
      )}

      <div className="space-y-4">
        {news.slice(0, limit).map((item) => (
          <a
            key={item.id}
            href={item.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-lg hover:bg-zinc-800 transition-all duration-300 hover:scale-[1.02] border border-zinc-700/50"
          >
            <h3 className="text-sm font-semibold text-zinc-200 line-clamp-2 mb-1">
              {item.title}
            </h3>
            <p className="text-xs text-zinc-400">
              {item.source.name} • {timeAgo(item.date_added)}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
