const fs = require('fs');
const path = 'src/lib/data/marketData.ts';

// Read file as buffer
let buf = fs.readFileSync(path);

// Convert to string and analyze
let content = buf.toString('utf8');
let lines = content.split('\n');
let linesCR = content.split('\r\n');

console.log('File size:', buf.length);
console.log('Lines split by \\n:', lines.length);
console.log('Lines split by \\r\\n:', linesCR.length);

// Print last 10 lines
console.log('\n--- Last 10 lines ---');
for (let i = Math.max(0, lines.length - 10); i < lines.length; i++) {
  console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
}

// Check line 390
console.log('\n--- Line 390 ---');
if (lines[389]) {
  console.log(`Line 390: ${JSON.stringify(lines[389])}`);
  console.log(`Line 390 hex:`, lines[389].split('').map(c => c.charCodeAt(0).toString(16)).join(' '));
}

// Check for CR/LF issues
let crlfCount = (content.match(/\r\n/g) || []).length;
let lfCount = (content.match(/\n/g) || []).length;
let crCount = (content.match(/\r/g) || []).length;
console.log('\nLine endings: CRLF=', crlfCount, 'LF=', lfCount, 'CR=', crCount);

// Check for null bytes
let nullCount = (content.match(/\0/g) || []).length;
console.log('Null bytes:', nullCount);

// Check file encoding
console.log('\nFirst 50 chars:', JSON.stringify(content.substring(0, 50)));