type SearchMarket = "crypto" | "forex" | "stocks";

interface AssetSearchResult {
  id: string;
  symbol: string;
  label: string;
  market: SearchMarket;
  source: string;
}

function marketForYahooType(type: unknown): SearchMarket {
  if (type === "CRYPTOCURRENCY") return "crypto";
  if (type === "CURRENCY") return "forex";
  return "stocks";
}

function isSearchMarket(value: string): value is SearchMarket {
  return value === "crypto" || value === "forex" || value === "stocks";
}

const commoditySearchSymbols: Record<string, { symbol: string; label: string }> = {
  gold: { symbol: "GC=F", label: "Gold Futures" },
  xau: { symbol: "GC=F", label: "Gold Futures" },
  xauusd: { symbol: "GC=F", label: "Gold Futures" },
  silver: { symbol: "SI=F", label: "Silver Futures" },
  xag: { symbol: "SI=F", label: "Silver Futures" },
  xagusd: { symbol: "SI=F", label: "Silver Futures" },
  platinum: { symbol: "PL=F", label: "Platinum Futures" },
  palladium: { symbol: "PA=F", label: "Palladium Futures" },
  copper: { symbol: "HG=F", label: "Copper Futures" },
  wti: { symbol: "CL=F", label: "WTI Crude Oil Futures" },
  brent: { symbol: "BZ=F", label: "Brent Crude Oil Futures" },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const requestedMarket = searchParams.get("market") ?? "";

  if (query.length < 2) {
    return Response.json({ results: [] });
  }

  if (requestedMarket && !isSearchMarket(requestedMarket)) {
    return Response.json({ error: "Market must be crypto, forex, or stocks." }, { status: 400 });
  }

  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const commodity = commoditySearchSymbols[normalizedQuery];
  if (commodity) {
    return Response.json({
      results: [{ id: commodity.symbol.toLowerCase(), symbol: commodity.symbol, label: commodity.label, market: "stocks", source: "Yahoo Finance" }],
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const results: AssetSearchResult[] = [];
  const addResult = (result: AssetSearchResult) => {
    if (requestedMarket && result.market !== requestedMarket) return;
    if (!results.some((item) => item.market === result.market && item.symbol === result.symbol)) results.push(result);
  };

  const yahooRequest = async () => {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", query);
    url.searchParams.set("quotesCount", "12");
    url.searchParams.set("newsCount", "0");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) return;

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { quotes?: unknown }).quotes)) return;
    for (const quote of (payload as { quotes: unknown[] }).quotes) {
      if (typeof quote !== "object" || quote === null) continue;
      const item = quote as Record<string, unknown>;
      if (typeof item.symbol !== "string" || !/^[A-Z0-9.^=_-]{1,24}$/.test(item.symbol.toUpperCase())) continue;
      const market = marketForYahooType(item.quoteType);
      const symbol = item.symbol.toUpperCase();
      const name = typeof item.shortname === "string" ? item.shortname : typeof item.longname === "string" ? item.longname : symbol;
      addResult({ id: symbol.toLowerCase(), symbol, label: `${name} (${symbol})`, market, source: "Yahoo Finance" });
    }
  };

  const coinGeckoRequest = async () => {
    if (requestedMarket && requestedMarket !== "crypto") return;
    const url = new URL("https://api.coingecko.com/api/v3/search");
    url.searchParams.set("query", query);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) return;

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { coins?: unknown }).coins)) return;
    for (const coin of (payload as { coins: unknown[] }).coins.slice(0, 10)) {
      if (typeof coin !== "object" || coin === null) continue;
      const item = coin as Record<string, unknown>;
      if (typeof item.id !== "string" || typeof item.symbol !== "string" || typeof item.name !== "string") continue;
      const symbol = `${item.symbol.toUpperCase()}-USD`;
      addResult({ id: item.id, symbol, label: `${item.name} (${item.symbol.toUpperCase()})`, market: "crypto", source: "CoinGecko" });
    }
  };

  const settled = await Promise.allSettled([yahooRequest(), coinGeckoRequest()]);
  const providerUnavailable = settled.every((result) => result.status === "rejected");
  if (providerUnavailable) {
    return Response.json({ error: "Asset search providers are unavailable. Try again shortly." }, { status: 502 });
  }

  const queryIsTicker = /^[A-Z0-9.^=_-]{1,10}$/.test(query);
  results.sort((first, second) => {
    const score = (item: AssetSearchResult) => {
      const label = item.label.toLowerCase();
      const symbol = item.symbol.toLowerCase().replace(/-usd$/, "");
      if (queryIsTicker && symbol === normalizedQuery && item.market !== "crypto") return 0;
      if (queryIsTicker && symbol === normalizedQuery) return 1;
      if (label.startsWith(normalizedQuery)) return 1;
      if (label.includes(normalizedQuery)) return 2;
      return 3;
    };
    return score(first) - score(second);
  });

  return Response.json({ results: results.slice(0, 20) }, { headers: { "Cache-Control": "no-store" } });
}