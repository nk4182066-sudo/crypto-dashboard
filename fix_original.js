const fs = require('fs');
// Read the file as UTF-16LE (git binary file)
let buf = fs.readFileSync('src/lib/data/marketData.ts.bak');
let text = Buffer.from(buf.toString('binary'), 'binary').toString('utf8');
// Actually, the file might be UTF-16
let text16 = buf.toString('utf16le');
// Check if it has null bytes - if so, replace them
if (text16.indexOf('\u0000') >= 0) {
  text = text16.split('\u0000').join('');
} else {
  text = text16;
}
// Remove trailing CR characters
text = text.replace(/\r/g, '\n');
// Remove trailing garbage
text = text.replace(/\u0000+$/m, '');
// Fix semicolons to commas in Promise type definitions
text = text.replace(/Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; source: string/g, 'Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>, source: string');
text = text.replace(/symbol: string; data: Array</g, 'symbol: string, data: Array<');
text = text.replace(/source: string; count: number/g, 'source: string, count: number');
fs.writeFileSync('src/lib/data/marketData.ts', text, 'utf8');
console.log('Written, lines:', text.split('\n').length);
console.log('Contains null:', text.indexOf('\u0000') >= 0);
