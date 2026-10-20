// GET /api/news — aggregated world market news for the /news page.
//
// Server-side aggregation of free public RSS feeds (CoinDesk, Cointelegraph,
// Decrypt, FXStreet, Investing.com, MarketWatch, BBC Business). Fetching happens
// here (not in the browser) so there is no CORS problem, no third-party script
// and one place to add/remove feeds.
//
// GET /api/news            → 60 latest headlines, newest first.
// GET /api/news?limit=20   → smaller page.
// GET /api/news?tag=Crypto → only that market bucket.
//
// The page refreshes itself every 5 minutes. Educational content only.

import { fetchAllNews, type NewsTag } from "@/src/lib/newsFeeds";

export const dynamic = "force-dynamic";

const VALID_TAGS: NewsTag[] = ["Crypto", "Forex", "Stock", "Gold"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "60");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 120)
    : 60;
  const rawTag = url.searchParams.get("tag");
  const tag = rawTag && VALID_TAGS.includes(rawTag as NewsTag) ? (rawTag as NewsTag) : null;

  try {
    const items = await fetchAllNews(limit);
    const filtered = tag ? items.filter((i) => i.tag === tag) : items;
    return Response.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        count: filtered.length,
        sources: [...new Set(items.map((i) => i.source))],
        items: filtered,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        count: 0,
        sources: [],
        items: [],
        error: err instanceof Error ? err.message : "News fetch failed",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
