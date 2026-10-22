$path = 'C:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts'
$lines = Get-Content $path

# Remove orphaned points: lines at index 221 and 245 (0-based)
# Also remove the orphaned ones at index 245 (Triple Bottom)
$newLines = @()
$skipNext = $false
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    # Skip the orphaned points: lines (index 221 and 245)
    if ($i -eq 221 -or $i -eq 245) {
        continue
    }
    $newLines += $line
}

# Now add points inside return { } blocks
# Find the Triple Top return block and add points after confidence: 86,
$finalLines = @()
for ($i = 0; $i -lt $newLines.Length; $i++) {
    $line = $newLines[$i]
    $finalLines += $line
    
    # After "confidence: 86," in Triple Top return block, add points line
    if ($line -match 'confidence: 86,' -and $i -gt 0 -and $newLines[$i-1] -match 'type: "bearish"') {
        # Check if next line is note (not points)
        if ($i + 1 -lt $newLines.Length -and $newLines[$i+1] -match 'note:.*Triple Top') {
            $finalLines += '    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },'
        }
    }
    
    # After "confidence: 86," in Triple Bottom return block, add points line
    if ($line -match 'confidence: 86,' -and $i -gt 0 -and $newLines[$i-1] -match 'type: "bullish"') {
        # Check if next line is note (not points)
        if ($i + 1 -lt $newLines.Length -and $newLines[$i+1] -match 'note:.*Triple Bottom') {
            $finalLines += '    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },'
        }
    }
}

$finalLines | Set-Content $path
Write-Host 'detectPattern.ts fixed'