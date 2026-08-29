param(
  [string]$OutDir = "$PSScriptRoot\dist\windows",
  [string]$NodeVersion = 'v18.20.1'
)

Write-Output "Creating distributable in: $OutDir"
if(Test-Path $OutDir){ Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

# Download Node portable zip (win-x64)
$nodeZip = "$env:TEMP\node-$NodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
Write-Output "Downloading Node from $nodeUrl"
Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip

Write-Output "Extracting node.exe"
Expand-Archive -LiteralPath $nodeZip -DestinationPath "$env:TEMP\nodepkg" -Force
Copy-Item -Path "$env:TEMP\nodepkg\node-$NodeVersion-win-x64\node.exe" -Destination "$OutDir\node.exe"

# Copy app files (frontend) to root of package
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Get-ChildItem -Path $root -Force | Where-Object { $_.Name -notin @('.git','dist','node_modules') } | ForEach-Object {
  if($_.Name -eq 'server'){
    Copy-Item -Path $_.FullName -Destination $OutDir -Recurse -Force
  } else {
    Copy-Item -Path $_.FullName -Destination $OutDir -Recurse -Force
  }
}

# Create start script that uses bundled node.exe
$startBat = @'
@echo off
cd /d "%~dp0\server"
"%~dp0\node.exe" server.js
'@

Set-Content -Path "$OutDir\start-server.bat" -Value $startBat -Encoding ASCII

# Zip the distributable
$zipName = "$root\RezekiMakmur-Inventory-win.zip"
if(Test-Path $zipName){ Remove-Item $zipName -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($OutDir, $zipName)

Write-Output "Created zip: $zipName"
Write-Output "Distribution folder: $OutDir"
