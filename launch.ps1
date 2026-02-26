Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms

# --- Port ---
$port = [Microsoft.VisualBasic.Interaction]::InputBox(
    "Enter port number (1024~65535)",
    "LAN Bomber",
    "3000"
)
if ([string]::IsNullOrWhiteSpace($port)) { exit }

if ($port -notmatch '^\d+$' -or [int]$port -lt 1024 -or [int]$port -gt 65535) {
    [System.Windows.Forms.MessageBox]::Show(
        "Invalid port number. Please enter a value between 1024 and 65535.",
        "Error", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit
}

# --- Room name ---
$room = [Microsoft.VisualBasic.Interaction]::InputBox(
    "Enter room name",
    "LAN Bomber",
    "LAN Bomber Room"
)
if ([string]::IsNullOrWhiteSpace($room)) { exit }

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  LAN Bomber" -ForegroundColor Cyan
Write-Host "  Port: $port   |   Room: $room" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# --- npm install ---
Write-Host ""
Write-Host "[1/3] Installing packages..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "npm install failed. Check the terminal output.",
        "Error", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- build:shared ---
Write-Host ""
Write-Host "[2/3] Building shared..." -ForegroundColor Yellow
npm run build:shared
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "shared build failed. Check the terminal output.",
        "Error", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- build:client ---
Write-Host ""
Write-Host "[3/3] Building client..." -ForegroundColor Yellow
npm run build:client
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "client build failed. Check the terminal output.",
        "Error", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- Start server ---
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Green
Write-Host "URL: http://localhost:$port" -ForegroundColor Green
Write-Host "Press Ctrl+C or close this window to stop." -ForegroundColor Gray
Write-Host ""

Start-Sleep -Milliseconds 800
Start-Process "http://localhost:$port"

& npm --prefix server run dev -- --port $port --room $room
