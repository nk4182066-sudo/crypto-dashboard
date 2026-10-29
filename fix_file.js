const fs = require('fs');
const path = 'c:/Users/noman/OneDrive/Desktop/crypto website/crypto-dashboard/src/lib/data/marketData.ts';

// Read as Buffer
let buf = fs.readFileSync(path);

// Remove null bytes (0x00) from the Buffer
let result = '';
for (let i = 0; i < buf.length; i++) {
  if (buf[i] !== 0) {
    result += String.fromCharCode(buf[i]);
  }
}
buf = Buffer.from(result, 'utf8');

// Fix 2: Change semicolons to commas in Promise type definitions
// Pattern: }>; source: string }>  ->  }>, source: string }>
buf = buf.toString('utf8');
buf = buf.replace(/>; source: string }>/g, '>, source: string }>');
// Pattern: symbol: string; data: -> symbol: string, data:
buf = buf.replace(/symbol: string; data:/g, 'symbol: string, data:');

fs.writeFileSync(path, buf, 'utf8');
console.log('Fixed successfully');
console.log('Contains null:', buf.indexOf(String.fromCharCode(0)) >= 0);
