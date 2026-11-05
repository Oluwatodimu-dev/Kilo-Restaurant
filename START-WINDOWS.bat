@echo off
title Kilo Kitchen - leave this window open
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet. It is a free, one-time install.
  echo  Opening the download page now. Install the LTS version, then
  echo  double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)
echo.
echo  Starting Kilo Kitchen ...
echo  Website: http://localhost:3000     Admin: http://localhost:3000/admin/
echo  Keep this window open. Close it to stop the website.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000/ & start http://localhost:3000/admin/"
node server.js
pause
