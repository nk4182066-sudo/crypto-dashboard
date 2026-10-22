const fs = require('fs');
const p = 'C:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard\\app\\api\\chat\\route.ts';
let c = fs.readFileSync(p, 'utf8');
// Simple string replacement
const oldText = 'analysis.patterns.slice(0, 2).map((p) => $\`${p.name} (${p.type}, ${p.confidence}%)\$\`)';
const newText = 'analysis.conditions.filter(c => c.pass).slice(0, 2).map((p) => p.label)';
if (c.includes(oldText)) {
  c = c.split(oldText).join(newText);
  console.log('Replaced analysis.patterns');
} else {
  console.log('Old text not found exactly, trying regex...');
  const regex = /analysis\.patterns\.slice\(0, 2\)\.map\(\(p\) => .+?\)/g;
  c = c.replace(regex, newText);
  console.log('Applied regex replacement');
}
fs.writeFileSync(p, c);
console.log('done');