import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto';
  const symbol = searchParams.get('symbol') || 'BTCUSDT';
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
        if (candles.length > 0) return NextResponse.json({ symbol, data: candles, source: 'bitget', count: candles.length });
      }
    } catch {}
    try {
      const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=60&limit=200`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json() as any;
        const rows = Array.isArray(data?.result?.list) ? data.result.list : [];
        const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
        if (candles.length > 0) return NextResponse.json({ symbol, data: candles, source: 'bybit', count: candles.length });
      }
    } catch {}
    try {
      const instId = symbol.replace('-', '-');
      const res = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=200`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json() as any;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const candles = rows.map((k: any[]) => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5] ?? 0) })).filter((c: any) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
        if (candles.length > 0) return NextResponse.json({ symbol, data: candles, source: 'okx', count: candles.length });
      }
    } catch {}
    console.log(`[DATA] ALL EXCHANGES FAILED for ${symbol}`);
    return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
  }
  return NextResponse.json({ symbol, data: [], source: 'none', count: 0 });
}
