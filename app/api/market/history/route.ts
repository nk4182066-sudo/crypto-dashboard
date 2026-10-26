import { NextResponse } from 'next/server';

export const revalidate = 60;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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

  await sleep(500);

  // METALS -> Binance PAXG
  if (market === 'metals') {
    console.log('[DATA] Fetching Gold via Binance PAXGUSDT');
    try {
      const res = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1h&limit=100', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        if (candles.length > 0) { console.log('[DATA] Binance PAXG Success'); console.log(`[DATA] metals ${symbol}: Length: ${candles.length}`); return NextResponse.json({ symbol, data: candles, source: 'binance-paxg', count: candles.length }); }
      }
    } catch (e: any) { console.error('[DATA] Binance PAXG failed: ' + (e?.message || e)); }
  }

  // STOCKS & FOREX -> TwelveData
  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();
  console.log(`[DATA] TwelveData Key: ${apiKey ? apiKey.slice(0,4) + '...' : 'MISSING'}`);
  try {
    const tdSymbol = market === 'forex' ? `${symbol.replace(/-/g,'').slice(0,3)}/${symbol.replace(/-/g,'').slice(3)}` : symbol;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1h&outputsize=100&apikey=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    console.log(`[DATA] TwelveData Response for ${symbol}: Status ${res.status}`);
    if (!res.ok) console.error('[DATA] TwelveData error response:', text);
    const body = JSON.parse(text);
    if (body?.status === 'error' || !Array.isArray(body?.values)) throw new Error(body?.message || `HTTP ${res.status}`);
    const data = body.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
    if (data.length > 0) { console.log('[DATA] TwelveData Gold Success'); console.log('[DATA] TwelveData Success'); console.log(`[DATA] ${market} ${symbol}: Length: ${data.length}`); return NextResponse.json({ symbol, data, source: 'twelvedata', count: data.length }); }
  } catch (e: any) { console.error('[DATA] TwelveData error for ' + symbol + ': ' + (e?.message || e)); }

  await sleep(500);

  // STOCKS fallback Stooq
  if (market === 'stocks') {
    try {
      const s = symbol.toLowerCase();
      const res = await fetch(`https://stooq.com/q/d/l/?s=${s}.us&i=d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n').slice(1).slice(-100);
        const data = lines.map(l => { const [date, open, high, low, close] = l.split(','); return { time: Date.parse(date), open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close), volume: 0 }; }).filter(d => !isNaN(d.close));
        if (data.length > 0) { console.log('[DATA] Stooq Success'); console.log(`[DATA] stocks ${symbol}: Length: ${data.length}`); return NextResponse.json({ symbol, data, source: 'stooq', count: data.length }); }
      }
    } catch (e: any) { console.error('[DATA] Stooq failed for ' + symbol + ': ' + (e?.message || e)); }
  }

  // FOREX fallback Frankfurter
  if (market === 'forex') {
    try {
      const base = symbol.replace(/-/g,'').slice(0,3);
      const quote = symbol.replace(/-/g,'').slice(3);
      const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        console.log('[DATA] Frankfurter Success');
        return NextResponse.json({ symbol, data: [], source: 'frankfurter', count: 0 });
      }
    } catch (e: any) { console.error('[DATA] Frankfurter failed: ' + (e?.message || e)); }
  }

  return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
}

