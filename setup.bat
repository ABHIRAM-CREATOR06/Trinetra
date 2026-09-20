@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   [+] त्रिनेत्र (Trinetra) Platform One-Click Setup
echo ===================================================
echo.

:: 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [-] Error: Python 3 is not installed or not in system PATH.
    echo     Please install Python 3.9+ and try again.
    pause
    exit /b 1
)
echo [+] Python detected successfully.

:: 2. Check Rust / Cargo
cargo --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [-] Error: Rust / Cargo is not installed or not in system PATH.
    echo     Please install Rust from https://rustup.rs/ and try again.
    pause
    exit /b 1
)
echo [+] Rust/Cargo detected successfully.
echo.

:: 3. Install Python requirements
echo [*] Step 1/4: Installing Python ML and generator dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [-] Failed to install Python packages.
    pause
    exit /b 1
)
echo [+] Python packages installed.
echo.

:: 4. Generate database and seed data
echo [*] Step 2/4: Generating synthetic telecom database and migrations (trinetra.db)...
python data-generator/generator.py --clean
if %errorlevel% neq 0 (
    echo [-] Data generation failed.
    pause
    exit /b 1
)
echo [+] Database generated successfully at data/trinetra.db.
echo.

:: 5. Train initial ML models
echo [*] Step 3/4: Training initial Isolation Forest & Random Forest ML models...
python ml/train.py
if %errorlevel% neq 0 (
    echo [-] ML model training failed.
    pause
    exit /b 1
)
echo [+] ML models trained and saved to ml/models/.
echo.

:: 6. Build Rust Backend
echo [*] Step 4/4: Building Rust Axum backend (release build)...
cd backend
cargo build --release
if %errorlevel% neq 0 (
    echo [-] Cargo build failed.
    cd ..
    pause
    exit /b 1
)
cd ..
echo [+] Rust backend compiled successfully.
echo.

echo ===================================================
echo   [+] Setup Complete! Trinetra is ready.
echo ===================================================
echo.
echo To start the backend server:
echo   cd backend
echo   cargo run --release
echo.
echo Then open `frontend/index.html` in your browser.
echo.
pause
