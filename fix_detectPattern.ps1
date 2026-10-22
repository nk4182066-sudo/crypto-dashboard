$path = 'C:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts'
$content = Get-Content $path -Raw

# Fix detectTripleTop: remove orphaned points: line and add points inside return { }
$oldTop = @'
const idxA = swings.indexOf(a);
points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
const idxC = swings.indexOf(c);
'@
$newTop = @'
const idxA = swings.indexOf(a);
const idxC = swings.indexOf(c);
'@
$content = $content -replace [regex]::Escape($oldTop), $newTop

# Add points inside return { } for detectTripleTop
$oldReturnTop = @'
    confidence: 86,
    note: `Three equal swing highs within ${TRIPLE_EQ_PCT}% â€” resistance rejected price three times, close back below the level.`,
  };
'@
$newReturnTop = @'
    confidence: 86,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
    note: `Three equal swing highs within ${TRIPLE_EQ_PCT}% â€” resistance rejected price three times, close back below the level.`,
  };
'@
$content = $content -replace [regex]::Escape($oldReturnTop), $newReturnTop

# Fix detectTripleBottom: remove orphaned points: line and add points inside return { }
$oldBottom = @'
const idxA = swings.indexOf(a);
points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
const idxC = swings.indexOf(c);
'@
$newBottom = @'
const idxA = swings.indexOf(a);
const idxC = swings.indexOf(c);
'@
$content = $content -replace [regex]::Escape($oldBottom), $newBottom

# Add points inside return { } for detectTripleBottom
$oldReturnBottom = @'
    confidence: 86,
    note: `Three equal swing lows within ${TRIPLE_EQ_PCT}% â€” support held three times, close back above the level.`,
  };
'@
$newReturnBottom = @'
    confidence: 86,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
    note: `Three equal swing lows within ${TRIPLE_EQ_PCT}% â€” support held three times, close back above the level.`,
  };
'@
$content = $content -replace [regex]::Escape($oldReturnBottom), $newReturnBottom

$content | Set-Content $path
Write-Host 'detectPattern.ts fixed'