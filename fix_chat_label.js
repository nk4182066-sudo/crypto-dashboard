const fs = require('fs');
const p = 'C:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard\\app\\api\\chat\\route.ts';
let c = fs.readFileSync(p, 'utf8');
c = c.replace('p.label)`).join(", ")', 'p.label).join(", ")');
fs.writeFileSync(p, c);
console.log('done');