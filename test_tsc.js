const { execSync } = require('child_process');
try {
  const output = execSync('cd "c:\\Users\\noman\\OneDrive\\Desktop\\crypto website\\crypto-dashboard" && ./node_modules/.bin/tsc -p tsconfig.json --noEmit', { encoding: 'utf8' });
  console.log(output);
} catch (e) {
  console.error(e.stdout);
  console.error(e.stderr);
}