@echo off
cd /d "%~dp0"
echo Open http://localhost:8000 in your browser.
echo Press Ctrl+C to stop the server.
py -m http.server 8000 --directory dist
if errorlevel 1 pause
