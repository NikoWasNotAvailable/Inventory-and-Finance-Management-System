## Creates a Desktop shortcut that launches the app start script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$bat = Join-Path $scriptDir 'start-server.bat'
if (-not (Test-Path $bat)) {
  Write-Error "Cannot find start-server.bat in $scriptDir. Run this script from the repo root."
  exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'RezekiMakmur Inventory.lnk'

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($linkPath)
$shortcut.TargetPath = $bat
$shortcut.WorkingDirectory = $scriptDir
$shortcut.WindowStyle = 1
$shortcut.IconLocation = "$bat,0"
$shortcut.Description = 'Start RezekiMakmur Inventory app'
$shortcut.Save()

Write-Output "Shortcut created: $linkPath"
