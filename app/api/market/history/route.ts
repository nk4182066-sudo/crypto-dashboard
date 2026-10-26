import { NextResponse } from 'next/server';

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function getYahooHistory(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  try {
    const intervalMap: Record<string, string> = { '1h': '1h', '4h': '1h', '1d': '1d' };
    const interval = intervalMap[timeframe] ?? '1h';
    const url = `${YAHOO_URL}/${encodeURIComponent(symbol)}?interval=${interval}&range=1mo`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const payload = await res.json() as any;
      const result = payload.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens = quote.open ?? [];
      const highs = quote.high ?? [];
      const lows = quote.low ?? [];
      const closes = quote.close ?? [];
      const volumes = quote.volume ?? [];
      const quotes = timestamps.map((t: number, i: number) => [t * 1000, opens[i], highs[i], lows[i], closes[i], volumes[i] ?? 0]);
      const filtered = quotes.filter((q: any[]) => q[1] != null && q[4] != null);
      return filtered.slice(-limit).reverse();
    } else {
      console.warn(`[DATA] Yahoo HTTP ${res.status} for ${symbol}/${timeframe}`);
    }
  } catch (error) {
    console.warn(`[DATA] Yahoo fetch error for ${symbol}/${timeframe}: ${(error as Error).message}`);
  }
  return [];
}

async function getStooqHistory(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  try {
    const res = await fetch(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n').slice(1).slice(-100);
      const data = lines.map(l => {
        const [date, open, high, low, close] = l.split(',');
        return { time: Date.parse(date), open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close), volume: 0 };
      }).filter(d => !isNaN(d.close));
      if (data.length > 0) return data.slice(-limit);
    }
  } catch (e) {}
  return [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto';
  const symbol = searchParams.get('symbol') || 'AAPL';
  const timeframe = searchParams.get('timeframe') || '1h';
  console.log(`[DATA] Requesting ${market}/${symbol}/${timeframe}`);
  if (market === 'crypto') {
    return NextResponse.json({ symbol, data: [], source: 'not-handled', count: 0 });
  }
  const yahooData = await getYahooHistory(symbol, timeframe, 300);
  console.log(`[DATA] ${market}/${symbol}/${timeframe} Raw Length: ${yahooData.length || 0}`);
  if (yahooData.length > 0) {
    return NextResponse.json({ symbol, data: yahooData, source: 'yahoo', count: yahooData.length });
  }
  const stooqData = await getStooqHistory(symbol, timeframe, 300);
  console.log(`[DATA] ${market}/${symbol}/${timeframe} Stooq Raw Length: ${stooqData.length || 0}`);
  if (stooqData.length > 0) {
    return NextResponse.json({ symbol, data: stooqData, source: 'stooq', count: stooqData.length });
  }
  return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
}
