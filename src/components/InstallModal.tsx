import React from 'react';
import { X, Download, Laptop, Check } from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstallClick: () => void;
}

export const InstallModal: React.FC<InstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallClick,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-xl w-full max-w-md shadow-2xl text-neutral-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1E1E1E] flex items-center justify-between bg-[#000000]">
          <span className="font-mono font-bold text-sm text-white">
            #### / запуск на пк
          </span>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <p className="text-neutral-400 leading-relaxed">
            Приложение работает через веб-сервер, но запускается на компьютере как отдельная программа без интерфейса браузера (Desktop PWA).
          </p>

          {deferredPrompt && (
            <button
              onClick={onInstallClick}
              className="w-full py-2.5 px-4 bg-white text-black hover:bg-neutral-200 font-semibold rounded-md flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Установить #### на ПК</span>
            </button>
          )}

          <div className="space-y-2 font-mono text-[11px] text-neutral-400 border-t border-[#1E1E1E] pt-3">
            <div className="text-white font-sans text-xs font-semibold mb-1">Ручная установка:</div>
            <div>1. Нажмите иконку монитора со стрелкой в адресной строке браузера.</div>
            <div>2. Либо откройте меню браузера (⋮) → «Установить приложение».</div>
            <div>3. Приложение добавится на рабочий стол ПК.</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1E1E1E] bg-[#000000] flex items-center justify-between font-mono text-[11px] text-neutral-400">
          <span>Windows / macOS / Linux</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
