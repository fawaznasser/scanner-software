$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $project '.data\run-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
function Wait-LocalPort([int]$Port, [int]$Seconds) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { return }
    Start-Sleep -Milliseconds 400
  }
  throw "Local service on port $Port did not start. Check .data/run-logs."
}
if (!(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath 'node.exe' -ArgumentList 'scripts/scanner-bridge.mjs' -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'bridge.out.log') -RedirectStandardError (Join-Path $logDirectory 'bridge.err.log')
  Wait-LocalPort 8765 15
}
if (!(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next dev --webpack' -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'app.out.log') -RedirectStandardError (Join-Path $logDirectory 'app.err.log')
  Wait-LocalPort 3000 45
}
Write-Output 'DMS: http://localhost:3000 · Scanner bridge: http://127.0.0.1:8765'
