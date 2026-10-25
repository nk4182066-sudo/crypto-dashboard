import { NextResponse } from 'next/server';

// Yahoo Finance chart API - primary source for all non-crypto markets
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

function formatYahooSymbol(market: string, symbol: string): string {
  if (market === 'crypto') {
    return symbol;
  }
  return symbol;
}

function normalizeCandles(raw: any[]): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
  return raw.map((d: any) => ({
    time: d[0] * 1000,
    open: d[1],
    high: d[2],
    low: d[3],
    close: d[4],
    volume: d[5] || 0,
  }));
}

async function getYahooHistory(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  try {
    const url = new URL(YAHOO_URL);
    const intervalMap: Record<string, string> = { '1h': '1h', '4h': '4h', '1d': '1d' };
    const interval = intervalMap[timeframe] ?? '1h';

    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('range', '1mo');
    url.searchParams.set('period1', String(Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60));
    url.searchParams.set('period2', String(Math.floor(Date.now() / 1000)));

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const payload = await res.json() as any;
      const timestamps = payload.chart.result?.[0]?.timestamp ?? [];
      const indicators = payload.chart.result?.[0]?.indicators?.quote?.[0] ?? [];
      const quotes = indicators.map((q: any, i: number) => [timestamps[i], q.open, q.high, q.low, q.close, q.volume] as any[]);
      const reversed = quotes.reverse();
      return reversed.slice(0, limit);
    } else {
      console.warn("\[DATA]\ Yahoo HTTP " + res.status + " for " + symbol + "/" + timeframe);
    }
  } catch (error) {
    console.warn("\[DATA]\ Yahoo fetch error for " + symbol + "/" + timeframe + ": " + (error as Error).message);
  }
  return [];
}

async function getStooqHistory(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  try {
    const res = await fetch("https://stooq.com/q/d/l/?s=" + symbol.toLowerCase() + "&i=d", {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n').slice(1).slice(-100);
      const data = lines.map(l => {
        const [date, open, high, low, close] = l.split(',');
        return {
          date,
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close),
          volume: 0,
        };
      }).filter(d => !isNaN(d.close));
      if (data.length > 0) return data;
    }
  } catch (e) {
    // silent fail - no log spam
  }
  return [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto';
  const symbol = searchParams.get('symbol') || 'AAPL';
  const timeframe = searchParams.get('timeframe') || '1h';

  console.log("[DATA] Requesting " + market + "/" + symbol + "/" + timeframe);

  // Crypto: handled by scanner (MEXC) - this route is for non-crypto
  if (market === 'crypto') {
    return NextResponse.json({ symbol, data: [], source: 'not-handled', count: 0 });
  }

  // Forex, Stocks, Metals: Yahoo Finance primary
  const yahooData = await getYahooHistory(symbol, timeframe, 300);
  console.log("[DATA] " + market + "/" + symbol + "/" + timeframe + " Raw Length: " + (yahooData.length || 0));

  if (yahooData.length > 0) {
    return NextResponse.json({
      symbol,
      data: yahooData,
      source: 'yahoo',
      count: yahooData.length,
    });
  }

  const stooqData = await getStooqHistory(symbol, timeframe, 300);
  console.log("[DATA] " + market + "/" + symbol + "/" + timeframe + " Stooq Raw Length: " + (stooqData.length || 0));

  if (stooqData.length > 0) {
    return NextResponse.json({
      symbol,
      data: stooqData,
      source: 'stooq',
      count: stooqData.length,
    });
  }

  // Final fallback: synthetic data for demonstration
  const now = Date.now();
  const basePrice = 100 + Math.random() * 200;
  const synthetic = Array.from({ length: 100 }, (_, i) => {
    const date = new Date(now - (99 - i) * 24 * 60 * 60 * 1000).toISOString();
    const change = (Math.random() - 0.5) * 2;
    return {
      time: Date.parse(date),
      open: basePrice + change,
      high: basePrice + change + 1,
      low: basePrice + change - 1,
      close: basePrice + change,
      volume: 0,
    };
  });

  console.log("[DATA] " + market + "/" + symbol + "/" + timeframe + " Synthetic Raw Length: " + synthetic.length);
  return NextResponse.json({
    symbol,
    data: synthetic,
    source: 'synthetic',
    count: synthetic.length,
  });
}
