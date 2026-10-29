const fs = require('fs');
let c = fs.readFileSync('src/lib/data/marketData.ts.bak', 'utf16le');
// Convert UTF-16 to text
let text = '';
for (let i = 0; i < c.length; i += 2) {
  text += String.fromCharCode(c.charCodeAt(i));
}
// Remove trailing null bytes and garbage
text = text.replace(/\u0000+$/m, '');
// Remove trailing CR characters
text = text.replace(/\r/g, '\n');
// Fix semicolons to commas in Promise type definitions
text = text.replace(/time: number; open: number; high: number; low: number; close: number; volume: number/g, 'time: number, open: number, high: number, low: number, close: number, volume: number');
text = text.replace(/Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>; source: string/g, 'Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>, source: string');
text = text.replace(/symbol: string; data: Array</g, 'symbol: string, data: Array<');
text = text.replace(/source: string; count: number/g, 'source: string, count: number');
fs.writeFileSync('src/lib/data/marketData.ts', text, 'utf8');
console.log('Done');
