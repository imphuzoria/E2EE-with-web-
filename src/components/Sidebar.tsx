import React, { useState } from 'react';
import { Plus, Hash, QrCode } from 'lucide-react';
import { RoomConfig, Peer } from '../types/chat';

interface SidebarProps {
  rooms: RoomConfig[];
  currentRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenNewRoomModal: () => void;
  onOpenInviteModal: () => void;
  userName: string;
  onChangeUserName: (name: string) => void;
  peerId: string;
  peers: Peer[];
  onOpenPeerSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  rooms,
  currentRoomId,
  onSelectRoom,
  onOpenNewRoomModal,
  onOpenInviteModal,
  userName,
  onChangeUserName,
  peerId,
  peers,
  onOpenPeerSettings,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(userName);

  const handleSaveName = () => {
    if (tempName.trim()) {
      onChangeUserName(tempName.trim());
    }
    setIsEditingName(false);
  };

  return (
    <aside className="w-64 bg-[#111215] border-r border-[#23242a] flex flex-col h-[calc(100vh-3.5rem)] shrink-0 select-none font-sans">
      {/* User Identity */}
      <div className="p-3.5 border-b border-[#23242a]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase text-neutral-400">Узел</span>
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" title="В сети" />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                autoFocus
                className="w-full text-xs bg-[#1a1b20] border border-[#30323c] rounded px-2 py-0.5 text-white font-mono focus:outline-none"
              />
            ) : (
              <div
                onClick={() => {
                  setTempName(userName);
                  setIsEditingName(true);
                }}
                className="text-xs font-mono font-medium text-neutral-200 truncate hover:text-white cursor-pointer"
                title="Нажмите, чтобы изменить имя"
              >
                {userName}
              </div>
            )}
            <div className="text-[10px] font-mono text-neutral-400 truncate mt-0.5">
              id: {peerId.slice(0, 10)}
            </div>
          </div>
        </div>
      </div>

      {/* Rooms header */}
      <div className="p-3 pb-1 flex items-center justify-between text-xs font-mono">
        <span className="text-[10px] uppercase text-neutral-400">Каналы</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenInviteModal}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#1c1d22] transition-colors cursor-pointer"
            title="Пригласить по QR или коду"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenNewRoomModal}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#1c1d22] transition-colors cursor-pointer"
            title="Создать канал"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Rooms list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
        {rooms.map((room) => {
          const isActive = room.id === currentRoomId;
          return (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className={`w-full text-left px-2.5 py-2 rounded transition-colors flex items-center justify-between group cursor-pointer font-mono text-xs ${
                isActive
                  ? 'bg-[#1b1c22] text-white border border-[#2e303c]'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#16171d] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Hash className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                <span className="truncate">{room.name || room.id}</span>
              </div>
              {isActive && <div className="w-1 h-1 rounded-full bg-white shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Peers online */}
      <div className="p-3 border-t border-[#23242a] bg-[#111215]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase text-neutral-400">
            В канале ({peers.length})
          </span>
          {peers.length > 0 && (
            <button
              onClick={onOpenPeerSettings}
              className="text-[10px] font-mono text-neutral-400 hover:text-white underline cursor-pointer"
            >
              Верификация
            </button>
          )}
        </div>

        <div className="space-y-1 max-h-32 overflow-y-auto">
          {peers.length === 0 ? (
            <div className="text-[11px] font-mono text-neutral-400 py-1">
              Ожидание узлов...
            </div>
          ) : (
            peers.map((peer) => (
              <div
                key={peer.id}
                className="flex items-center gap-2 py-1 text-xs font-mono text-neutral-300"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0" />
                <span className="truncate">{peer.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Minimal Footer (no e2ee text) */}
      <div className="px-3 py-2.5 border-t border-[#23242a] text-[10px] font-mono text-neutral-400 flex items-center justify-between">
        <span>онлайн</span>
        <span>Ctrl+K</span>
      </div>
    </aside>
  );
};
