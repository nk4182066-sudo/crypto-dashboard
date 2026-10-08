interface StablecoinRecord {
  symbol?: unknown;
  circulating?: { peggedUSD?: unknown };
  circulatingPrevDay?: { peggedUSD?: unknown };
}

function supply(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function readWhaleTransfers() {
  try {
    const recentResponse = await fetch("https://mempool.space/api/mempool/recent", { cache: "no-store" });
    if (!recentResponse.ok) return null;
    const recent: unknown = await recentResponse.json();
    if (!Array.isArray(recent)) return null;
    const transactionIds = recent.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const txid = (item as Record<string, unknown>).txid;
      return typeof txid === "string" ? [txid] : [];
    }).slice(0, 8);
    const transactions = await Promise.allSettled(transactionIds.map(async (txid) => {
      const response = await fetch(`https://mempool.space/api/tx/${encodeURIComponent(txid)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("lookup failed");
      const transaction = await response.json();
      const outputs = Array.isArray(transaction.vout) ? transaction.vout : [];
      const satoshis = outputs.reduce((total: number, output: unknown) => {
        if (!output || typeof output !== "object") return total;
        const value = (output as Record<string, unknown>).value;
        return typeof value === "number" ? total + value : total;
      }, 0);
      return { txid, btc: satoshis / 100_000_000 };
    }));
    const list = transactions.flatMap((result) => result.status === "fulfilled" && result.value.btc >= 50 ? [result.value] : []).sort((first, second) => second.btc - first.btc);
    return { transactions: list, thresholdBtc: 50, source: "mempool.space" };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const response = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=false", { cache: "no-store" });
    if (!response.ok) return Response.json({ error: `Stablecoin provider returned ${response.status}.` }, { status: 502 });
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { peggedAssets?: unknown }).peggedAssets)) {
      return Response.json({ error: "Stablecoin supply data is unavailable." }, { status: 502 });
    }

    const records = (payload as { peggedAssets: StablecoinRecord[] }).peggedAssets;
    const usdStablecoins = records.filter((item) => item && typeof item.symbol === "string" && item.circulating?.peggedUSD !== undefined);
    const total = usdStablecoins.reduce((sum, item) => sum + supply(item.circulating?.peggedUSD), 0);
    const previous = usdStablecoins.reduce((sum, item) => sum + supply(item.circulatingPrevDay?.peggedUSD), 0);
    const top = usdStablecoins
      .map((item) => ({ symbol: String(item.symbol), supply: supply(item.circulating?.peggedUSD) }))
      .filter((item) => item.supply > 0)
      .sort((first, second) => second.supply - first.supply)
      .slice(0, 10);

    const whale = await readWhaleTransfers();
    return Response.json({
      total,
      previous,
      top,
      whale,
      source: "DefiLlama",
      updatedAt: new Date().toISOString(),
      sections: [
        { title: "Exchange inflows / outflows", status: "Requires an authenticated on-chain provider (CryptoQuant / Glassnode)." },
        { title: "Miner reserves", status: "Requires an authenticated on-chain provider." },
        { title: "MVRV ratio", status: "Requires an authenticated on-chain provider." },
      ],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to retrieve public stablecoin supply data." }, { status: 502 });
  }
}
