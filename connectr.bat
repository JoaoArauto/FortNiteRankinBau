@echo off
set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;C:\Program Files\Git\cmd"
title Fortnite Chest Ranking - connectr
color 0B

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 (
    node "%~dp0connectr.js"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& { & 'C:\Program Files\nodejs\node.exe' '%~dp0connectr.js' }"
)

pause
