@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" if exist "..\package.json" cd ..

where node >nul 2>nul
if errorlevel 1 (
  echo Cutout needs Node.js. Install it from https://nodejs.org then double-click this again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First launch: installing packages. This needs the internet once.
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".next\BUILD_ID" (
  echo First launch: building Cutout.
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

echo Opening Cutout at http://127.0.0.1:43123
start "" "http://127.0.0.1:43123"
call npm start
