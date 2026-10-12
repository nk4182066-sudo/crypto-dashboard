import { cached } from "@/src/lib/cache";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  category: "Crypto" | "Forex";
  publishedAt: string;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readTag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ? decodeXml(match[1]).trim() : "";
}

async function readFeed(url: string, source: string, category: NewsItem["category"]): Promise<NewsItem[]> {
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${source} returned ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .flatMap((match): NewsItem[] => {
      const item = match[1];
      const title = readTag(item, "title");
      const rawLink = readTag(item, "link") || readTag(item, "guid");
      const publishedAt = readTag(item, "pubDate");
      try {
        if (!title) return [];
        return [{ title, url: new URL(rawLink).toString(), source, category, publishedAt }];
      } catch {
        return [];
      }
    })
    .slice(0, 12);
}

async function readNews() {
  const [crypto, forex] = await Promise.allSettled([
    readFeed("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk", "Crypto"),
    readFeed("https://www.fxstreet.com/rss/news", "FXStreet", "Forex"),
  ]);
  return {
    items: [
      ...(crypto.status === "fulfilled" ? crypto.value : []),
      ...(forex.status === "fulfilled" ? forex.value : []),
    ].sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt)),
    unavailable: [
      ...(crypto.status === "rejected" ? ["CoinDesk"] : []),
      ...(forex.status === "rejected" ? ["FXStreet"] : []),
    ],
    updatedAt: new Date().toISOString(),
  };
}

// Feature 2 — short TTL cache so repeated opens do not refetch the same feed.
async function readSentiment() {
  return cached("phase3:fearGreed", { ttlMs: 5 * 60 * 1000, staleMs: 30 * 60 * 1000 }, async () => {
  const response = await fetch("https://api.alternative.me/fng/?limit=1&format=json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Fear & Greed source returned ${response.status}`);
  const payload = await response.json();
  const item = payload.data?.[0];
  if (!item || !Number.isFinite(Number(item.value))) throw new Error("Fear & Greed data is unavailable");
  return {
    value: Number(item.value),
    label: String(item.value_classification ?? "Unknown"),
    timestamp: Number(item.timestamp) * 1000,
    source: "Alternative.me",
  };
  });
}

// Feature 2 — the weekly calendar rarely changes; cache it for longer.
async function readCalendar() {
  return cached("phase3:calendar", { ttlMs: 30 * 60 * 1000, staleMs: 6 * 60 * 60 * 1000 }, async () => {
  const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Economic calendar source returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Economic calendar data is unavailable");
  const events = payload.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    if (typeof event.title !== "string" || typeof event.date !== "string") return [];
    const timestamp = Date.parse(event.date);
    if (!Number.isFinite(timestamp) || timestamp < Date.now() - 60 * 60 * 1000) return [];
    return [{
      title: event.title,
      country: typeof event.country === "string" ? event.country : "",
      date: event.date,
      impact: typeof event.impact === "string" ? event.impact : "Unspecified",
      forecast: typeof event.forecast === "string" ? event.forecast : "",
      previous: typeof event.previous === "string" ? event.previous : "",
    }];
  });
  return { events: events.slice(0, 80), source: "Forex Factory calendar feed", updatedAt: new Date().toISOString() };
  });
}

