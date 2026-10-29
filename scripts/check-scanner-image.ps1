$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scanner-image.ps1')
Add-Type -AssemblyName System.Drawing
$testDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) ('.data\scanner-image-tests\' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $testDirectory -Force | Out-Null
$sourcePath = Join-Path $testDirectory 'synthetic.bmp'
$bitmap = New-Object Drawing.Bitmap(16,24)
try { $bitmap.Save($sourcePath, [Drawing.Imaging.ImageFormat]::Bmp) } finally { $bitmap.Dispose() }
$image = New-Object -ComObject WIA.ImageFile
try {
  $image.LoadFile($sourcePath)
  foreach ($format in @('pdf','jpeg','png')) {
    $index = @('pdf','jpeg','png').IndexOf($format)
    $page = Save-ScannerImage -Image $image -Directory $testDirectory -Index $index -Format $format
    if ($page.width -ne 16 -or $page.height -ne 24) { throw 'Image dimensions changed.' }
    $bytes = [IO.File]::ReadAllBytes($page.path)
    if ($format -eq 'png') { if ($bytes[0] -ne 137 -or $bytes[1] -ne 80) { throw 'Invalid PNG output.' } }
    elseif ($bytes[0] -ne 255 -or $bytes[1] -ne 216) { throw 'Invalid JPEG output.' }
    if (!(Test-Path (Join-Path $testDirectory "capture-$index.raw"))) { throw 'Original capture missing.' }
    Write-Output "$format image normalization passed."
  }
} finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($image) }
Write-Output "PASS: synthetic-image checks only; no scanner accessed. Test files: $testDirectory"
