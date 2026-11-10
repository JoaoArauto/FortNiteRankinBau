@echo off
setlocal
title Fortnite Chest Ranking - connectr
color 0B

cd /d "%~dp0"

:: Se connectr.ps1 nao estiver na mesma pasta (ex: baixou somente o connectr.bat), baixa do GitHub automaticamente!
if not exist "%~dp0connectr.ps1" (
    echo [*] Baixando componentes necessarios do GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/JoaoArauto/FortNiteRankinBau/main/connectr.ps1', '%~dp0connectr.ps1')"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0connectr.ps1"

pause
