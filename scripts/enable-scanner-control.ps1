# Run once in an Administrator PowerShell window. This does not restart services.
# Example: .\scripts\enable-scanner-control.ps1 -Account 'COMPUTER\BridgeUser' -WhatIf
# Remove -WhatIf after reviewing the preview; a confirmation prompt is shown.
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param([Parameter(Mandatory=$true)][string]$Account)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator to configure this permission.' }
$sid = (New-Object Security.Principal.NTAccount($Account)).Translate([Security.Principal.SecurityIdentifier])
if ($sid.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545')) { throw 'Choose a specific bridge account, not a broad users group.' }
$lines = & sc.exe sdshow stisvc
if ($LASTEXITCODE -ne 0) { throw 'Cannot read Windows scanner service permissions.' }
$sddl = ($lines | Where-Object { $_ -match '^[OGDS]:' }) -join ''
$descriptor = New-Object Security.AccessControl.RawSecurityDescriptor($sddl)
if ($null -eq $descriptor.DiscretionaryAcl) { throw 'Unexpected scanner service ACL. No changes made.' }
# Query config/status, enumerate dependents, start, stop and read permissions only.
# Never grant change-config, write-DACL, write-owner or full control.
$rights = 0x2003D
$ace = New-Object Security.AccessControl.CommonAce([Security.AccessControl.AceFlags]::None, [Security.AccessControl.AceQualifier]::AccessAllowed, $rights, $sid, $false, $null)
$index = 0
while ($index -lt $descriptor.DiscretionaryAcl.Count -and $descriptor.DiscretionaryAcl[$index].AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessDenied) { $index++ }
$descriptor.DiscretionaryAcl.InsertAce($index, $ace)
if ($PSCmdlet.ShouldProcess("stisvc for $Account ($sid)", 'Grant scanner-service query/start/stop permission to this account and all programs running as it')) {
  $backupDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.data\service-permissions'
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  $backup = Join-Path $backupDirectory ('stisvc-' + [Guid]::NewGuid().ToString() + '.sddl')
  [IO.File]::WriteAllText($backup, $sddl)
  & sc.exe sdset stisvc $descriptor.GetSddlForm([Security.AccessControl.AccessControlSections]::All)
  if ($LASTEXITCODE -ne 0) { throw "Permission change failed. Original permissions saved at $backup" }
  Write-Output "Scanner-service control enabled for $Account. Original permissions: $backup"
  Write-Output 'In DMS, check driver status again. No service was restarted.'
}
