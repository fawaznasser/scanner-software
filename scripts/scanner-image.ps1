function Save-ScannerImage {
  param([Parameter(Mandatory=$true)]$Image, [Parameter(Mandatory=$true)][string]$Directory, [int]$Index, [string]$Format='pdf')
  # Keep the original driver output even if normalization later fails.
  $rawPath = Join-Path $Directory "capture-$Index.raw"
  $Image.SaveFile($rawPath)
  Add-Type -AssemblyName System.Drawing
  $bitmap = [Drawing.Image]::FromFile($rawPath)
  try {
    $extension = if ($Format -eq 'png') { 'png' } else { 'jpg' }
    $target = Join-Path $Directory "page-$Index.$extension"
    $encoding = if ($Format -eq 'png') { [Drawing.Imaging.ImageFormat]::Png } else { [Drawing.Imaging.ImageFormat]::Jpeg }
    $bitmap.Save($target, $encoding)
    return @{ path=$target; width=$bitmap.Width; height=$bitmap.Height }
  } finally { $bitmap.Dispose() }
}
