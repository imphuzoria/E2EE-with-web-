import React, { useState } from 'react';
import { X, Hash, Key, Sparkles, ArrowRight } from 'lucide-react';
import { RoomConfig } from '../types/chat';

interface NewRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (room: RoomConfig) => void;
}

export const NewRoomModal: React.FC<NewRoomModalProps> = ({
  isOpen,
  onClose,
  onCreateRoom,
}) => {
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const generateStrongKey = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
    const array = new Uint8Array(24);
    window.crypto.getRandomValues(array);
    let key = '';
    for (let i = 0; i < array.length; i++) {
      key += chars[array[i] % chars.length];
    }
    setPassphrase(key);
  };

  const generateRandomRoomId = () => {
    const id = 'room-' + Math.random().toString(36).substring(2, 8);
    setRoomId(id);
    if (!roomName) {
      setRoomName(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = roomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleanId) {
      setError('Укажите идентификатор комнаты');
      return;
    }
    if (!passphrase.trim()) {
      setError('Задайте пароль или ключ шифрования');
      return;
    }

    onCreateRoom({
      id: cleanId,
      name: roomName.trim() || cleanId,
      passphrase: passphrase.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-xl w-full max-w-md shadow-2xl text-neutral-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1E1E1E] flex items-center justify-between bg-[#000000]">
          <span className="font-mono font-bold text-sm text-white">
            #### / создать или войти
          </span>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300">
              {error}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-neutral-300 font-mono">ID комнаты</label>
              <button
                type="button"
                onClick={generateRandomRoomId}
                className="text-[11px] text-neutral-400 hover:text-white cursor-pointer font-mono"
              >
                Случайный ID
              </button>
            </div>
            <input
              type="text"
              placeholder="например: dev-room, ops"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full bg-black border border-[#2b2b2b] rounded-lg p-2.5 text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              required
            />
          </div>

          <div>
            <label className="font-medium text-neutral-300 block mb-1">
              Отображаемое имя (необязательно)
            </label>
            <input
              type="text"
              placeholder="например: Проект / Чат"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full bg-black border border-[#2b2b2b] rounded-lg p-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-neutral-300 font-mono">Секретный ключ / пароль</label>
              <button
                type="button"
                onClick={generateStrongKey}
                className="text-[11px] text-neutral-400 hover:text-white cursor-pointer font-mono"
              >
                Сгенерировать
              </button>
            </div>
            <input
              type="text"
              placeholder="Пароль для AES-256"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full bg-black border border-[#2b2b2b] rounded-lg p-2.5 text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              required
            />
            <p className="text-[10px] text-neutral-400 mt-1 font-mono">
              Ключ никогда не отправляется на сервер (E2EE).
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-md font-medium cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded-md font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <span>Войти</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
