param([ValidateSet('discover','recover','status','validate','scan')][string]$Mode='discover', [string]$InputPath, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scanner-image.ps1')
$stage = 'connecting to the scanner'
function Property($Object, [int]$Id) { return @($Object.Properties | Where-Object { $_.PropertyID -eq $Id })[0] }
function Set-Property($Object, [int]$Id, $Value) {
  $property = Property $Object $Id
  if ($null -eq $property) { throw "Scanner driver does not expose property $Id" }
  $property.Value = $Value
}
try {
  if ($Mode -eq 'status') {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DmsServiceAccess {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr OpenSCManager(string machine, string database, uint access);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr OpenService(IntPtr manager, string name, uint access);
  [DllImport("advapi32.dll")] public static extern bool CloseServiceHandle(IntPtr handle);
  // PowerShell converts $null string arguments to empty strings. SCM treats an
  // empty database name as invalid (123); supply native nulls inside C# instead.
  public static IntPtr OpenLocalManager() { return OpenSCManager(null, null, 1); }
}
'@
    $managerHandle = [DmsServiceAccess]::OpenLocalManager()
    $serviceHandle = [IntPtr]::Zero
    try {
      if ($managerHandle -eq [IntPtr]::Zero) { throw ('Unable to check Windows service permissions. Service manager error: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
      $serviceHandle = [DmsServiceAccess]::OpenService($managerHandle, 'stisvc', 0x34)
      $service = Get-Service -Name 'stisvc'
      @{ serviceName='stisvc'; serviceStatus=$service.Status.ToString(); canRestart=($serviceHandle -ne [IntPtr]::Zero); account=[Security.Principal.WindowsIdentity]::GetCurrent().Name; driver='Windows WIA' } | ConvertTo-Json -Compress
    } finally {
      if ($serviceHandle -ne [IntPtr]::Zero) { [void][DmsServiceAccess]::CloseServiceHandle($serviceHandle) }
      if ($managerHandle -ne [IntPtr]::Zero) { [void][DmsServiceAccess]::CloseServiceHandle($managerHandle) }
    }
    exit 0
  }
  if ($Mode -eq 'recover') {
    try { Restart-Service -Name 'stisvc' -ErrorAction Stop } catch { throw 'Windows could not restart the scanner service. Check driver status and ask a Windows administrator to run scripts/enable-scanner-control.ps1 for the bridge account. Dependent services will not be stopped automatically.' }
    Start-Sleep -Milliseconds 500
  }
  $manager = New-Object -ComObject WIA.DeviceManager
  $devices = @($manager.DeviceInfos | Where-Object { $_.Type -eq 1 })
  if ($Mode -in @('discover','recover')) {
    $scanners = @()
    foreach ($info in $devices) {
      $device = $info.Connect()
      $item = $device.Items.Item(1)
      $caps = [int](Property $device 3086).Value
      $resolution = Property $item 6147
      $resolutions = @(75,150,200,240,300,400,500,600 | Where-Object { if ($resolution.SubType -eq 2) { $_ -in @($resolution.SubTypeValues) } else { $_ -ge $resolution.SubTypeMin -and $_ -le $resolution.SubTypeMax } })
      $handling = [int](Property $device 3087).Value
      $feederStatus = if ($handling -band 32) { 'jammed' } elseif ($handling -band 16) { 'cover-open' } elseif ($handling -band 1) { 'loaded' } else { 'empty' }
      $sources = @()
      if ($caps -band 1) { $sources += 'automatic-feeder' }
      if ($caps -band 2) { $sources += 'flatbed' }
      $scanners += @{ id=$info.DeviceID; name=(Property $info 7).Value; manufacturer=(Property $info 3).Value; model=(Property $info 7).Value; connection='USB / Windows WIA'; status='ready'; feederStatus=$feederStatus; driverVersion=(Property $info 15).Value; provider='bridge'; lastSeenAt=[DateTime]::UtcNow.ToString('o'); capabilities=@{sources=$sources;colorModes=@('color','grayscale','black-white');paperSizes=@('A4','Letter','Legal');resolutions=$resolutions;formats=@('pdf','jpeg','png');supportsDuplex=[bool]($caps -band 4);supportsAutoFeed=[bool]($caps -band 1);maxFeederPages=50} }
    }
    @{scanners=$scanners} | ConvertTo-Json -Depth 8 -Compress
    exit 0
  }
  $inputData = Get-Content -Raw -LiteralPath $InputPath | ConvertFrom-Json
  $settings = $inputData.settings
  $info = @($devices | Where-Object { $_.DeviceID -eq $inputData.scannerId })[0]
  if (!$info) { throw 'Scanner is no longer connected. Refresh the scanner list.' }
  $device = $info.Connect()
  $item = $device.Items.Item(1)
  $source = if ($settings.source -eq 'automatic-feeder') { 1 } else { 2 }
  if ($settings.duplex) {
    if (!([int](Property $device 3086).Value -band 4)) { throw 'This scanner does not support duplex scanning.' }
    if ($settings.source -ne 'automatic-feeder' -or $settings.format -ne 'pdf') { throw 'Use the automatic feeder and PDF format for two-sided scanning.' }
    $source = $source -bor 4
  }
  Set-Property $device 3088 $source
  $pagesProperty = Property $device 3096
  if ($pagesProperty) { $pagesProperty.Value = 1 }
  $intent = switch ($settings.colorMode) { 'color' {1} 'grayscale' {2} 'black-white' {4} }
  Set-Property $item 6146 $intent
  Set-Property $item 6147 ([int]$settings.resolution)
  Set-Property $item 6148 ([int]$settings.resolution)
  $dimensions = switch ($settings.paperSize) { 'A4' {@(8.2677,11.6929)} 'Letter' {@(8.5,11)} 'Legal' {@(8.5,14)} }
  Set-Property $item 6149 0
  Set-Property $item 6150 0
  Set-Property $item 6151 ([int][Math]::Round($dimensions[0] * $settings.resolution))
  Set-Property $item 6152 ([int][Math]::Round($dimensions[1] * $settings.resolution))
  if ($Mode -eq 'validate') { @{valid=$true;resolution=$settings.resolution;paperSize=$settings.paperSize;colorMode=$settings.colorMode;duplex=[bool]$settings.duplex;source=$settings.source} | ConvertTo-Json -Compress; exit 0 }
  $limit = if ($settings.autoFeed -and $settings.source -eq 'automatic-feeder' -and $settings.format -eq 'pdf') { [int]$settings.pageLimit } else { 1 }
  if ($settings.duplex) { $limit = $limit * 2 }
  $pages = @()
  for ($index = 0; $index -lt $limit; $index++) {
    try {
      $stage = "receiving page $($index + 1) from the driver"
      # Ask for the baseline BMP format, then encode locally. Some HP drivers
      # feed the sheet but fail to return a JPEG automation object correctly.
      $formatId = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'
      $image = $item.Transfer($formatId)
      $stage = "saving page $($index + 1)"
      $pages += Save-ScannerImage -Image $image -Directory $OutputDirectory -Index $index -Format $settings.format
      [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($image)
      [System.IO.File]::WriteAllText((Join-Path $OutputDirectory 'progress.json'), (@{pageCount=$pages.Count;progress=[Math]::Min(85,15+[Math]::Floor(70*$pages.Count/$limit))} | ConvertTo-Json -Compress))
    } catch {
      if ($_.Exception.HResult -eq -2145320957 -and $pages.Count -gt 0) {
        if ($settings.duplex -and ($pages.Count % 2 -ne 0)) { throw 'The driver returned only one side of the last sheet. Duplex capture is incomplete.' }
        break
      }
      throw
    }
  }
  @{pages=$pages} | ConvertTo-Json -Depth 5 -Compress
} catch {
  $message = $_.Exception.Message
  if ($OutputDirectory -and (Test-Path -LiteralPath $OutputDirectory)) {
    $diagnostic = @{stage=$stage;line=$_.InvocationInfo.ScriptLineNumber;hresult=$_.Exception.HResult;message=$message}
    try { [IO.File]::WriteAllText((Join-Path $OutputDirectory 'failure.json'), ($diagnostic | ConvertTo-Json -Compress)) } catch { }
  }
  if ($message -eq 'Specified cast is not valid.') { $message = "Windows could not return the scanned image while $stage. The scan was not saved. Please retry; if this repeats, the HP WIA driver needs repair." }
  if ($_.Exception.HResult -eq -2145320957) { $message = 'The feeder is empty. Load paper and try again.' }
  if ($_.Exception.HResult -eq -2145320958) { $message = 'Paper jam detected. Clear the paper path and close the feeder cover.' }
  if ($_.Exception.HResult -eq -2145320954) { $message = 'Windows could not open the scanner connection (driver reports busy, 0x80210006). This does not confirm that a scan is running. The driver may need a scanning-service restart or scanner power cycle.' }
  [Console]::Error.WriteLine($message)
  exit 1
}
