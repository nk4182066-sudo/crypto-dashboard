import { NextResponse } from 'next/server';

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
    } catch (e: any) { console.error('[DATA] crypto fetch failed for ' + symbol + ': ' + (e?.message || e)); }
    console.log(`[DATA] ALL EXCHANGES FAILED for ${symbol}`);
    return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
  }
  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();
  console.log(`[DATA] TwelveData Key: ${apiKey ? 'LOADED' : 'MISSING'}`);
  let tdSymbol = symbol.replace(/-/g, '/').toUpperCase();
  if (!tdSymbol.includes('/') && tdSymbol.length === 6) tdSymbol = tdSymbol.slice(0,3) + '/' + tdSymbol.slice(3);
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1h&apikey=${apiKey}&outputsize=200`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    console.log(`[DATA] TwelveData Response for ${symbol}: Status ${res.status}`);
    const body = await res.json();
    if (!res.ok || body?.status === 'error' || !Array.isArray(body?.values)) throw new Error(body?.message || `HTTP ${res.status}`);
    const data = body.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
    console.log(`[DATA] TwelveData Success for ${symbol}: Length: ${data.length}`);
    if (data.length > 0) return NextResponse.json({ symbol, data, source: 'twelvedata', count: data.length });
    return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
  } catch (e: any) {
    console.error('[DATA] TwelveData error for ' + symbol + ': ' + (e?.message || e));
    return NextResponse.json({ symbol, data: [], source: 'none', count: 0, error: 'TwelveData failed: ' + (e?.message || e) });
  }
}
