const fs = require('fs');
const p = 'C:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard\\app\\api\\chat\\route.ts';
const lines = fs.readFileSync(p, 'utf8').split('\n');

// Find line 1159 (the closing }); of generateFullSignal call)
// Insert null check after it
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('});') && i > 1150 && i < 1165) {
    // Check next line is not already a null check
    if (!lines[i+1].includes('if (!full)')) {
      lines.splice(i + 1, 0, '  if (!full) return null;');
      console.log('Inserted null check after line', i + 1);
    }
    break;
  }
}

fs.writeFileSync(p, lines.join('\n'));
console.log('Done');