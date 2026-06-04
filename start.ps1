# Start both backend and frontend in separate windows
Write-Host "Starting Ollama Vision Tester..." -ForegroundColor Cyan

$backendPath = Join-Path $PSScriptRoot "backend"
$frontendPath = Join-Path $PSScriptRoot "frontend"

# Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "Set-Location '$backendPath'; Write-Host 'Installing backend deps...' -ForegroundColor Yellow; pip install -r requirements.txt -q; Write-Host 'Starting backend on http://localhost:8001' -ForegroundColor Green; uvicorn main:app --reload --host 0.0.0.0 --port 8001"

Start-Sleep -Seconds 2

# Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "Set-Location '$frontendPath'; Write-Host 'Starting frontend on http://localhost:5173' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "Backend:  http://localhost:8001" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Open http://localhost:5173 in your browser." -ForegroundColor Cyan
