$ErrorActionPreference = "Continue"

function Stop-PortProcesses {
    param([int]$Port)
    $pids = netstat -ano |
        Select-String ":$Port\s+" |
        ForEach-Object { ($_ -split "\s+")[-1] } |
        Where-Object { $_ -match "^[0-9]+$" -and $_ -ne "0" } |
        Sort-Object -Unique

    $stopped = 0
    foreach ($procId in $pids) {
        try {
            Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
            $stopped++
        } catch {
            Write-Host "Failed to stop PID $procId on port ${Port}: $($_.Exception.Message)"
        }
    }
    return $stopped
}

$stoppedBackend = Stop-PortProcesses -Port 8002
$stoppedFrontend = Stop-PortProcesses -Port 5173

Write-Host "Stopped backend processes: $stoppedBackend"
Write-Host "Stopped frontend processes: $stoppedFrontend"
