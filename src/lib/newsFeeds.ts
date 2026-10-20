/**
 * lib/newsFeeds.ts - live world market news from public RSS feeds.
 *
 * The /news page aggregates headlines from free, no-API-key RSS sources and
 * classifies each item into a market bucket (Crypto / Forex / Stock / Gold)
 * so the user can filter the feed. All fetching happens server-side (the API
 * route) so there is no CORS problem in the browser and no third-party script.
 *
 * Educational content only - not financial advice.
 */

export type NewsTag = "Crypto" | "Forex" | "Stock" | "Gold";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  link: string;
  /** ISO timestamp, or null when the feed has no usable date. */
  publishedAt: string | null;
  /** Human readable relative time, e.g. "2 hours ago". */
  timeAgo: string;
  tag: NewsTag;
  /** The feed's own category headline (e.g. "Forex News"). */
  category: string;
}

export interface NewsFeed {
  /** Unique id of the feed (used for dedupe). */
  key: string;
  name: string;
  url: string;
  /** Bucket headlines land in by default; title keywords can override it. */
  defaultTag: NewsTag;
}

export const NEWS_FEEDS: NewsFeed[] = [
  { key: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", defaultTag: "Crypto" },
  { key: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss", defaultTag: "Crypto" },
  { key: "decrypt", name: "Decrypt", url: "https://decrypt.co/feed", defaultTag: "Crypto" },
  { key: "investing-forex", name: "Investing.com", url: "https://www.investing.com/rss/news_1.rss", defaultTag: "Forex" },
  { key: "fxstreet", name: "FXStreet", url: "https://www.fxstreet.com/rss/news", defaultTag: "Forex" },
  { key: "investing-commodities", name: "Investing.com", url: "https://www.investing.com/rss/news_11.rss", defaultTag: "Gold" },
  { key: "investing-stocks", name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss", defaultTag: "Stock" },
  { key: "marketwatch", name: "MarketWatch", url: "https://www.marketwatch.com/rss/topstories", defaultTag: "Stock" },
  { key: "bbc-business", name: "BBC Business", url: "https://www.bbc.com/news/business/rss.xml", defaultTag: "Stock" },
];

/** Keyword overrides - a headline that mentions gold lands in "Gold" even if it
 *  came from a crypto feed, and vice versa. */
const TAG_RULES: { tag: NewsTag; words: RegExp }[] = [
  { tag: "Gold", words: /\b(gold|xau|silver|bullion|precious metal|commodit\w*|oil|crude|wti|brent)\b/i },
  { tag: "Forex", words: /\b(forex|currency|currencies|dollar|euro|sterling|pound|yen|yuan|renminbi|rupee|franc|won|krone|swiss franc|central bank|fed\b|ecb\b|boj\b|rate cut|rate hike)\b/i },
  { tag: "Stock", words: /\b(stocks?|equit\w+|shares?|nasdaq|dow jones|s&p 500|wall street|earnings|ipo|index)\b/i },
  { tag: "Crypto", words: /\b(bitcoin|btc\b|ethereum|eth\b|crypto\w*|blockchain|defi|stablecoin|token|coinbase|binance|solana|xrp|dogecoin|sec\b|cftc\b|etf)\b/i },
];

/** Classify one headline into a market bucket. */
export function classifyTag(title: string, defaultTag: NewsTag): NewsTag {
  for (const rule of TAG_RULES) {
    if (rule.words.test(title)) return rule.tag;
  }
  return defaultTag;
}

/** Decode the XML entities that show up in RSS titles and descriptions. */
export function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Strip any HTML tags left inside a feed description. */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ");
}
/** Pull the first <link>...</link> out of an RSS <item> block. */
function extractLink(block: string): string {
  const atom = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return atom[1];
  const plain = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (plain) return decodeEntities(plain[1]).trim();
  const guid = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (guid) {
    const value = decodeEntities(guid[1]).trim();
    if (/^https?:\/\//i.test(value)) return value;
  }
  return "";
}

/** Pull a date out of an RSS item (pubDate / dc:date / atom updated). */
function extractDate(block: string): string | null {
  const patterns = [
    /<pubDate>([\s\S]*?)<\/pubDate>/i,
    /<dc:date>([\s\S]*?)<\/dc:date>/i,
    /<updated>([\s\S]*?)<\/updated>/i,
    /<published>([\s\S]*?)<\/published>/i,
  ];
  for (const p of patterns) {
    const m = block.match(p);
    if (!m) continue;
    const ts = Date.parse(decodeEntities(m[1]).trim());
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return null;
}

/** Pull the headline out of an RSS item. */
function extractTitle(block: string): string {
  const m = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return stripHtml(decodeEntities(m[1])).replace(/\s+/g, " ").trim();
}

/** Pull the feed-level category headline (the first <title> of the channel). */
function extractChannelTitle(xml: string): string {
  const head = xml.split(/<item[\s>]/i)[0] ?? "";
  const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return stripHtml(decodeEntities(m[1])).replace(/\s+/g, " ").trim();
}

/** "3 hours ago" / "just now" / "2 days ago" - English, matches the UI copy. */
export function formatTimeAgo(iso: string | null): string {
  if (!iso) return "recently";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "recently";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Parse an RSS/Atom XML document into normalised items.
 * No XML library needed - the feeds we use are simple and well-formed enough
 * that a targeted regex pass is reliable and keeps the dependency list short.
 */
export function parseFeed(xml: string, feed: NewsFeed): NewsItem[] {
  const category = extractChannelTitle(xml);
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks) {
    const title = extractTitle(block);
    if (!title) continue;
    const link = extractLink(block);
    if (!link) continue;
    const publishedAt = extractDate(block);
    items.push({
      id: `${feed.key}:${link}`,
      title,
      source: feed.name,
      link,
      publishedAt,
      timeAgo: formatTimeAgo(publishedAt),
      tag: classifyTag(title, feed.defaultTag),
      category,
    });
  }
  return items;
}

/** Fetch one feed and parse it. Returns [] on any failure (never throws).
 *  Some publishers (FXStreet, Investing.com) intermittently stall or throttle
 *  requests coming from a datacenter IP, so we retry once with a short pause
 *  before giving up on that feed. */
export async function fetchFeed(feed: NewsFeed, attempt = 0): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        // Some publishers serve a stripped feed to unknown agents.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      if (attempt < 1 && res.status >= 500) {
        await new Promise((r) => setTimeout(r, 600));
        return fetchFeed(feed, attempt + 1);
      }
      return [];
    }
    const xml = await res.text();
    const items = parseFeed(xml, feed);
    if (items.length === 0 && attempt < 1) {
      // A 200 with zero items usually means a throttled/empty response body.
      await new Promise((r) => setTimeout(r, 600));
      return fetchFeed(feed, attempt + 1);
    }
    return items;
  } catch {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 600));
      return fetchFeed(feed, attempt + 1);
    }
    return [];
  }
}

/** Fetch every feed (small batches to avoid tripping per-host rate limits) and
 *  merge into one time-sorted, de-duplicated list. */
export async function fetchAllNews(limit = 60): Promise<NewsItem[]> {
  const results: NewsItem[][] = [];
  const BATCH = 3;
  for (let i = 0; i < NEWS_FEEDS.length; i += BATCH) {
    const batch = NEWS_FEEDS.slice(i, i + BATCH);
    const settled = await Promise.all(batch.map((f) => fetchFeed(f)));
    results.push(...settled);
  }
  const merged = results.flat();
  // Newest first. Items without a date sink to the bottom.
  merged.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  // Cap the number of items per source so one fast-publishing feed (BBC,
  // Investing.com) cannot crowd out the rest of the world's news.
  const PER_SOURCE = 8;
  const perSource = new Map<string, number>();
  const capped = merged.filter((item) => {
    const seen = perSource.get(item.source) ?? 0;
    if (seen >= PER_SOURCE) return false;
    perSource.set(item.source, seen + 1);
    return true;
  });

  // Dedupe by link (the same story can appear in two feeds).
  const seen = new Set<string>();
  const unique = capped.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
  return unique.slice(0, limit);
}