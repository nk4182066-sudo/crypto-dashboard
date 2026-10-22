const fs = require('fs');
let content = fs.readFileSync('src/lib/chart/detectPattern.ts', 'utf-8');

// Let's find the detectTripleTop and detectTripleBottom functions
// and add the points field to their return statements

// Strategy: Find each return statement in these functions and add points

// First, let's find the Triple Top function return
// Look for the pattern and add points before the closing }

// Find detectTripleTop function
const tripleTopIdx = content.indexOf('function detectTripleTop(');
const tripleBottomIdx = content.indexOf('function detectTripleBottom(');

console.log('Triple Top at index:', tripleTopIdx);
console.log('Triple Bottom at index:', tripleBottomIdx);

// Let's work on Triple Top first
if (tripleTopIdx >= 0) {
  // Find the return { in this function
  const tripleTopSection = content.substring(tripleTopIdx, tripleTopIdx + 3000);
  console.log('Triple Top section (first 500 chars):', tripleTopSection.substring(0, 500));
  
  // Find return { and the closing }
  const returnIdx = tripleTopSection.indexOf('return {');
  console.log('Return { at offset:', returnIdx);
  
  if (returnIdx >= 0) {
    // Find the matching closing }
    let braceCount = 1;
    let endIdx = returnIdx + 1;
    while (braceCount > 0 && endIdx < tripleTopSection.length) {
      const char = tripleTopSection[endIdx];
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      endIdx++;
    }
    console.log('Closing } at offset:', endIdx);
    
    // Now we need to insert points before the closing }
    // The points should be: points: { p1: { time: number; price: number }; p2: { time: number; price: number }; p3: { time: number; price: number }; neckline: number }
    
    const pointsString = '    points: { p1: { time: 0, price: 0 }, p2: { time: 0, price: 0 }, p3: { time: 0, price: 0 }, neckline: 0 },\n';
    
    // Insert before the closing }
    const beforeClosing = tripleTopSection.substring(0, endIdx - 1);
    const afterClosing = tripleTopSection.substring(endIdx - 1);
    
    const newSection = beforeClosing + pointsString + afterClosing;
    
    // Replace in original content
    const newContent = content.substring(0, tripleTopIdx) + newContent.substring(tripleTopIdx + tripleTopSection.length - newSection.length) + newSection;
    
    // Actually this is getting complicated. Let me try a different approach.
    // Just replace the entire return statement with one that includes points.
    
    // Find the full return block
    const fullReturnStart = tripleTopIdx + returnIdx;
    let braceCount2 = 1;
    let fullEndIdx = fullReturnStart + 1;
    while (braceCount2 > 0 && fullEndIdx < content.length) {
      const char = content[fullEndIdx];
      if (char === '{') braceCount2++;
      else if (char === '}') braceCount2--;
      fullEndIdx++;
    }
    
    const oldReturn = content.substring(fullReturnStart, fullEndIdx);
    const newReturn = oldReturn.replace(
      /note: `[^`]*?Three consecutive pivots[^`]*?`,\s*$/m,
      'note: `Three consecutive pivots at similar price levels with breakdown below neckline — bearish continuation.`,\\n    points: { p1: { time: 0, price: 0 }, p2: { time: 0, price: 0 }, p3: { time: 0, price: 0 }, neckline: 0 },'
    );
    
    const newContent = content.replace(oldReturn, newReturn);
    fs.writeFileSync('src/lib/chart/detectPattern.ts', newContent);
    console.log('Triple Top modified');
  }
}