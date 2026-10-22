const fs = require('fs');
const p = 'C:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard\\app\\api\\chat\\route.ts';
let c = fs.readFileSync(p, 'utf8');

// Fix lines 337-348 which use AnalyzeResult type (not AutoAnalysis)
// analysis.current -> analysis.price (in the buildEngineBlock section only)
// But we already changed all analysis.price to analysis.current globally...
// Let me fix specifically lines 337-348 area

// Replace analysis.current with analysis.price in this section
c = c.split('!Number.isFinite(analysis.current)').join('!Number.isFinite(analysis.price)');
c = c.split('analysis.current <= 0)').join('analysis.price <= 0)');
c = c.split('analysis.patterns.slice(0, 2).map((p) => p.name)').join('analysis.conditions.filter((c) => c.pass).slice(0, 2).map((p) => p.label)');
c = c.split('analysis.riskLevel === "PERFECT"').join('analysis.quality === "PERFECT"');
c = c.split('analysis.riskLevel === "STRONG"').join('analysis.quality === "STRONG"');
c = c.split('analysis.current.toFixed(2)').join('analysis.price.toFixed(2)');
c = c.split('analysis.trend').join('analysis.direction');
c = c.split('analysis.timeframeAlignment').join('analysis.tfMinutes');
c = c.split('analysis.indicators.sma').join('analysis.indicators.ema20');
c = c.split('Risk: ${analysis.riskLevel}').join('Risk: ${analysis.quality}');

fs.writeFileSync(p, c);
console.log('AnalyzeResult section fixed');