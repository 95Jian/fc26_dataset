@echo off
title FC26
cd /d "%~dp0"
start /b node server.js
timeout /t 2 /nobreak >nul
curl -s http://localhost:8765/ >nul 2>&1
if errorlevel 1 goto fail
echo Server started. Press any key to stop and export.
pause >nul
curl -s -X POST http://localhost:8765/shutdown >nul 2>&1
timeout /t 2 /nobreak >nul
goto end
:fail
echo Failed to start. Check server.log
pause
:end
