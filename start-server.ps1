Set-Location -Path "$PSScriptRoot\server"
if (-not (Test-Path node_modules)) {
  Write-Output "Installing dependencies..."
  npm install
}
Start-Process "http://localhost:3000"
npm start
