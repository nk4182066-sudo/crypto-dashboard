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

async function readSentiment() {
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
}

async function readCalendar() {
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

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  try {
    if (type === "news") return Response.json(await readNews(), { headers: { "Cache-Control": "no-store" } });
    if (type === "sentiment") return Response.json(await readSentiment(), { headers: { "Cache-Control": "no-store" } });
    if (type === "calendar") return Response.json(await readCalendar(), { headers: { "Cache-Control": "no-store" } });
    if (type === "whales") return Response.json(await readWhales(), { headers: { "Cache-Control": "no-store" } });
    return Response.json({ error: "A valid feed type is required." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed request failed";
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}