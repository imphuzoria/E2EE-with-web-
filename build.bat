@echo off
chcp 65001 >nul
title SecureMessenger - Сборка автономного EXE
color 0E
echo ================================================
echo    SecureMessenger - сборка автономного .exe
echo ================================================
echo.

echo [1/3] Сборка frontend (Vite)...
call npm run build
if errorlevel 1 (
    echo.
    echo [X] Ошибка сборки frontend. Установите зависимости: install.bat
    pause
    exit /b 1
)

echo.
echo [2/3] Установка PyInstaller (если нужно)...
python -m pip install --disable-pip-version-check --quiet pyinstaller

echo.
echo [3/3] Упаковка в единый SecureMessenger.exe...
python build_windows.py

echo.
echo ================================================
echo    Готово! Файл: release\SecureMessenger.exe
echo ================================================
echo.
echo Скопируйте его на любую машину с Windows и запустите двойным кликом.
echo.
pause
