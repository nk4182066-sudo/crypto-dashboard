const fs = require('fs');
let b = fs.readFileSync('src/lib/data/marketData.ts');
console.log('size:', b.length);
console.log('Last 15 bytes hex:', b.slice(-15).toString('hex'));