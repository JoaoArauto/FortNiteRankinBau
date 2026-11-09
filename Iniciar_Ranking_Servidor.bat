@echo off
set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0;%SystemRoot%\System32\OpenSSH;C:\Program Files\nodejs"
title Servidor Ranking de Baus Fortnite (ChestCounter)
color 0E

cd /d "%~dp0"

echo Iniciando o painel web do Ranking Ao Vivo...
start "" "http://localhost:3000"

"C:\Program Files\nodejs\node.exe" server.js
pause
