"""
Сборка автономного Windows .exe для SecureMessenger.

Требования:
    - Python 3.9+ с установленным PyInstaller (pip install pyinstaller)
    - Уже собранный frontend в папке `dist/` (npm run build)

Результат:
    build/SecureMessenger.exe  (один файл, без установки, без Node/Python)

Запуск:  python build_windows.py
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    dist_dir = os.path.join(HERE, "dist")
    if not os.path.isfile(os.path.join(dist_dir, "index.html")):
        print("[!] Папка dist/ не найдена. Сначала выполните сборку frontend (npm run build).")
        sys.exit(1)

    # Проверка/установка PyInstaller
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("[*] Устанавливаю PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    from PyInstaller.__main__ import run as pyi_run

    icon = os.path.join(HERE, "public", "icon.ico")
    args = [
        "app.py",
        "--name=SecureMessenger",
        "--onefile",
        "--noconsole",
        "--clean",
        "--noconfirm",
        f"--add-data={dist_dir}{os.pathsep}dist",
        f"--distpath={os.path.join(HERE, 'release')}",
        f"--workpath={os.path.join(HERE, 'build')}",
        f"--specpath={os.path.join(HERE, 'build')}",
    ]
    if os.path.isfile(icon):
        args.append(f"--icon={icon}")

    print("[*] Запускаю PyInstaller...")
    pyi_run(args)

    out = os.path.join(HERE, "release", "SecureMessenger.exe")
    if os.path.isfile(out):
        size_mb = os.path.getsize(out) / (1024 * 1024)
        print(f"[OK] Готово: {out} ({size_mb:.1f} МБ)")
    else:
        print("[!] Не удалось создать exe. Проверьте вывод PyInstaller выше.")
        sys.exit(1)


if __name__ == "__main__":
    main()
