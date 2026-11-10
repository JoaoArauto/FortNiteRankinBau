@echo off
setlocal
set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;C:\Program Files\Git\cmd;%PATH%"
title Fortnite Chest Ranking - connectr
color 0B

cd /d "%~dp0"

:: Se connectr.js nao existir na pasta onde connectr.bat esta rodando (ex: baixado sozinho nos Downloads), baixa automaticamente!
if not exist "%~dp0connectr.js" (
    echo [*] Baixando connectr.js do GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/JoaoArauto/FortNiteRankinBau/main/connectr.js', '%~dp0connectr.js')"
)

:: Localiza o executavel do Node.js
set "NODE_EXE=node"
if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

"%NODE_EXE%" -v >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [!] Node.js nao foi encontrado no seu computador!
    echo Baixe e instale o Node.js em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

"%NODE_EXE%" "%~dp0connectr.js"
pause
