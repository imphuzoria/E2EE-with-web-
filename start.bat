@echo off
chcp 65001 >nul
title SecureMessenger
color 0A
echo ================================================
echo    SecureMessenger - запуск
echo ================================================
echo.

if exist "dist\index.html" (
    echo [*] Запуск локального сервера (python)...
    echo [*] Браузер откроется автоматически: http://localhost:3000
    echo.
    python app.py
) else (
    echo [*] Frontend ещё не собран - запуск в режиме разработки...
    echo.
    call npm run dev
)

echo.
pause
