$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendLogOut = Join-Path $projectRoot "vite.out.log"
$frontendLogErr = Join-Path $projectRoot "vite.err.log"

function Test-PortListening {
    param([int]$Port)
    $line = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+"
    return [bool]$line
}

if (-not (Test-PortListening -Port 8002)) {
    Start-Process python -ArgumentList "main.py" -WorkingDirectory $backendDir | Out-Null
}

if (-not (Test-PortListening -Port 5173)) {
    $cmd = "cd `"$projectRoot`"; npm run dev > `"$frontendLogOut`" 2> `"$frontendLogErr`""
    Start-Process powershell -ArgumentList "-NoProfile -Command $cmd" | Out-Null
}

Start-Sleep -Seconds 2

$backendReady = Test-PortListening -Port 8002
$frontendReady = Test-PortListening -Port 5173

Write-Host "Backend (8002): $backendReady"
Write-Host "Frontend (5173): $frontendReady"
if ($frontendReady) {
    Write-Host "Frontend URL: http://localhost:5173"
}
if ($backendReady) {
    Write-Host "Backend URL:  http://127.0.0.1:8002"
}
