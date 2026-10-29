param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]*$')][string]$SshHost)
$ErrorActionPreference = 'Stop'
if (!(Get-Command ssh.exe -ErrorAction SilentlyContinue)) { throw 'Install the Windows OpenSSH Client first.' }
Write-Output 'Keeping the scanner tunnel open. This does not start a scan or restart Windows scanning.'
Write-Output 'The SSH alias must already have a verified host key and a dedicated key configured.'
while ($true) {
  & ssh.exe -N -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -R 127.0.0.1:18765:127.0.0.1:8765 $SshHost
  Write-Warning 'Scanner tunnel closed. Retrying in 5 seconds. Press Ctrl+C to stop.'
  Start-Sleep -Seconds 5
}