async function readWhales() {
  const recentResponse = await fetch("https://mempool.space/api/mempool/recent", { cache: "no-store" });
  if (!recentResponse.ok) throw new Error(`Mempool source returned ${recentResponse.status}`);
  const recent: unknown = await recentResponse.json();
  if (!Array.isArray(recent)) throw new Error("Mempool data is unavailable");
  const transactionIds = recent.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const txid = (item as Record<string, unknown>).txid;
    return typeof txid === "string" ? [txid] : [];
  }).slice(0, 12);
  const transactions = await Promise.allSettled(transactionIds.map(async (txid) => {
    const response = await fetch(`https://mempool.space/api/tx/${encodeURIComponent(txid)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Transaction lookup failed");
    const transaction = await response.json();
    const outputs = Array.isArray(transaction.vout) ? transaction.vout : [];
    const satoshis = outputs.reduce((total: number, output: unknown) => {
      if (!output || typeof output !== "object") return total;
      const value = (output as Record<string, unknown>).value;
      return typeof value === "number" && Number.isFinite(value) ? total + value : total;
    }, 0);
    return { txid, btc: satoshis / 100_000_000, outputs: outputs.length };
  }));
  return {
    transactions: transactions.flatMap((result) => result.status === "fulfilled" && result.value.btc >= 50 ? [result.value] : []).sort((first, second) => second.btc - first.btc),
    thresholdBtc: 50,
    source: "mempool.space",
    updatedAt: new Date().toISOString(),
  };
}

const trendArticles: Record<string, string> = {
  btc: "Bitcoin",
  bitcoin: "Bitcoin",
  eth: "Ethereum",
  ethereum: "Ethereum",
  sol: "Solana",
  solana: "Solana",
  xrp: "Ripple_(payment_protocol)",
  doge: "Dogecoin",
  crypto: "Cryptocurrency",
};

/** Public search-interest proxy: Google has no free official Trends API, so we use Wikipedia pageviews. */
async function readTrends(keyword: string) {
  const key = keyword.trim().toLowerCase();
  const article = trendArticles[key] ?? keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const stamp = (date: Date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${stamp(start)}/${stamp(now)}`;
  const response = await fetch(url, { headers: { "User-Agent": "TradingStudentExpertAI/1.0 (analysis dashboard)" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Trends proxy returned ${response.status}`);
  const payload: unknown = await response.json();
  const items = (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)) ? (payload as { items: { views?: unknown }[] }).items : [];
  const views = items.map((item) => Number(item.views)).filter((value) => Number.isFinite(value) && value > 0);
  if (views.length < 10) throw new Error("Trends data is unavailable");
  const max = Math.max(...views);
  const last7 = views.slice(-7);
  const prev7 = views.slice(-14, -7);
  const lastAvg = last7.reduce((total, value) => total + value, 0) / last7.length;
  const prevAvg = prev7.length ? prev7.reduce((total, value) => total + value, 0) / prev7.length : lastAvg;
  return {
    keyword,
    interest: Math.round((lastAvg / max) * 100),
    changePercent: prevAvg === 0 ? 0 : ((lastAvg - prevAvg) / prevAvg) * 100,
    source: "Wikipedia pageviews (proxy for Google search interest)",
    updatedAt: new Date().toISOString(),
  };
}

const bullishWords = ["moon", "bull", "bullish", "buy", "long", "pump", "rally", "breakout", "up only", "gains", "green", "ath", "all time high", "accumulate"];
const bearishWords = ["bear", "bearish", "dump", "crash", "sell", "short", "down", "red", "loss", "fear", "rug", "scam", "capitulation", "rekt"];

/** Social sentiment proxy: Crypto Twitter has no free API, so we read public Reddit crypto posts. */
async function readSocial(keyword: string) {
  const base = keyword.split(/[-/]/)[0].toLowerCase();
  const response = await fetch("https://www.reddit.com/r/CryptoCurrency/hot.json?limit=60", {
    headers: { "User-Agent": "TradingStudentExpertAI/1.0 (analysis dashboard)" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Social proxy returned ${response.status}`);
  const payload: unknown = await response.json();
  const children = payload && typeof payload === "object" ? (payload as { data?: { children?: unknown[] } }).data?.children : undefined;
  if (!Array.isArray(children)) throw new Error("Social data is unavailable");
  const titles = children.flatMap((child) => {
    if (!child || typeof child !== "object") return [];
    const title = (child as { data?: { title?: unknown } }).data?.title;
    return typeof title === "string" ? [title.toLowerCase()] : [];
  });
  const relevant = titles.filter((title) => title.includes(base) || base === "crypto" || base === "btc");
  let bullish = 0;
  let bearish = 0;
  for (const title of relevant) {
    if (bullishWords.some((word) => title.includes(word))) bullish += 1;
    if (bearishWords.some((word) => title.includes(word))) bearish += 1;
  }
  const score = Math.round(((bullish - bearish) / Math.max(bullish + bearish, 1) * 0.5 + 0.5) * 100);
  return { keyword, mentions: relevant.length, bullish, bearish, score, source: "Reddit r/CryptoCurrency (proxy for Crypto Twitter)", updatedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const keyword = url.searchParams.get("q") ?? "Bitcoin";
  try {
    if (type === "news") return Response.json(await readNews(), { headers: { "Cache-Control": "no-store" } });
    if (type === "sentiment") return Response.json(await readSentiment(), { headers: { "Cache-Control": "no-store" } });
    if (type === "calendar") return Response.json(await readCalendar(), { headers: { "Cache-Control": "no-store" } });
    if (type === "whales") return Response.json(await readWhales(), { headers: { "Cache-Control": "no-store" } });
    if (type === "trends") return Response.json(await readTrends(keyword), { headers: { "Cache-Control": "no-store" } });
    if (type === "social") return Response.json(await readSocial(keyword), { headers: { "Cache-Control": "no-store" } });
    return Response.json({ error: "A valid feed type is required." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed request failed";
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}