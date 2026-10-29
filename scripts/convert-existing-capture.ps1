param([Parameter(Mandatory=$true)][string]$SourcePath, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scanner-image.ps1')
# ImageFile loads an existing local file only; no scanner device is opened.
$image = New-Object -ComObject WIA.ImageFile
try {
  $image.LoadFile($SourcePath)
  Save-ScannerImage -Image $image -Directory $OutputDirectory -Index 0 -Format pdf | ConvertTo-Json -Compress
} finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($image) }
