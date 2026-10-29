// Test file
export async function test<T>(x: T): Promise<T> {
  return x;
}

export async function test2(x: string): Promise<{ a: number, b: string }> {
  return { a: 1, b: x };
}

export async function fetchHistoryUnified(
  market: string,
  symbol: string,
  timeframe = "1h",
  limit = 200
): Promise<{ symbol: string, data: Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>, source: string, count: number }> {
  return { symbol, data: [], source: "none", count: 0 };
}