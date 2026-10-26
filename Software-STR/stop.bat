@echo off
setlocal
cd /d "%~dp0"
title STRflow — detener

echo.
echo   Deteniendo STRflow...

REM Frontend y API: procesos node de este proyecto.
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'server[/\\]index\.js|vite' -and $_.CommandLine -notmatch 'vitest' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; '   detenido: ' + $_.ProcessId }"

REM MongoDB: solo el binario local. Si es el servicio de Windows, se deja
REM corriendo a proposito (lo administra Windows).
powershell -NoProfile -Command ^
  "Get-Process -Name 'mongod-x64-win32-*' -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force; '   MongoDB local detenido' }"

echo.
echo   Listo. Los datos siguen guardados en .mongodb-data
echo.
ping -n 4 127.0.0.1 >nul
endlocal
