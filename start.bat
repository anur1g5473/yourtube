@echo off
setlocal EnableDelayedExpansion
set "PROJECT_DIR=%~dp0"
set "MONGO_DATA=%LOCALAPPDATA%\YourTube\MongoData"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or is not on PATH.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%server\.env" (
  echo No server\.env found. Using local-only defaults for MongoDB and Firebase.
  for /f "delims=" %%A in ('node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"') do set "LOCAL_APP_SECRET=%%A"
  for /f "delims=" %%A in ('node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"') do set "LOCAL_MEDIA_SECRET=%%A"
  if not defined LOCAL_APP_SECRET (
    echo Could not generate a local application session secret.
    pause
    exit /b 1
  )
  if not defined LOCAL_MEDIA_SECRET (
    echo Could not generate a local media secret.
    pause
    exit /b 1
  )
  set "DB_URL=mongodb://127.0.0.1:27017/yourtube"
  set "FIREBASE_PROJECT_ID=yourtube-8cda9"
  set "APP_SESSION_SECRET=!LOCAL_APP_SECRET!"
  set "MEDIA_TOKEN_SECRET=!LOCAL_MEDIA_SECRET!"
)

set "MONGOD_PATH="
where mongod >nul 2>nul
if not errorlevel 1 set "MONGOD_PATH=mongod"
if not defined MONGOD_PATH (
  for /d %%D in ("%PROJECT_DIR%..\mongodb*") do (
    if exist "%%~fD\bin\mongod.exe" set "MONGOD_PATH=%%~fD\bin\mongod.exe"
  )
)

if defined MONGOD_PATH (
  powershell -NoProfile -Command "$client = New-Object System.Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1', 27017); exit 0 } catch { exit 1 } finally { $client.Dispose() }" >nul 2>nul
  if errorlevel 1 (
    if not exist "%MONGO_DATA%" mkdir "%MONGO_DATA%"
    start "YourTube MongoDB" /D "%PROJECT_DIR%" cmd /k ""%MONGOD_PATH%" --dbpath "%MONGO_DATA%""
    timeout /t 5 /nobreak >nul
  ) else (
    echo MongoDB is already accepting connections on port 27017.
  )
)

start "YourTube Backend" /D "%PROJECT_DIR%server" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "YourTube Frontend" /D "%PROJECT_DIR%yourtube" cmd /k "npm run dev"

echo Started the backend and frontend in separate windows.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
if not defined MONGOD_PATH echo MongoDB executable was not found. Start MongoDB manually if the backend cannot connect.
echo When server\.env is absent, temporary local-only secrets are generated for this run.
echo Provider credentials are not required to start the app.
endlocal
