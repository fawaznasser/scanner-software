$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$releaseDirectory = Join-Path $project 'releases'
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$destination = Join-Path $releaseDirectory ("dms-source-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @()
foreach ($folder in @('app','components','lib','data','public','deployment')) {
  $folderPath = Join-Path $project $folder
  if (Test-Path -LiteralPath $folderPath) { $files += Get-ChildItem -LiteralPath $folderPath -File -Recurse }
}
foreach ($file in @('package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','proxy.ts','AGENTS.md','OCR_SETUP.txt','PRODUCTION_CHECKLIST.txt','.gitignore')) {
  $filePath = Join-Path $project $file
  if (Test-Path -LiteralPath $filePath) { $files += Get-Item -LiteralPath $filePath }
}
$scriptNames = @('build-production.mjs','production-config.mjs','start-production.mjs','package-production.ps1','prepare-next-compiler.mjs','prepare-ocr.mjs','ocr-worker.mjs','ocr-engine.mjs','scanner-bridge.mjs','scanner-discovery.mjs','scanner-pdf.mjs','scanner-wia.ps1','scanner-image.ps1','enable-scanner-control.ps1','connect-scanner-tunnel.ps1','start-local.ps1','create-ocr-test-image.ps1','provision-users.mjs')
$files += Get-ChildItem -LiteralPath (Join-Path $project 'scripts') -File | Where-Object { $_.Name -like 'check-*.mjs' -or $_.Name -in $scriptNames }
$archive = [IO.Compression.ZipFile]::Open($destination, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in ($files | Sort-Object FullName -Unique)) {
    $relative = $file.FullName.Substring($project.Length + 1).Replace('\','/')
    if ($relative -match '(^|/)(\.data|node_modules|\.next[^/]*|credentials\.local\.txt|\.env[^/]*)(/|$)') { throw "Private file refused: $relative" }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked file refused: $relative" }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$destination.sha256", "$hash  $([IO.Path]::GetFileName($destination))`n")
Write-Output "Source release: $destination"
Write-Output "SHA256: $hash"
Write-Output 'Excluded private data, credentials, secrets, installed dependencies and local builds. Install/build on the server using deployment/DEPLOYMENT.txt.'
