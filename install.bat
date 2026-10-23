@echo off
chcp 65001 >nul
title SecureMessenger - Установка (dev)
color 0B
echo ================================================
echo    SecureMessenger - установка зависимостей
echo ================================================
echo.

echo [1/2] Установка Node.js модулей...
call npm install
if errorlevel 1 (
    echo [X] Не удалось установить npm-зависимости.
    pause
    exit /b 1
)

echo.
echo [2/2] Установка PyInstaller...
python -m pip install --disable-pip-version-check pyinstaller

echo.
echo ================================================
echo    Установка завершена!
echo ================================================
echo.
echo Для запуска в режиме разработки:   start.bat
echo Для сборки автономного .exe:       build.bat
echo.
pause
