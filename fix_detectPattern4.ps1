$path = 'C:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts'
$lines = Get-Content $path

$newLines = @()
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    $newLines += $line
    
    # After "confidence: 86," inside Triple Top return block, add points
    if ($line -eq '    confidence: 86,') {
        # Check if next line starts with "note:" and mentions "Triple Top" or "Triple Bottom"
        if ($i + 1 -lt $lines.Length) {
            $nextLine = $lines[$i + 1]
            if ($nextLine -match 'note:.*Triple Top' -or $nextLine -match 'note:.*Triple Bottom') {
                $newLines += '    points: { p1: { time: a.time, price: a.price }, p2: { time: b.time, price: b.price }, p3: { time: c.time, price: c.price }, neckline: (a.price + b.price + c.price) / 3 },'
            }
        }
    }
}

$newLines | Set-Content $path
Write-Host 'detectPattern.ts fixed - points added inside return blocks'