@echo off
setlocal
title Fortnite Chest Ranking - connectr
color 0B

cd /d "%~dp0"

echo [*] Verificando atualizacoes do connectr...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/JoaoArauto/FortNiteRankinBau/main/connectr.ps1', 'connectr.ps1.tmp'); if ((Test-Path 'connectr.ps1.tmp') -and (Get-Item 'connectr.ps1.tmp').Length -gt 1000) { Move-Item 'connectr.ps1.tmp' 'connectr.ps1' -Force } } catch { Remove-Item 'connectr.ps1.tmp' -ErrorAction SilentlyContinue }"

if not exist "connectr.ps1" (
    echo [!] Nao foi possivel baixar connectr.ps1. Verifique sua internet.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "connectr.ps1"

pause
