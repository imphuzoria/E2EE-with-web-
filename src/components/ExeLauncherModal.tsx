import React, { useState } from 'react';
import { X, Terminal, Download, Laptop, Play, Info, CheckCircle2, FileCode } from 'lucide-react';

interface ExeLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExeLauncherModal: React.FC<ExeLauncherModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'download' | 'faq'>('download');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141417] border border-[#272830] rounded-xl w-full max-w-lg shadow-2xl text-neutral-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#23242a] flex items-center justify-between bg-[#101114]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1f2028] border border-[#2c2d38] flex items-center justify-center text-white">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold text-white">####.exe / Исполняемый файл для ПК</h2>
              <p className="text-[11px] text-neutral-400">
                Автономный Windows PE64 бинарник с веб-оболочкой
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#1a1b20] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#222228] bg-[#0f0f12] px-6 text-xs font-mono">
          <button
            onClick={() => setActiveTab('download')}
            className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'download'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Скачать .EXE
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'faq'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Как это устроено
          </button>
        </div>

        {/* Tab 1: Direct EXE Download */}
        {activeTab === 'download' && (
          <div className="p-6 space-y-4 text-xs text-neutral-300">
            <div className="p-3.5 bg-[#181920] border border-[#282935] rounded-lg flex items-start gap-3">
              <Laptop className="w-5 h-5 text-neutral-300 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <div className="font-semibold text-white text-xs">
                  Настоящий бинарный файл ####.exe
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Скомпилированный 64-битный Windows GUI исполняемый файл. Запускается локально на ПК и автоматически открывает защищённый интерфейс на <code className="text-white font-mono">http://localhost:3000</code> без лишних окон терминала.
                </p>
              </div>
            </div>

            {/* Main EXE Action */}
            <div className="p-4 bg-[#101115] border border-[#262732] rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-white text-xs flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-neutral-300" />
                  <span>Исполняемый файл для Windows</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-400 bg-[#1c1d24] px-2 py-0.5 rounded border border-[#272832]">
                  PE32+ 64-bit
                </span>
              </div>

              <a
                href="/api/download-exe"
                download="####.exe"
                className="w-full py-2.5 px-4 bg-white text-black hover:bg-neutral-200 font-semibold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm font-mono text-center"
              >
                <Download className="w-4 h-4" />
                <span>Скачать ####.exe (Прямой файл)</span>
              </a>

              <p className="text-[10px] text-neutral-400 font-mono text-center">
                Размер ~2 КБ · Не требует установки · Запуск в 1 клик на Windows 10/11
              </p>
            </div>

            {/* Alternative .bat script */}
            <div className="p-3 bg-[#121317] border border-[#22232a] rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Альтернативный скрипт лаунчера</div>
                <div className="text-[11px] text-neutral-400">Текстовый .bat файл для быстрого запуска</div>
              </div>
              <a
                href="/api/download-bat"
                download="####-launcher.bat"
                className="px-3 py-1.5 bg-[#1e1f26] hover:bg-[#272832] text-neutral-200 hover:text-white border border-[#2c2d38] rounded text-xs font-mono transition-colors"
              >
                Скачать .BAT
              </a>
            </div>
          </div>
        )}

        {/* Tab 2: FAQ */}
        {activeTab === 'faq' && (
          <div className="p-6 space-y-3 text-xs text-neutral-300 font-sans">
            <div className="p-3 bg-[#181920] border border-[#282935] rounded-lg">
              <div className="font-semibold text-white mb-1">
                Как работает ####.exe на компьютере?
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Файл <code className="text-white font-mono">####.exe</code> скомпилирован в формате PE (Portable Executable) для архитектуры x86-64. При двойном клике в Windows он вызывает системный вызов <code className="text-white font-mono">ShellExecuteA</code>, который открывает локальную графическую оболочку в вашем браузере по адресу <code className="text-white font-mono">http://localhost:3000</code>.
              </p>
            </div>

            <div className="p-3 bg-[#181920] border border-[#282935] rounded-lg">
              <div className="font-semibold text-white mb-1">
                Где происходят вычисления и шифрование?
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Всё шифрование (AES-256-GCM, генерация ключей и отпечатков) происходит локально на вашем компьютере с помощью аппаратного криптографического модуля браузера.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#23242a] bg-[#101114] flex items-center justify-between font-mono text-xs text-neutral-400">
          <span>PE32+ Executable · Windows</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1d1e24] hover:bg-[#262732] text-white rounded cursor-pointer transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
