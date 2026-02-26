﻿Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms

# --- 포트 입력 ---
$port = [Microsoft.VisualBasic.Interaction]::InputBox(
    "포트 번호를 입력하세요",
    "LAN Bomber 시작",
    "3000"
)
if ([string]::IsNullOrWhiteSpace($port)) { exit }

if ($port -notmatch '^\d+$' -or [int]$port -lt 1024 -or [int]$port -gt 65535) {
    [System.Windows.Forms.MessageBox]::Show(
        "올바른 포트 번호를 입력하세요 (1024~65535)",
        "오류", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit
}

# --- 방 이름 입력 ---
$room = [Microsoft.VisualBasic.Interaction]::InputBox(
    "방 이름을 입력하세요",
    "LAN Bomber 시작",
    "LAN Bomber Room"
)
if ([string]::IsNullOrWhiteSpace($room)) { exit }

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  LAN Bomber" -ForegroundColor Cyan
Write-Host "  포트: $port   |   방: $room" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# --- 패키지 설치 ---
Write-Host ""
Write-Host "[1/3] 패키지 설치 중..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "npm install 실패!`n터미널 출력을 확인하세요.",
        "설치 오류", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- shared 빌드 ---
Write-Host ""
Write-Host "[2/3] shared 빌드 중..." -ForegroundColor Yellow
npm run build:shared
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "shared 빌드 실패!`n터미널 출력을 확인하세요.",
        "빌드 오류", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- client 빌드 ---
Write-Host ""
Write-Host "[3/3] client 빌드 중..." -ForegroundColor Yellow
npm run build:client
if ($LASTEXITCODE -ne 0) {
    [System.Windows.Forms.MessageBox]::Show(
        "client 빌드 실패!`n터미널 출력을 확인하세요.",
        "빌드 오류", [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# --- 서버 시작 ---
Write-Host ""
Write-Host "서버 시작 중..." -ForegroundColor Green
Write-Host "접속 주소: http://localhost:$port" -ForegroundColor Green
Write-Host "종료하려면 Ctrl+C 또는 이 창을 닫으세요." -ForegroundColor Gray
Write-Host ""

Start-Sleep -Milliseconds 800
Start-Process "http://localhost:$port"

& npm --prefix server run dev -- --port $port --room $room
