import { NextResponse } from 'next/server';

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

function yahooSymbol(symbol: string, market: string): string {
  if (symbol.includes('=')) return symbol;
  if (market === 'forex') return `${symbol}=X`;
  if (market === 'metals' && symbol === 'XAUUSD') return 'GC=F';
  return symbol;
}

async function getYahooHistory(symbol: string, market: string, timeframe: string, limit: number): Promise<any[]> {
  const ys = yahooSymbol(symbol, market);
  try {
    const intervalMap: Record<string, string> = { '1h': '1h', '4h': '1h', '1d': '1d' };
    const interval = intervalMap[timeframe] ?? '1h';
    const url = `${YAHOO_URL}/${encodeURIComponent(ys)}?interval=${interval}&range=1mo`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = res.ok ? await res.json() : null;
    console.log(`[DATA] Yahoo Response for ${symbol}: Status ${res.status}, Length: ${Array.isArray(data?.chart?.result?.[0]?.timestamp) ? data.chart.result[0].timestamp.length : 0}`);
    if (res.ok) {
      const result = data.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens = quote.open ?? [];
      const highs = quote.high ?? [];
      const lows = quote.low ?? [];
      const closes = quote.close ?? [];
      const volumes = quote.volume ?? [];
      const quotes = timestamps.map((t: number, i: number) => ({ time: t * 1000, open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] ?? 0 })).filter((q: any) => q.open != null && q.close != null);
      return quotes.slice(-limit);
    }
  } catch (e: any) {
    console.error('[DATA] Forex fetch failed for ' + symbol + ': ' + (e?.message || e));
  }
  return [];
}

async function getStooqHistory(symbol: string, limit: number): Promise<any[]> {
  try {
    console.log(`[DATA] Trying Stooq for ${symbol}`);
    const s = symbol.toLowerCase().replace('=x','').replace('usd','');
    const res = await fetch(`https://stooq.com/q/d/l/?s=${s}&i=d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n').slice(1).slice(-100);
      const data = lines.map(l => { const [date, open, high, low, close] = l.split(','); return { time: Date.parse(date), open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close), volume: 0 }; }).filter(d => !isNaN(d.close));
      if (data.length > 0) return data.slice(-limit);
    }
  } catch (e: any) {
    console.error('[DATA] Stooq failed for ' + symbol + ': ' + (e?.message || e));
  }
  return [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto';
  const symbol = searchParams.get('symbol') || 'AAPL';
  const timeframe = searchParams.get('timeframe') || '1h';
  console.log(`[HISTORY API] Fetching data for ${symbol}`);
  if (market === 'crypto') {
    const pair = symbol.replace(/^([A-Za-z0-9]+)-(USD|USDT)$/, '$1USDT');
    try {
      const res = await fetch(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${pair}&granularity=1h&limit=200`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json() as any;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
        if (candles.length > 0) { console.log(`[DATA] crypto ${symbol}: Length: ${candles.length}`); return NextResponse.json({ symbol, data: candles, source: 'bitget', count: candles.length }); }
      }
    } catch (e: any) {
      console.error('[DATA] crypto fetch failed for ' + symbol + ': ' + (e?.message || e));
    }
    console.log(`[DATA] ALL EXCHANGES FAILED for ${symbol}`);
    return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
  }
  let data = await getYahooHistory(symbol, market, timeframe, 300);
  if (data.length === 0) data = await getStooqHistory(symbol, 300);
  console.log(`[DATA] ${market} ${symbol}: Length: ${data.length}`);
  if (data.length > 0) return NextResponse.json({ symbol, data, source: 'yahoo/stooq', count: data.length });
  return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
}
