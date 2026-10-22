$path = 'C:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\app\api\chat\route.ts'
$content = Get-Content $path -Raw

# Fix analysis.current → analysis.price
$content = $content -replace 'analysis\.current', 'analysis.price'

# Fix analysis.patterns → analysis.conditions (ConditionLine[] has label, pass, detail)
# But .map((p) => \`${p.name} (${p.type}, ${p.confidence}%)\`) needs name/type/confidence
# ConditionLine has id, label, pass, detail - use label instead of name
$content = $content -replace 'analysis\.patterns\.slice\(0, 2\)\.map\(\(p\) => \$\`\$\{p\.name\} \(\$\{p\.type\}, \$\{p\.confidence\}%\)\`\)', 'analysis.conditions.filter(c => c.pass).slice(0, 2).map((p) => p.label)'

# Fix analysis.verdict → analysis.quality (PERFECT/STRONG/GOOD/null)
$content = $content -replace 'analysis\.verdict === "STRONG_SETUP"', 'analysis.quality === "PERFECT"'
$content = $content -replace 'analysis\.verdict === "MODERATE"', 'analysis.quality === "STRONG"'

# Fix analysis.trend → analysis.direction
$content = $content -replace 'analysis\.trend', 'analysis.direction'

# Fix analysis.timeframeAlignment → analysis.tfMinutes
$content = $content -replace 'analysis\.timeframeAlignment', 'analysis.tfMinutes'

# Fix analysis.indicators.sma → analysis.indicators.ema20 (no sma in StrictIndicators)
$content = $content -replace 'analysis\.indicators\.sma', 'analysis.indicators.ema20'

# Fix analysis.riskLevel → analysis.quality (closest equivalent)
$content = $content -replace 'analysis\.riskLevel', 'analysis.quality'

$content | Set-Content $path
Write-Host 'chat/route.ts property names fixed'