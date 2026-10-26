<#
    Instala MongoDB Community Server como servicio de Windows y lo apunta a
    la carpeta de datos del proyecto, para no perder nada de lo que ya existe.

    Hay que ejecutarlo COMO ADMINISTRADOR:
      1. Menú inicio -> escribe "PowerShell"
      2. Clic derecho -> "Ejecutar como administrador"
      3. cd C:\SoftwareSTR\Software-STR
      4. powershell -ExecutionPolicy Bypass -File scripts\install-mongodb-service.ps1
#>

$ErrorActionPreference = 'Stop'

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    $text" -ForegroundColor Yellow }

# --- 0. Verificaciones ------------------------------------------------------

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "`nEste script necesita permisos de administrador." -ForegroundColor Red
    Write-Host "Abre PowerShell con clic derecho -> 'Ejecutar como administrador' y vuelve a correrlo.`n"
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $projectRoot '.mongodb-data'
Step "Proyecto: $projectRoot"
Ok "Carpeta de datos que se va a conservar: $dataPath"

if (-not (Test-Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath | Out-Null
    Ok "Carpeta de datos creada (estaba vacía)."
}

# --- 1. Detener el MongoDB local que levanta start.bat ----------------------

Step "Deteniendo cualquier MongoDB local en ejecución"
$local = Get-Process -Name 'mongod-x64-win32-*' -ErrorAction SilentlyContinue
if ($local) {
    $local | Stop-Process -Force
    Start-Sleep -Seconds 3
    Ok "Detenido (los datos en disco no se tocan)."
} else {
    Ok "No había ninguno corriendo."
}

# --- 2. Instalar MongoDB Community Server -----------------------------------

$existing = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
if ($existing) {
    Ok "El servicio MongoDB ya estaba instalado; se reutiliza."
} else {
    Step "Instalando MongoDB Community Server con winget (puede tardar varios minutos)"
    winget install --id MongoDB.Server --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nLa instalación falló." -ForegroundColor Red
        Write-Host "Descárgalo a mano desde https://www.mongodb.com/try/download/community"
        Write-Host "y vuelve a correr este script.`n"
        exit 1
    }
    Ok "MongoDB instalado."
    Start-Sleep -Seconds 5
}

# --- 3. Apuntar el servicio a la carpeta de datos del proyecto --------------

Step "Configurando el servicio para usar los datos del proyecto"

$config = Get-ChildItem 'C:\Program Files\MongoDB\Server\*\bin\mongod.cfg' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1

if (-not $config) {
    Write-Host "`nNo se encontró mongod.cfg." -ForegroundColor Red
    Write-Host "Revisa que MongoDB se haya instalado en C:\Program Files\MongoDB.`n"
    exit 1
}
Ok "Archivo de configuración: $($config.FullName)"

Stop-Service -Name 'MongoDB' -Force -ErrorAction SilentlyContinue
Copy-Item $config.FullName "$($config.FullName).bak" -Force
Ok "Respaldo guardado como mongod.cfg.bak"

# dbPath usa barras normales en el YAML de mongod.
$yamlPath = $dataPath -replace '\\', '/'
$content = Get-Content $config.FullName -Raw
$content = $content -replace '(?m)^(\s*dbPath:\s*).*$', "`${1}$yamlPath"
Set-Content -Path $config.FullName -Value $content -Encoding ascii
Ok "dbPath apuntando a $yamlPath"

# El servicio corre como NT SERVICE\MongoDB y necesita permisos en la carpeta.
icacls $dataPath /grant "NT SERVICE\MongoDB:(OI)(CI)F" /T /Q | Out-Null
Ok "Permisos otorgados al servicio sobre la carpeta de datos."

# --- 4. Arrancar y dejarlo en automático ------------------------------------

Step "Iniciando el servicio"
Set-Service -Name 'MongoDB' -StartupType Automatic
Start-Service -Name 'MongoDB'

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -InformationLevel Quiet) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Write-Host "`nEl servicio no respondió en el puerto 27017." -ForegroundColor Red
    Write-Host "Revisa el log en $dataPath o ejecuta: Get-Service MongoDB`n"
    exit 1
}

$service = Get-Service -Name 'MongoDB'
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " LISTO" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Servicio : $($service.Name) — $($service.Status)"
Write-Host " Arranque : Automático (se inicia solo con Windows)"
Write-Host " Datos    : $dataPath"
Write-Host ""
Write-Host " Ya no hace falta levantar MongoDB a mano."
Write-Host " Para el resto del sistema: start.bat"
Write-Host ""
Write-Host " Comprueba que tus datos siguen ahí con: npm run audit"
Write-Host ""
