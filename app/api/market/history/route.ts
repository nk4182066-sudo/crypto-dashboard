import { NextResponse } from 'next/server';

export const revalidate = 300;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const METAL_MAP: Record<string, string> = {
  XAUUSD: 'XAU/USD', XAGUSD: 'XAG/USD', XPTUSD: 'XPT/USD', XPDUSD: 'XPD/USD',
  XCUUSD: 'XCU/USD', XALUSD: 'XAL/USD', XNIUSD: 'XNI/USD', XZNUSD: 'XZN/USD',
};

// Yahoo Finance futures symbols for metals — used as fallback when TwelveData's
// free tier rejects a metal symbol (Silver XAG/USD, Platinum XPT/USD, etc. all
// require the Grow or Venture plan). Maps internal X*USD labels to COMEX futures.
const METAL_YAHOO_MAP: Record<string, string> = {
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  XPTUSD: 'PL=F',
  XPDUSD: 'PA=F',
  XCUUSD: 'HG=F',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto';
  const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase().replace(/-/g, '');
  const timeframe = searchParams.get('timeframe') || '1h';
  console.log(`[HISTORY API] Fetching data for ${symbol}`);

  if (market === 'crypto') {
    await sleep(500);
    try {
      const res = await fetch(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}USDT&granularity=1h&limit=200`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json() as any;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
        if (candles.length > 0) { console.log(`[DATA] bitget Success: ${symbol} Length: ${candles.length}`); return NextResponse.json({ symbol, data: candles, source: 'bitget', count: candles.length }); }
      }
    } catch (e: any) { console.error('[DATA] bitget failed: ' + (e?.message || e)); }
    // Bybit fallback
    try {
      const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=60&limit=200`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const j = await res.json() as any;
        const rows = j?.result?.list ?? [];
        const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
        if (candles.length > 0) { console.log(`[DATA] bybit Success: ${symbol} Length: ${candles.length}`); return NextResponse.json({ symbol, data: candles, source: 'bybit', count: candles.length }); }
      }
    } catch (e: any) { console.error('[DATA] bybit failed: ' + (e?.message || e)); }
    return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
  }

  // METALS
  if (market === 'metals') {
    await sleep(500);
    if (symbol === 'XAUUSD') {
      try {
        const res = await fetch('https://api.bybit.com/v5/market/kline?category=spot&symbol=PAXGUSDT&interval=60&limit=200', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const j = await res.json() as any;
          const rows = j?.result?.list ?? [];
          const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
          if (candles.length > 0) { console.log(`[DATA] bybit-paxg Success: ${symbol} Length: ${candles.length}`); return NextResponse.json({ symbol, data: candles, source: 'bybit-paxg', count: candles.length }); }
        }
      } catch (e: any) { console.error('[DATA] bybit paxg failed: ' + (e?.message || e)); }
    }
    // Silver: Bybit XAGUSDT proxy (attempt — Bybit may not list this pair)
    if (symbol === 'XAGUSD') {
      try {
        const res = await fetch('https://api.bybit.com/v5/market/kline?category=spot&symbol=XAGUSDT&interval=60&limit=200', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const j = await res.json() as any;
          console.log(`[DATA] Bybit XAGUSDT response: ${JSON.stringify(j).slice(0, 100)}`);
          const rows = j?.result?.list ?? [];
          const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
          if (candles.length > 0) { console.log(`[DATA] bybit-xagusdt Success: ${symbol} Length: ${candles.length}`); return NextResponse.json({ symbol, data: candles, source: 'bybit-xagusdt', count: candles.length }); }
        }
      } catch (e: any) { console.error('[DATA] bybit xagusdt failed: ' + (e?.message || e)); }
    }

    // TwelveData for metals — note: Silver (XAG/USD) and several other metals
    // require a paid TwelveData plan, so this branch may error for them.
    const tdSymbol = METAL_MAP[symbol] || `${symbol.slice(0,3)}/${symbol.slice(3)}`;
    const apiKey = process.env.TWELVEDATA_API_KEY?.trim();
    await sleep(500);
    if (apiKey) {
      try {
        const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1h&outputsize=200&apikey=${apiKey}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        const j = JSON.parse(text);
        // Log the Silver response for debugging (user request)
        if (symbol === 'XAGUSD') {
          console.log(`[DATA] TwelveData Silver response: ${JSON.stringify(j).slice(0, 100)}`);
        }
        if (j?.status === 'error' || !Array.isArray(j?.values)) throw new Error(j?.message || `HTTP ${res.status}`);
        const data = j.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
        if (data.length > 0) { console.log(`[DATA] twelvedata Success: ${symbol} Length: ${data.length}`); return NextResponse.json({ symbol, data, source: 'twelvedata', count: data.length }); }
      } catch (e: any) { console.error('[DATA] twelvedata failed: ' + (e?.message || e)); }
    }

    // Yahoo Finance fallback for metals — TwelveData free tier rejects Silver
    // (XAG/USD) and several other metals; Yahoo Finance futures contracts work.
    const yahooSymbol = METAL_YAHOO_MAP[symbol];
    if (yahooSymbol) {
      await sleep(500);
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1h&range=10d`, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const j = await res.json() as any;
          const result = j?.chart?.result?.[0];
          const timestamps = result?.timestamp ?? [];
          const indicators = result?.indicators?.quote?.[0];
          if (timestamps.length > 0 && indicators) {
            const { open, high, low, close, volume } = indicators;
            const data = timestamps.map((t: number, i: number) => ({
              time: t * 1000,
              open: Number(open?.[i]),
              high: Number(high?.[i]),
              low: Number(low?.[i]),
              close: Number(close?.[i]),
              volume: Number(volume?.[i] ?? 0),
            })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
            if (data.length > 0) { console.log(`[DATA] yahoo Success: ${symbol} Length: ${data.length}`); return NextResponse.json({ symbol, data, source: 'yahoo', count: data.length }); }
          }
        }
      } catch (e: any) { console.error('[DATA] yahoo failed for ' + symbol + ': ' + (e?.message || e)); }
    }

    return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
  }

  // STOCKS & FOREX -> TwelveData
  await sleep(500);
  const apiKey = process.env.TWELVEDATA_API_KEY?.trim();
  const tdSymbol = market === 'forex' ? `${symbol.slice(0,3)}/${symbol.slice(3)}` : symbol;
  try {
    const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1h&outputsize=200&apikey=${apiKey}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    const body = JSON.parse(text);
    if (body?.status === 'error' || !Array.isArray(body?.values)) throw new Error(body?.message || `HTTP ${res.status}`);
    const data = body.values.map((v: any) => ({ time: new Date(v.datetime).getTime(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) })).filter((c: any) => Number.isFinite(c.close)).reverse();
    if (data.length > 0) { console.log(`[DATA] twelvedata Success: ${symbol} Length: ${data.length}`); return NextResponse.json({ symbol, data, source: 'twelvedata', count: data.length }); }
  } catch (e: any) { console.error('[DATA] twelvedata failed: ' + (e?.message || e)); }

  await sleep(500);

  // Fallbacks
  if (market === 'stocks') {
    try {
      const s = symbol.toLowerCase();
      const res = await fetch(`https://stooq.com/q/d/l/?s=${s}.us&i=d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n').slice(1).slice(-100);
        const data = lines.map(l => { const [date, open, high, low, close] = l.split(','); return { time: Date.parse(date), open: parseFloat(open), high: parseFloat(high), low: parseFloat(low), close: parseFloat(close), volume: 0 }; }).filter(d => !isNaN(d.close));
        if (data.length > 0) { console.log(`[DATA] stooq Success: ${symbol} Length: ${data.length}`); return NextResponse.json({ symbol, data, source: 'stooq', count: data.length }); }
      }
    } catch (e: any) { console.error('[DATA] stooq failed: ' + (e?.message || e)); }
  }
  if (market === 'forex') {
    try {
      const base = symbol.slice(0,3); const quote = symbol.slice(3);
      const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`, { cache: 'no-store' });
      if (res.ok) { console.log(`[DATA] frankfurter Success: ${symbol} Length: 0`); return NextResponse.json({ symbol, data: [], source: 'frankfurter', count: 0 }); }
    } catch (e: any) { console.error('[DATA] frankfurter failed: ' + (e?.message || e)); }
  }

  return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
}
