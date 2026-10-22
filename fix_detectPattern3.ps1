$path = 'C:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts'
$content = Get-Content $path -Raw

# Add points inside return { } for detectTripleTop - after confidence: 86,
$old1 = @'
    confidence: 86,
    note: `Three equal swing highs within ${TRIPLE_EQ_PCT}% â€” resistance rejected price three times, close back below the level.`,
  };
'@
$new1 = @'
    confidence: 86,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
    note: `Three equal swing highs within ${TRIPLE_EQ_PCT}% â€” resistance rejected price three times, close back below the level.`,
  };
'@
$content = $content -replace [regex]::Escape($old1), $new1

# Add points inside return { } for detectTripleBottom - after confidence: 86,
$old2 = @'
    confidence: 86,
    note: `Three equal swing lows within ${TRIPLE_EQ_PCT}% â€” support held three times, close back above the level.`,
  };
'@
$new2 = @'
    confidence: 86,
    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },
    note: `Three equal swing lows within ${TRIPLE_EQ_PCT}% â€” support held three times, close back above the level.`,
  };
'@
$content = $content -replace [regex]::Escape($old2), $new2

$content | Set-Content $path
Write-Host 'detectPattern.ts fixed - points added inside return blocks'