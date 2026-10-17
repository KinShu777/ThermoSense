@echo off
cd /d "%~dp0"
title Urban Heat Mitigation AI

:: If virtual environment does not exist, set it up automatically (first-time only)
if not exist "venv" (
    echo [1/3] Setting up virtual environment (first run only)...
    python -m venv venv
    if errorlevel 1 (
        echo Failed to create virtual environment. Ensure Python is installed and in PATH.
        pause
        exit /b 1
    )
    call venv\Scripts\activate.bat
    echo [2/3] Installing dependencies...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)

:: Launch browser automatically after server initializes
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5000"

:: Launch the Flask web server
echo [3/3] Starting server at http://localhost:5000 ...
python app.py
pause
