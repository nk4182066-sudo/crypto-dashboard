const fs = require('fs');
const path = 'c:/Users/noman/OneDrive/Desktop/crypto website/crypto-dashboard/src/lib/data/marketData.ts';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
console.log('--- Lines 355-395 ---');
for (let i = 354; i < 395; i++) {
  console.log((i + 1) + ': ' + lines[i]);
}
console.log('--- Promise lines ---');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Promise<{')) {
    console.log((i + 1) + ': ' + lines[i].trim());
  }
}
