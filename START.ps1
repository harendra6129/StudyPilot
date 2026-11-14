$ErrorActionPreference = "Stop"
$root = "G:\StudyPilot"

Write-Host "Building StudyPilot..." -ForegroundColor Cyan
Set-Location "$root\frontend"
npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed. StudyPilot was not started."
}

Write-Host "Starting StudyPilot backend..." -ForegroundColor Cyan

$backendCommand = "Set-Location '$root\backend'; python -m uvicorn main:app --host 127.0.0.1 --port 8010"

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    $backendCommand
)

Start-Sleep -Seconds 3
Start-Process "http://127.0.0.1:8010"

Write-Host "StudyPilot is starting at http://127.0.0.1:8010" -ForegroundColor Green
