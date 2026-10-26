@echo off
setlocal
cd /d "%~dp0"
title STRflow

echo.
echo   STRflow — iniciando
echo   ===================
echo.

REM --- 1. MongoDB -----------------------------------------------------------
REM Si el servicio de Windows esta instalado, se usa ese. Si no, se levanta el
REM binario incluido apuntando a la misma carpeta de datos (.mongodb-data).

powershell -NoProfile -Command "exit [int](Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -InformationLevel Quiet)" >nul 2>&1
if %errorlevel%==1 (
  echo   [1/3] MongoDB ya estaba corriendo.
  goto :mongo_ok
)

sc query MongoDB >nul 2>&1
if %errorlevel%==0 (
  echo   [1/3] Iniciando el servicio MongoDB de Windows...
  net start MongoDB >nul 2>&1
  goto :mongo_wait
)

set "MONGOD=node_modules\.cache\mongodb-memory-server\mongod-x64-win32-8.2.6.exe"
if not exist "%MONGOD%" (
  echo   [X] No se encontro MongoDB.
  echo       Instala MongoDB Community Server, o ejecuta: npm install
  pause
  exit /b 1
)
if not exist ".mongodb-data" mkdir ".mongodb-data"
echo   [1/3] Iniciando MongoDB (binario local)...
start "MongoDB" /min "%MONGOD%" --dbpath ".mongodb-data" --port 27017 --bind_ip 127.0.0.1

:mongo_wait
powershell -NoProfile -Command "$n=0; while($n -lt 40){ if(Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -InformationLevel Quiet){exit 0}; Start-Sleep -Milliseconds 500; $n++ }; exit 1"
if errorlevel 1 (
  echo   [X] MongoDB no respondio. Revisa .mongodb-data\mongod.log
  pause
  exit /b 1
)

:mongo_ok
echo         MongoDB listo en 127.0.0.1:27017

REM --- 2. API ---------------------------------------------------------------
echo   [2/3] Iniciando la API...
start "STRflow API" /min cmd /c "npm run api"
powershell -NoProfile -Command "$n=0; while($n -lt 60){ try{ if((Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){exit 0} }catch{}; Start-Sleep -Milliseconds 500; $n++ }; exit 1"
if errorlevel 1 (
  echo   [X] La API no levanto. Revisa la ventana "STRflow API".
  pause
  exit /b 1
)
echo         API lista en http://localhost:8787

REM --- 3. Frontend ----------------------------------------------------------
echo   [3/3] Iniciando el frontend...
start "STRflow Web" /min cmd /c "npm run dev:web"
powershell -NoProfile -Command "$n=0; while($n -lt 60){ try{ Invoke-WebRequest 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 }catch{}; Start-Sleep -Milliseconds 500; $n++ }; exit 1"
if errorlevel 1 (
  echo   [X] El frontend no levanto. Revisa la ventana "STRflow Web".
  pause
  exit /b 1
)

echo.
echo   Todo listo. Abriendo http://localhost:5173
echo.
echo   Para apagar todo: stop.bat
echo.
start "" "http://localhost:5173"
ping -n 4 127.0.0.1 >nul
endlocal
