@echo off
setlocal
set "NODE="

if defined TRAE_PET_NODE (
  set "CANDIDATE=%TRAE_PET_NODE%"
  call :try_node
)

if not defined NODE (
  set "NODE_RECORD=%~dp0..\node-path.json"
  if exist "%~dp0..\node-path.json" (
    for /f "usebackq delims=" %%N in (`powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; (Get-Content -LiteralPath $env:NODE_RECORD -Raw | ConvertFrom-Json).execPath" 2^>nul`) do (
      if not defined NODE (
        set "CANDIDATE=%%N"
        call :try_node
      )
    )
  )
)

if not defined NODE (
  for /f "usebackq delims=" %%N in (`where.exe node 2^>nul`) do (
    if not defined NODE (
      set "CANDIDATE=%%N"
      call :try_node
    )
  )
)

if not defined NODE if defined ProgramFiles (
  set "CANDIDATE=%ProgramFiles%\nodejs\node.exe"
  call :try_node
)
if not defined NODE (
  set "CANDIDATE=%ProgramFiles(x86)%\nodejs\node.exe"
  call :try_node
)

if not defined NODE (
  echo [trae-pet] No supported Node runtime found. Install Node 22/24 LTS, then rerun: trae-pet install-hooks 1>&2
  exit /b 1
)

"%NODE%" "%~dp0trae-pet.js" %*
exit /b %errorlevel%

:try_node
if not defined CANDIDATE exit /b 1
if not exist "%CANDIDATE%" exit /b 1
set "NODE_VERSION="
set "NODE_VERSION_FILE=%TEMP%\trae-pet-node-version-%RANDOM%-%RANDOM%.txt"
"%CANDIDATE%" -p "process.versions.node" >"%NODE_VERSION_FILE%" 2>nul
if errorlevel 1 (
  del /q "%NODE_VERSION_FILE%" >nul 2>nul
  exit /b 1
)
set /p NODE_VERSION=<"%NODE_VERSION_FILE%"
del /q "%NODE_VERSION_FILE%" >nul 2>nul
if not defined NODE_VERSION exit /b 1
echo(%NODE_VERSION%| %SystemRoot%\System32\findstr.exe /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul || exit /b 1
for /f "tokens=1-3 delims=." %%A in ("%NODE_VERSION%") do (
  if "%%A"=="24" set "NODE=%CANDIDATE%"
  if "%%A"=="22" if %%B GEQ 12 set "NODE=%CANDIDATE%"
)
exit /b 0
