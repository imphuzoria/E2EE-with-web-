import React, { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode, ExternalLink, ArrowRight } from 'lucide-react';
import QRCode from 'qrcode';
import { RoomConfig } from '../types/chat';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoom: RoomConfig | null;
  onJoinByCode: (code: string) => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  currentRoom,
  onJoinByCode,
}) => {
  const [activeTab, setActiveTab] = useState<'invite' | 'join'>('invite');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Invite code format: base64(roomId + ":" + passphrase)
  const inviteCode = currentRoom
    ? window.btoa(encodeURIComponent(`${currentRoom.id}:${currentRoom.passphrase}`))
    : '';

  const inviteUrl = currentRoom
    ? `${window.location.origin}${window.location.pathname}#room=${encodeURIComponent(
        currentRoom.id
      )}&key=${encodeURIComponent(currentRoom.passphrase)}`
    : '';

  useEffect(() => {
    if (!isOpen || !inviteUrl) return;

    QRCode.toDataURL(inviteUrl, {
      width: 200,
      margin: 1,
      color: {
        dark: '#121214',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation error:', err));
  }, [isOpen, inviteUrl]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenSecondTab = () => {
    window.open(inviteUrl, '_blank');
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    try {
      const decoded = decodeURIComponent(window.atob(joinCodeInput.trim()));
      const [roomId, passphrase] = decoded.split(':');
      if (roomId && passphrase) {
        onJoinByCode(joinCodeInput.trim());
        onClose();
      } else {
        setJoinError('Неверный формат кода');
      }
    } catch {
      setJoinError('Не удалось распознать код приглашения');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141417] border border-[#26262c] rounded-xl w-full max-w-md shadow-2xl text-neutral-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222228] flex items-center justify-between bg-[#111114]">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-white">#### / приглашение</span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#1a1a20] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-[#222228] bg-[#0f0f12] px-6 text-xs font-mono">
          <button
            onClick={() => setActiveTab('invite')}
            className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'invite'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Пригласить
          </button>
          <button
            onClick={() => setActiveTab('join')}
            className={`py-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'join'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Войти по коду
          </button>
        </div>

        {/* Tab 1: Share Invite & QR */}
        {activeTab === 'invite' && (
          <div className="p-6 space-y-4">
            {/* QR Code */}
            <div className="flex flex-col items-center justify-center p-4 bg-[#18181d] border border-[#26262e] rounded-xl">
              {qrDataUrl ? (
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <img src={qrDataUrl} alt="QR Code" className="w-40 h-40 rounded" />
                </div>
              ) : (
                <div className="w-40 h-40 bg-[#1c1c22] rounded flex items-center justify-center text-neutral-500 font-mono text-xs">
                  Генерация QR...
                </div>
              )}
              <span className="text-[11px] text-neutral-400 mt-2 font-mono">
                Отсканируйте камерой телефона
              </span>
            </div>

            {/* Invite Code */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-neutral-300 font-mono">Код приглашения:</span>
                <button
                  onClick={handleCopyCode}
                  className="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer font-mono text-[11px]"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? 'Скопировано!' : 'Скопировать код'}</span>
                </button>
              </div>
              <div
                onClick={handleCopyCode}
                className="p-2.5 bg-[#0f0f12] rounded-lg border border-[#26262c] font-mono text-xs text-neutral-200 break-all select-all cursor-pointer hover:border-neutral-500 transition-colors"
                title="Нажмите для копирования"
              >
                {inviteCode}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <button
                onClick={handleCopyLink}
                className="py-2.5 px-3 bg-[#1d1d23] hover:bg-[#25252c] text-neutral-200 hover:text-white border border-[#2b2b34] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Скопировано' : 'Копия ссылки'}</span>
              </button>

              <button
                onClick={handleOpenSecondTab}
                className="py-2.5 px-3 bg-white text-black hover:bg-neutral-200 font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Тест во 2 вкладке</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Join by code */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit} className="p-6 space-y-4 text-xs">
            {joinError && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300">
                {joinError}
              </div>
            )}

            <div>
              <label className="text-neutral-300 font-mono block mb-1.5">
                Вставьте код приглашения:
              </label>
              <textarea
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                rows={3}
                placeholder="Вставьте полученный код..."
                className="w-full bg-[#0f0f12] border border-[#26262c] rounded-lg p-2.5 text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-neutral-400 resize-none text-xs"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-white text-black hover:bg-neutral-200 font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors font-mono"
            >
              <span>Присоединиться к каналу</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#222228] bg-[#111114] flex items-center justify-end font-mono text-xs">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1d1d23] hover:bg-[#25252c] text-white rounded cursor-pointer transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
