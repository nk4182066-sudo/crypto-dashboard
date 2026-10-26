import { NextResponse } from 'next/server';
import { fetchHistoryUnified, sleep } from '@/src/lib/data/marketData';

export const revalidate = 300;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'crypto';
  const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase().replace(/-/g, '').replace('/', '');
  const timeframe = searchParams.get('timeframe') || '1h';
  console.log('[HISTORY API] Fetching data for ' + symbol + ' / ' + market);

  const { data, source, count } = await fetchHistoryUnified(market, symbol, timeframe, 200);

  return NextResponse.json({ symbol, data, source, count });
}