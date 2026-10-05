@echo off
setlocal EnableDelayedExpansion

title DashBrowser - Auto Setup & Launch
color 0b

echo ========================================================
echo   DASHBROWSER: Setup Otomatis (1-Click Run Windows)
echo ========================================================
echo.

:: 1. Cek Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js belum terpasang di laptop ini!
    echo.
    echo Silakan download dan pasang Node.js LTS terlebih dahulu:
    echo https://nodejs.org/en/download
    echo.
    pause
    exit /b
)
echo [1/3] Node.js terdeteksi.

:: 2. Install Dependencies jika node_modules belum ada
if not exist "node_modules\" (
    echo [2/3] Mengunduh modul yang dibutuhkan (npm install)...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        color 0c
        echo [ERROR] Gagal mengunduh dependensi npm. Cek koneksi internet.
        pause
        exit /b
    )
) else (
    echo [2/3] Dependensi npm sudah lengkap.
)

:: 3. Jalankan Server dan Otomatis Buka Browser
echo [3/3] Menjalankan server DashBrowser...
echo.
echo ========================================================
echo   DashBrowser AKTIF di http://127.0.0.1:8200
echo   Jangan tutup jendela hitam ini selama menggunakan!
echo ========================================================
echo.

start "" "http://127.0.0.1:8200"
node server/index.js

pause
