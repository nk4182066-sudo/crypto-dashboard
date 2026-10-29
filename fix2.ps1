$content = Get-Content 'src/lib/data/marketData.ts' -Raw
$content = $content.Replace('Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>; source: string; count: number }>', 'Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>, source: string, count: number }>')
$content | Set-Content 'src/lib/data/marketData.ts' -NoNewline
Write-Host 'Done'