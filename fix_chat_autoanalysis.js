const fs = require('fs');
const p = 'C:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard\\app\\api\\chat\\route.ts';
let c = fs.readFileSync(p, 'utf8');

// Fix all incorrect property names back to AutoAnalysis properties
// analysis.price -> analysis.current
c = c.split('analysis.price').join('analysis.current');
// analysis.direction -> analysis.trend
c = c.split('analysis.direction').join('analysis.trend');
// analysis.tfMinutes -> analysis.timeframeAlignment
c = c.split('analysis.tfMinutes').join('analysis.timeframeAlignment');
// analysis.indicators.ema20 -> analysis.indicators.sma
c = c.split('analysis.indicators.ema20').join('analysis.indicators.sma');
// analysis.quality -> analysis.riskLevel (or verdict)
// But "Quality:" text should stay, just change property name
c = c.split('analysis.quality').join('analysis.riskLevel');
// analysis.conditions.filter(c => c.pass).slice(0, 2).map((p) => p.label) -> use patterns
c = c.split('analysis.conditions.filter(c => c.pass).slice(0, 2).map((p) => p.label)')
  .join('analysis.patterns.slice(0, 2).map((p) => p.name)');

fs.writeFileSync(p, c);
console.log('All AutoAnalysis property names fixed');