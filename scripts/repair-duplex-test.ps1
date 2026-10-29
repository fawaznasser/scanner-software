$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$jobFile=Join-Path $root '.data\scanner-bridge\current-test.json'
$job=Get-Content -Raw -LiteralPath $jobFile | ConvertFrom-Json
$databasePath=Join-Path $root '.data\dms.sqlite'
# Resolve only the explicitly named assisted duplex test job.
$lookup = node -e "const{DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const d=new DatabaseSync('.data/dms.sqlite',{readOnly:true});const j=JSON.parse(d.prepare('select record from scan_jobs where id=?').get(JSON.parse(fs.readFileSync('.data/scanner-bridge/current-test.json')).jobId).record);if(j.result.fileName!=='HP_Duplex_Test.pdf')throw Error('Not duplex test');console.log(JSON.stringify({providerJobId:j.providerJobId,documentId:j.result.documentId}));d.close()"
$info=$lookup | ConvertFrom-Json
$folder=Join-Path $root ('.data\scanner-bridge\'+$info.providerJobId)
$pages=@()
foreach($index in @(0,1)) {
  $image=New-Object -ComObject WIA.ImageFile
  $image.LoadFile((Join-Path $folder "page-$index.jpg"))
  $converter=New-Object -ComObject WIA.ImageProcess
  $converter.Filters.Add($converter.FilterInfos.Item('Convert').FilterID)
  $converter.Filters.Item(1).Properties.Item('FormatID').Value='{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
  $converter.Filters.Item(1).Properties.Item('Quality').Value=90
  $converted=$converter.Apply($image)
  $target=Join-Path $folder "converted-$index.jpg"
  $converted.SaveFile($target)
  $pages+=@{path=$target;width=$converted.Width;height=$converted.Height}
}
@{pages=$pages;documentId=$info.documentId;providerJobId=$info.providerJobId;jobId=$job.jobId} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $folder 'repair.json') -Encoding UTF8
Write-Output ('Converted both captured sides to JPEG. Metadata: '+(Join-Path $folder 'repair.json'))
