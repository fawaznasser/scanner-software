$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$folder=Join-Path $root '.data\scanner-validation'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$manager=New-Object -ComObject WIA.DeviceManager
$info=@($manager.DeviceInfos | Where-Object {$_.Type -eq 1})[0]
if(!$info){throw 'No WIA scanner found'}
$scannerId=$info.DeviceID
[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($info) | Out-Null
[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($manager) | Out-Null
$info=$null; $manager=$null
[GC]::Collect(); [GC]::WaitForPendingFinalizers()
$cases=@(
  @{colorMode='color';paperSize='A4';resolution=300;duplex=$false;format='pdf'},
  @{colorMode='grayscale';paperSize='Letter';resolution=150;duplex=$false;format='jpeg'},
  @{colorMode='black-white';paperSize='Legal';resolution=200;duplex=$false;format='png'},
  @{colorMode='color';paperSize='A4';resolution=600;duplex=$true;format='pdf'}
)
foreach($case in $cases){
  $settings=@{source='automatic-feeder';autoFeed=$false;pageLimit=1;enhance=$false}
  foreach($key in $case.Keys){$settings[$key]=$case[$key]}
  $requestPath=Join-Path $folder 'request.json'
  [System.IO.File]::WriteAllText($requestPath,(@{scannerId=$scannerId;settings=$settings}|ConvertTo-Json -Depth 4))
  $result=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -STA -File (Join-Path $PSScriptRoot 'scanner-wia.ps1') -Mode validate -InputPath $requestPath
  if($LASTEXITCODE -ne 0){throw "Driver rejected a configuration: $result"}
  Write-Output $result
}
Write-Output 'PASS: driver settings validated without acquiring images or feeding paper.'
