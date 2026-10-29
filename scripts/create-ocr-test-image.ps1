$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$directory = Join-Path (Split-Path -Parent $PSScriptRoot) '.data\ocr-tests'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$bitmap = New-Object Drawing.Bitmap(1600,600)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$font = New-Object Drawing.Font('Arial',42)
try {
  $graphics.Clear([Drawing.Color]::White)
  $graphics.DrawString('DMS LOCAL OCR 839271',$font,[Drawing.Brushes]::Black,50,50)
  $graphics.DrawString('FACTURE REFERENCE 742031',$font,[Drawing.Brushes]::Black,50,170)
  $graphics.DrawString('RECU FRANCAIS 853290',$font,[Drawing.Brushes]::Black,50,290)
  $bitmap.Save((Join-Path $directory 'known-text.png'),[Drawing.Imaging.ImageFormat]::Png)
  $bitmap.RotateFlip([Drawing.RotateFlipType]::Rotate180FlipNone)
  $bitmap.Save((Join-Path $directory 'known-text-upside-down.png'),[Drawing.Imaging.ImageFormat]::Png)
} finally { $font.Dispose();$graphics.Dispose();$bitmap.Dispose() }
Write-Output 'Created local OCR test image (not added to the document library).'
$arabic = -join (@(1575,1582,1578,1576,1575,1585,32,1575,1604,1576,1581,1579,32,1593,1606,32,1575,1604,1606,1589) | ForEach-Object { [char]$_ })
$arabicBitmap = New-Object Drawing.Bitmap(1600,400)
$arabicGraphics = [Drawing.Graphics]::FromImage($arabicBitmap)
$arabicFont = New-Object Drawing.Font('Arial',70)
$format = New-Object Drawing.StringFormat
$format.FormatFlags = [Drawing.StringFormatFlags]::DirectionRightToLeft
try {
  $arabicGraphics.Clear([Drawing.Color]::White)
  $rectangle = New-Object Drawing.RectangleF(80,80,1440,240)
  $arabicGraphics.DrawString($arabic,$arabicFont,[Drawing.Brushes]::Black,$rectangle,$format)
  $arabicBitmap.Save((Join-Path $directory 'known-arabic.png'),[Drawing.Imaging.ImageFormat]::Png)
} finally { $format.Dispose();$arabicFont.Dispose();$arabicGraphics.Dispose();$arabicBitmap.Dispose() }
