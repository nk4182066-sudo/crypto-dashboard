export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") || "spot";
  
  try {
    // ===== CRYPTO SPOT - ALL 400+ =====
    if (market === "spot") {
      const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
      const data = await res.json();
      
      const coins = data
        .filter((t: any) => t.symbol.endsWith("USDT"))
        .filter((t: any) => parseFloat(t.lastPrice) > 0)
        .map((t: any) => ({
          symbol: t.symbol.replace("USDT", "-USD"),
          base: t.symbol.replace("USDT", ""),
          name: t.symbol.replace("USDT", ""),
          price: parseFloat(t.lastPrice),
          change: parseFloat(t.priceChangePercent),
          volume: parseFloat(t.quoteVolume),
        }))
        .sort((a: any, b: any) => b.volume - a.volume);
      
      return Response.json({ coins, total: coins.length });
    }
    
    // ===== CRYPTO FUTURES - ALL 200+ =====
    if (market === "futures") {
      const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
      const data = await res.json();
      
      const coins = data
        .filter((t: any) => t.symbol.endsWith("USDT"))
        .filter((t: any) => parseFloat(t.lastPrice) > 0)
        .map((t: any) => ({
          symbol: t.symbol.replace("USDT", "-USD"),
          base: t.symbol.replace("USDT", ""),
          name: t.symbol.replace("USDT", ""),
          price: parseFloat(t.lastPrice),
          change: parseFloat(t.priceChangePercent),
          volume: parseFloat(t.quoteVolume),
          leverage: "1x-125x",
        }))
        .sort((a: any, b: any) => b.volume - a.volume);
      
      return Response.json({ coins, total: coins.length });
    }
    
    // ===== FOREX - ALL 60+ PAIRS =====
    if (market === "forex") {
      const forexData = [
        // Majors (7)
        { symbol: "EUR-USD", price: 1.0876, change: 0.08 },
        { symbol: "GBP-USD", price: 1.2654, change: -0.12 },
        { symbol: "USD-JPY", price: 149.87, change: 0.23 },
        { symbol: "USD-CHF", price: 0.8756, change: 0.15 },
        { symbol: "AUD-USD", price: 0.6543, change: -0.05 },
        { symbol: "USD-CAD", price: 1.3542, change: -0.08 },
        { symbol: "NZD-USD", price: 0.6123, change: -0.09 },
        
        // Minors (15)
        { symbol: "EUR-GBP", price: 0.8592, change: -0.04 },
        { symbol: "EUR-JPY", price: 162.87, change: 0.31 },
        { symbol: "EUR-CHF", price: 0.9534, change: 0.07 },
        { symbol: "EUR-AUD", price: 1.6623, change: 0.13 },
        { symbol: "EUR-CAD", price: 1.4723, change: -0.03 },
        { symbol: "EUR-NZD", price: 1.7765, change: 0.16 },
        { symbol: "GBP-JPY", price: 189.65, change: 0.11 },
        { symbol: "GBP-CHF", price: 1.1089, change: -0.02 },
        { symbol: "GBP-AUD", price: 1.9334, change: -0.06 },
        { symbol: "GBP-CAD", price: 1.7145, change: -0.15 },
        { symbol: "GBP-NZD", price: 2.0671, change: -0.05 },
        { symbol: "AUD-JPY", price: 98.23, change: 0.18 },
        { symbol: "AUD-CHF", price: 0.5687, change: 0.05 },
        { symbol: "AUD-CAD", price: 0.8846, change: 0.04 },
        { symbol: "AUD-NZD", price: 1.0687, change: -0.06 },
        { symbol: "NZD-JPY", price: 91.45, change: 0.14 },
        { symbol: "NZD-CHF", price: 0.5348, change: 0.03 },
        { symbol: "NZD-CAD", price: 0.8287, change: -0.04 },
        { symbol: "CAD-JPY", price: 110.67, change: 0.25 },
        { symbol: "CAD-CHF", price: 0.6465, change: -0.02 },
        { symbol: "CHF-JPY", price: 171.23, change: 0.08 },
        
        // Exotics (30+)
        { symbol: "USD-TRY", price: 34.25, change: 0.15 },
        { symbol: "USD-ZAR", price: 18.45, change: -0.22 },
        { symbol: "USD-MXN", price: 19.85, change: 0.34 },
        { symbol: "USD-SGD", price: 1.3420, change: -0.08 },
        { symbol: "USD-HKD", price: 7.7850, change: 0.01 },
        { symbol: "USD-THB", price: 34.20, change: 0.12 },
        { symbol: "USD-INR", price: 83.45, change: 0.05 },
        { symbol: "USD-PKR", price: 278.50, change: 0.18 },
        { symbol: "USD-CNH", price: 7.2450, change: -0.06 },
        { symbol: "USD-NOK", price: 10.85, change: 0.22 },
        { symbol: "USD-SEK", price: 10.52, change: 0.18 },
        { symbol: "USD-DKK", price: 6.87, change: 0.09 },
        { symbol: "USD-PLN", price: 3.98, change: 0.25 },
        { symbol: "USD-HUF", price: 365.20, change: 0.34 },
        { symbol: "USD-CZK", price: 23.15, change: 0.16 },
        { symbol: "USD-RUB", price: 92.40, change: 0.08 },
        { symbol: "USD-BRL", price: 5.45, change: -0.18 },
        { symbol: "USD-ARS", price: 985.50, change: 0.45 },
        { symbol: "USD-CLP", price: 945.20, change: 0.22 },
        { symbol: "USD-COP", price: 4120.50, change: 0.15 },
        { symbol: "USD-PEN", price: 3.78, change: -0.05 },
        { symbol: "USD-KRW", price: 1345.60, change: 0.12 },
        { symbol: "USD-IDR", price: 15750.00, change: 0.08 },
        { symbol: "USD-MYR", price: 4.45, change: 0.10 },
        { symbol: "USD-PHP", price: 57.85, change: 0.14 },
        { symbol: "USD-VND", price: 25350.00, change: 0.06 },
        { symbol: "EUR-TRY", price: 37.25, change: 0.22 },
        { symbol: "EUR-ZAR", price: 20.05, change: -0.15 },
        { symbol: "EUR-PLN", price: 4.32, change: 0.18 },
        { symbol: "EUR-HUF", price: 397.50, change: 0.25 },
        { symbol: "EUR-CZK", price: 25.18, change: 0.12 },
        { symbol: "EUR-NOK", price: 11.80, change: 0.19 },
        { symbol: "EUR-SEK", price: 11.44, change: 0.15 },
        { symbol: "GBP-TRY", price: 43.35, change: 0.28 },
        { symbol: "GBP-ZAR", price: 23.35, change: -0.12 },
        { symbol: "AUD-TRY", price: 22.40, change: 0.20 },
      ];
      
      const coins = forexData.map(f => ({
        symbol: f.symbol,
        base: f.symbol.split("-")[0],
        quote: f.symbol.split("-")[1],
        name: f.symbol.replace("-", "/"),
        price: f.price,
        change: f.change,
        volume: 0,
        leverage: "1x-500x",
      }));
      
      return Response.json({ coins, total: coins.length });
    }
    
    // ===== STOCKS - ALL 100+ =====
    if (market === "stocks") {
      const stocksData = [
        // Tech
        { symbol: "AAPL", name: "Apple Inc.", price: 189.50, change: 0.65 },
        { symbol: "MSFT", name: "Microsoft", price: 425.30, change: 0.45 },
        { symbol: "GOOGL", name: "Alphabet", price: 178.20, change: 0.32 },
        { symbol: "AMZN", name: "Amazon", price: 195.75, change: 0.78 },
        { symbol: "META", name: "Meta Platforms", price: 595.30, change: 1.25 },
        { symbol: "NVDA", name: "NVIDIA", price: 138.50, change: 2.03 },
        { symbol: "TSLA", name: "Tesla", price: 245.20, change: -1.12 },
        { symbol: "NFLX", name: "Netflix", price: 875.40, change: 0.34 },
        { symbol: "AMD", name: "AMD", price: 145.20, change: -0.45 },
        { symbol: "INTC", name: "Intel", price: 28.15, change: 0.28 },
        { symbol: "IBM", name: "IBM", price: 220.50, change: 0.18 },
        { symbol: "ORCL", name: "Oracle", price: 178.30, change: 0.55 },
        { symbol: "CRM", name: "Salesforce", price: 335.20, change: 0.67 },
        { symbol: "ADBE", name: "Adobe", price: 512.40, change: -0.32 },
        { symbol: "PYPL", name: "PayPal", price: 85.60, change: 0.89 },
        { symbol: "SQ", name: "Block", price: 78.30, change: 1.12 },
        { symbol: "SHOP", name: "Shopify", price: 105.40, change: 0.56 },
        { symbol: "SPOT", name: "Spotify", price: 425.20, change: 0.78 },
        { symbol: "UBER", name: "Uber", price: 72.50, change: 0.34 },
        { symbol: "COIN", name: "Coinbase", price: 245.30, change: 1.45 },
        { symbol: "AVGO", name: "Broadcom", price: 178.60, change: 1.25 },
        { symbol: "QCOM", name: "Qualcomm", price: 158.30, change: 0.45 },
        { symbol: "TXN", name: "Texas Instruments", price: 195.40, change: 0.32 },
        { symbol: "MU", name: "Micron", price: 108.50, change: 1.45 },
        { symbol: "AMAT", name: "Applied Materials", price: 185.20, change: 0.78 },
        { symbol: "LRCX", name: "Lam Research", price: 78.40, change: 0.56 },
        { symbol: "PLTR", name: "Palantir", price: 45.30, change: 2.15 },
        { symbol: "SNOW", name: "Snowflake", price: 125.40, change: 0.78 },
        { symbol: "CRWD", name: "CrowdStrike", price: 285.60, change: 1.12 },
        { symbol: "ZS", name: "Zscaler", price: 185.30, change: 0.89 },
        { symbol: "DDOG", name: "Datadog", price: 125.60, change: 0.67 },
        { symbol: "NET", name: "Cloudflare", price: 85.40, change: 0.78 },
        { symbol: "MDB", name: "MongoDB", price: 285.30, change: 0.56 },
        
        // Finance
        { symbol: "V", name: "Visa", price: 275.80, change: 0.32 },
        { symbol: "MA", name: "Mastercard", price: 512.30, change: 0.28 },
        { symbol: "JPM", name: "JPMorgan Chase", price: 245.60, change: 0.45 },
        { symbol: "BAC", name: "Bank of America", price: 38.75, change: 0.67 },
        { symbol: "WFC", name: "Wells Fargo", price: 78.50, change: 0.32 },
        { symbol: "GS", name: "Goldman Sachs", price: 545.20, change: 0.78 },
        { symbol: "MS", name: "Morgan Stanley", price: 125.40, change: 0.45 },
        { symbol: "C", name: "Citigroup", price: 72.30, change: 0.56 },
        { symbol: "BLK", name: "BlackRock", price: 985.30, change: 0.67 },
        { symbol: "AXP", name: "American Express", price: 285.40, change: 0.45 },
        { symbol: "SCHW", name: "Charles Schwab", price: 78.50, change: 0.34 },
        { symbol: "BRK-B", name: "Berkshire Hathaway", price: 465.20, change: 0.28 },
        
        // Healthcare
        { symbol: "JNJ", name: "Johnson & Johnson", price: 156.30, change: -0.15 },
        { symbol: "PFE", name: "Pfizer", price: 25.80, change: -0.32 },
        { symbol: "MRK", name: "Merck", price: 98.50, change: 0.25 },
        { symbol: "ABBV", name: "AbbVie", price: 195.40, change: 0.45 },
        { symbol: "LLY", name: "Eli Lilly", price: 785.60, change: 1.25 },
        { symbol: "UNH", name: "UnitedHealth", price: 585.40, change: 0.34 },
        { symbol: "CVS", name: "CVS Health", price: 55.20, change: -0.28 },
        { symbol: "TMO", name: "Thermo Fisher", price: 585.30, change: 0.45 },
        { symbol: "ABT", name: "Abbott Labs", price: 115.40, change: 0.32 },
        { symbol: "DHR", name: "Danaher", price: 245.60, change: 0.28 },
        
        // Consumer
        { symbol: "WMT", name: "Walmart", price: 165.20, change: 0.28 },
        { symbol: "TGT", name: "Target", price: 145.60, change: 0.45 },
        { symbol: "COST", name: "Costco", price: 895.30, change: 0.56 },
        { symbol: "HD", name: "Home Depot", price: 410.50, change: 0.34 },
        { symbol: "LOW", name: "Lowe's", price: 275.30, change: 0.28 },
        { symbol: "MCD", name: "McDonald's", price: 295.40, change: 0.12 },
        { symbol: "SBUX", name: "Starbucks", price: 98.20, change: 0.34 },
        { symbol: "NKE", name: "Nike", price: 78.50, change: -0.45 },
        { symbol: "PG", name: "Procter & Gamble", price: 168.50, change: 0.22 },
        { symbol: "KO", name: "Coca-Cola", price: 62.40, change: 0.18 },
        { symbol: "PEP", name: "PepsiCo", price: 165.80, change: 0.15 },
        { symbol: "PM", name: "Philip Morris", price: 125.40, change: 0.34 },
        
        // Energy
        { symbol: "XOM", name: "ExxonMobil", price: 118.30, change: -0.22 },
        { symbol: "CVX", name: "Chevron", price: 155.60, change: -0.15 },
        { symbol: "COP", name: "ConocoPhillips", price: 108.50, change: -0.32 },
        { symbol: "SLB", name: "Schlumberger", price: 42.30, change: -0.18 },
        { symbol: "OXY", name: "Occidental", price: 52.40, change: -0.45 },
        
        // Industrial
        { symbol: "BA", name: "Boeing", price: 155.30, change: -0.45 },
        { symbol: "CAT", name: "Caterpillar", price: 385.60, change: 0.34 },
        { symbol: "GE", name: "General Electric", price: 178.50, change: 0.56 },
        { symbol: "MMM", name: "3M", price: 135.40, change: 0.22 },
        { symbol: "HON", name: "Honeywell", price: 215.60, change: 0.28 },
        { symbol: "UPS", name: "UPS", price: 128.50, change: -0.15 },
        { symbol: "LMT", name: "Lockheed Martin", price: 585.40, change: 0.34 },
        { symbol: "RTX", name: "RTX Corp", price: 125.60, change: 0.45 },
        
        // Auto & EV
        { symbol: "F", name: "Ford", price: 10.85, change: 0.28 },
        { symbol: "GM", name: "General Motors", price: 52.40, change: 0.34 },
        { symbol: "RIVN", name: "Rivian", price: 12.85, change: -2.15 },
        { symbol: "LCID", name: "Lucid Motors", price: 2.45, change: -3.45 },
        { symbol: "NIO", name: "NIO", price: 5.85, change: 1.25 },
        
        // Media & Telecom
        { symbol: "DIS", name: "Disney", price: 95.40, change: 0.45 },
        { symbol: "CMCSA", name: "Comcast", price: 42.30, change: -0.18 },
        { symbol: "VZ", name: "Verizon", price: 42.50, change: 0.22 },
        { symbol: "T", name: "AT&T", price: 22.40, change: 0.18 },
        { symbol: "TMUS", name: "T-Mobile", price: 225.50, change: 0.34 },
        
        // ETFs
        { symbol: "SPY", name: "S&P 500 ETF", price: 585.30, change: 0.32 },
        { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 505.40, change: 0.45 },
        { symbol: "DIA", name: "Dow Jones ETF", price: 425.60, change: 0.28 },
        { symbol: "IWM", name: "Russell 2000 ETF", price: 225.40, change: 0.22 },
      ];
      
      const coins = stocksData.map(s => ({
        symbol: s.symbol,
        base: s.symbol,
        name: s.name,
        price: s.price,
        change: s.change,
        volume: 0,
        leverage: "1x-20x",
      }));
      
      return Response.json({ coins, total: coins.length });
    }
    
    // ===== METALS - ALL 10 =====
    if (market === "metals") {
      const metals = [
        { symbol: "XAU-USD", base: "XAU", name: "Gold Spot", price: 2650.50, change: 0.42, leverage: "1x-500x" },
        { symbol: "XAG-USD", base: "XAG", name: "Silver Spot", price: 31.25, change: -0.31, leverage: "1x-500x" },
        { symbol: "XPT-USD", base: "XPT", name: "Platinum Spot", price: 985.40, change: 0.15, leverage: "1x-500x" },
        { symbol: "XPD-USD", base: "XPD", name: "Palladium Spot", price: 1020.80, change: -0.22, leverage: "1x-500x" },
        { symbol: "XCU-USD", base: "XCU", name: "Copper", price: 4.18, change: 0.08, leverage: "1x-100x" },
        { symbol: "XAU-EUR", base: "XAU", name: "Gold in EUR", price: 2450.30, change: 0.35, leverage: "1x-500x" },
        { symbol: "XAU-GBP", base: "XAU", name: "Gold in GBP", price: 2075.60, change: 0.28, leverage: "1x-500x" },
        { symbol: "XAU-JPY", base: "XAU", name: "Gold in JPY", price: 397500, change: 0.52, leverage: "1x-500x" },
        { symbol: "XAG-EUR", base: "XAG", name: "Silver in EUR", price: 28.85, change: -0.18, leverage: "1x-500x" },
        { symbol: "XAU-AUD", base: "XAU", name: "Gold in AUD", price: 4050.20, change: 0.45, leverage: "1x-500x" },
      ];
      return Response.json({ coins: metals, total: metals.length });
    }
    
    return Response.json({ error: "Invalid market" }, { status: 400 });
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ coins: [], total: 0, error: "Failed to fetch" });
  }
}
