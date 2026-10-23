@echo off
chcp 65001 >nul
title SecureMessenger - полный запуск
color 0A
echo ================================================
echo    SecureMessenger - мастер запуска
echo ================================================
echo.

REM Если есть автономный exe - запускаем его
if exist "release\SecureMessenger.exe" (
    echo [*] Запуск автономного приложения SecureMessenger.exe...
    start "" "release\SecureMessenger.exe"
    exit /b 0
)

REM Иначе проверяем зависимости и запускаем сервер
if not exist "node_modules\" (
    echo [!] Зависимости не установлены. Установка...
    call npm install
    if errorlevel 1 (
        echo [X] Ошибка установки. Запустите install.bat
        pause
        exit /b 1
    )
)

call start.bat
