import React from 'react';
import { Settings, Terminal } from 'lucide-react';
import { RoomConfig } from '../types/chat';

interface HeaderProps {
  currentRoom: RoomConfig | null;
  peerCount: number;
  onOpenSettings: () => void;
  onOpenExeModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoom,
  peerCount,
  onOpenSettings,
  onOpenExeModal,
}) => {
  return (
    <header className="h-14 px-6 border-b border-[#23242a] bg-[#141518] flex items-center justify-between gap-6 shrink-0 select-none">
      {/* Zone 1: Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="font-mono font-bold text-lg text-white tracking-wider hover:opacity-80 transition-opacity">
          SecureMessenger
        </a>
      </div>

      {/* Zone 2: Contextual room info */}
      <nav className="flex items-center gap-4 text-xs font-mono text-neutral-400">
        {currentRoom && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-200">#{currentRoom.name || currentRoom.id}</span>
            <span className="text-neutral-600">/</span>
            <span className="text-neutral-400">
              {peerCount} {peerCount === 1 ? 'узел' : 'узла'}
            </span>
          </div>
        )}
      </nav>

      {/* Zone 3: Actions (No invite button here!) */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenExeModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1d1e24] hover:bg-[#272830] border border-[#2d2e38] text-neutral-200 hover:text-white rounded-md text-xs font-mono transition-colors cursor-pointer"
          title="Локальное приложение для ПК: запуск через .exe с интерфейсом через сайт"
        >
          <Terminal className="w-3.5 h-3.5 text-neutral-300" />
          <span>SecureMessenger.exe</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1d1e24] hover:bg-[#272830] border border-[#2d2e38] text-neutral-200 hover:text-white rounded-md text-xs font-mono transition-colors cursor-pointer"
          title="Настройки"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Настройки</span>
        </button>
      </div>
    </header>
  );
};
