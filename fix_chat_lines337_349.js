const fs = require('fs');
const p = 'C:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard\\app\\api\\chat\\route.ts';
const lines = fs.readFileSync(p, 'utf8').split('\n');

// Fix lines 337-349 (1-based index: 337-349)
// These use AnalyzeResult type, not AutoAnalysis
const fixes = {
  337: '  if (!analysis || !Number.isFinite(analysis.price) || analysis.price <= 0) return null;',
  338: '  const topPatterns = analysis.conditions.filter((c) => c.pass).slice(0, 2).map((p) => p.label).join(", ") || "none";',
  341: '  const status = analysis.quality === "PERFECT" ? "✅ Strong" : analysis.quality === "STRONG" ? "⚠️ Moderate" : "⏸️ Low confluence — Wait";',
  344: '    `Price: $${analysis.price.toFixed(2)} | Trend: ${analysis.direction} | Timeframe: ${analysis.tfMinutes}`,',
  345: '    `RSI: ${analysis.indicators.rsi} | MACD: ${analysis.indicators.macd} | SMA: ${analysis.indicators.ema20} | Volume: ${analysis.indicators.volume}`,',
  348: '    `Risk: ${analysis.quality}`,',
};

for (const [lineNum, newText] of Object.entries(fixes)) {
  const idx = parseInt(lineNum) - 1;
  if (lines[idx]) {
    console.log(`Line ${lineNum}: replacing`);
    lines[idx] = newText;
  } else {
    console.log(`Line ${lineNum}: NOT FOUND`);
  }
}

fs.writeFileSync(p, lines.join('\n'));
console.log('Done fixing lines 337-349');