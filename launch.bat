@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoLogo -File "%~dp0launch.ps1"
pause
