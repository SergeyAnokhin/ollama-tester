$backendPath = Join-Path $PSScriptRoot "backend"
$frontendPath = Join-Path $PSScriptRoot "frontend"

Write-Host "Starting Ollama Vision Tester..." -ForegroundColor Cyan
Write-Host "Ctrl+C to stop.`n" -ForegroundColor Gray

$backendJob = Start-Job -ScriptBlock {
    param($p)
    Set-Location $p
    cmd /c "pip install -r requirements.txt -q 2>&1 && uvicorn main:app --reload --host 0.0.0.0 --port 8002 2>&1"
} -ArgumentList $backendPath

$frontendJob = Start-Job -ScriptBlock {
    param($p)
    Set-Location $p
    cmd /c "npm run dev 2>&1"
} -ArgumentList $frontendPath

try {
    while ($true) {
        Receive-Job $backendJob | ForEach-Object { Write-Host "[backend] $_" -ForegroundColor Yellow }
        Receive-Job $frontendJob | ForEach-Object { Write-Host "[front]   $_" -ForegroundColor Cyan }
        Start-Sleep -Milliseconds 200
    }
} finally {
    Write-Host "`nStopping..." -ForegroundColor Gray
    Stop-Job $backendJob, $frontendJob
    Remove-Job $backendJob, $frontendJob -Force
}
