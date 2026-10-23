import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  KeyRound,
  Cpu,
  Monitor,
  Volume2,
  VolumeX,
  Trash2,
  ShieldAlert,
  Copy,
  Check,
  QrCode,
  CheckCircle2,
  Lock,
  RefreshCw,
  AlertTriangle,
  Download,
  Key,
  Terminal,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Peer, RoomConfig, ChatMessage } from '../types/chat';
import {
  encryptText,
  decryptText,
  deriveKeyFromPassphrase,
  calculateSafetyNumbers,
  sha256Hex,
} from '../crypto/cipher';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoom: RoomConfig | null;
  onUpdatePassphrase: (newPass: string) => void;
  myPublicKey: string;
  peers: Peer[];
  onVerifyPeer: (peerId: string) => void;
  verifiedPeers: Set<string>;
  onPanicPurge: () => void;
  onClearRoomMessages: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  canInstallPwa: boolean;
  onInstallClick: () => void;
  selectedMessageForInspection?: ChatMessage | null;
}

type TabType = 'crypto' | 'keys' | 'safety' | 'desktop' | 'privacy';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentRoom,
  onUpdatePassphrase,
  myPublicKey,
  peers,
  onVerifyPeer,
  verifiedPeers,
  onPanicPurge,
  onClearRoomMessages,
  isMuted,
  onToggleMute,
  canInstallPwa,
  onInstallClick,
  selectedMessageForInspection,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('crypto');
  const [passphraseInput, setPassphraseInput] = useState(currentRoom?.passphrase || '');
  const [savedPass, setSavedPass] = useState(false);

  // Safety numbers state
  const [safetyNumbers, setSafetyNumbers] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copiedSafety, setCopiedSafety] = useState(false);
  const [copiedPubKey, setCopiedPubKey] = useState(false);

  // Live Crypto Sandbox state
  const [testPlaintext, setTestPlaintext] = useState('Тестовое секретное сообщение для проверки AES-256');
  const [testCiphertext, setTestCiphertext] = useState('');
  const [testIv, setTestIv] = useState('');
  const [testDecrypted, setTestDecrypted] = useState('');
  const [tamperError, setTamperError] = useState<string | null>(null);

  useEffect(() => {
    if (currentRoom) {
      setPassphraseInput(currentRoom.passphrase);
    }
  }, [currentRoom]);

  // Run live crypto test
  const runCryptoTest = async () => {
    try {
      setTamperError(null);
      const key = await deriveKeyFromPassphrase(currentRoom?.passphrase || 'default-salt');
      const { ciphertext, iv } = await encryptText(testPlaintext, key);
      setTestCiphertext(ciphertext);
      setTestIv(iv);

      const dec = await decryptText(ciphertext, iv, key);
      setTestDecrypted(dec);
    } catch (err: any) {
      setTamperError(err.message || 'Ошибка криптографии');
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'crypto') {
      runCryptoTest();
    }
  }, [isOpen, activeTab, testPlaintext, currentRoom?.passphrase]);

  // Generate Safety Numbers for primary peer or room
  useEffect(() => {
    if (!isOpen || activeTab !== 'safety') return;

    async function loadSafety() {
      const otherKey = peers[0]?.publicKey || currentRoom?.passphrase || 'peer-key';
      const nums = await calculateSafetyNumbers(myPublicKey || 'MyNode', otherKey);
      setSafetyNumbers(nums);

      try {
        const qr = await QRCode.toDataURL(nums, {
          width: 180,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrCodeDataUrl(qr);
      } catch (err) {}
    }

    loadSafety();
  }, [isOpen, activeTab, myPublicKey, peers, currentRoom]);

  if (!isOpen) return null;

  const handleSavePassphrase = (e: React.FormEvent) => {
    e.preventDefault();
    if (passphraseInput.trim()) {
      onUpdatePassphrase(passphraseInput.trim());
      setSavedPass(true);
      setTimeout(() => setSavedPass(false), 2000);
    }
  };

  const handleTamperWithCiphertext = async () => {
    try {
      if (!testCiphertext) return;
      const tampered = (testCiphertext[0] === 'X' ? 'Y' : 'X') + testCiphertext.slice(1);
      setTestCiphertext(tampered);

      const key = await deriveKeyFromPassphrase(currentRoom?.passphrase || 'default-salt');
      await decryptText(tampered, testIv, key);
      setTestDecrypted('Не должно было расшифроваться');
    } catch (err) {
      setTamperError('Тег GCM отвергнут: WebCrypto заблокировал поддельный шифротекст.');
      setTestDecrypted('');
    }
  };

  const handleCopySafety = () => {
    navigator.clipboard.writeText(safetyNumbers.replace(/\n/g, ' '));
    setCopiedSafety(true);
    setTimeout(() => setCopiedSafety(false), 2000);
  };

  const handleCopyPubKey = () => {
    navigator.clipboard.writeText(myPublicKey);
    setCopiedPubKey(true);
    setTimeout(() => setCopiedPubKey(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141417] border border-[#272830] rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl text-neutral-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#23242a] flex items-center justify-between bg-[#101114]">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-sm text-white tracking-wider">
              #### / настройки
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1E1E1E] bg-[#050505] px-6 gap-2 text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('crypto')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'crypto'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Шифрование
          </button>
          <button
            onClick={() => setActiveTab('safety')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'safety'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Коды безопасности
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'keys'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Ключи и комната
          </button>
          <button
            onClick={() => setActiveTab('desktop')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'desktop'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            ПК и звук
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Приватность
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-neutral-300">
          {/* TAB 1: CRYPTOGRAPHY */}
          {activeTab === 'crypto' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-[#111111] border border-[#222222] rounded-lg">
                  <div className="text-[10px] text-neutral-400 font-mono uppercase mb-1">Шифр</div>
                  <div className="text-sm font-mono font-bold text-neutral-100">AES-256-GCM</div>
                  <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Ключ 256-bit · Тег 128-bit</div>
                </div>

                <div className="p-3 bg-[#111111] border border-[#222222] rounded-lg">
                  <div className="text-[10px] text-neutral-400 font-mono uppercase mb-1">Деривация (KDF)</div>
                  <div className="text-sm font-mono font-bold text-neutral-100">PBKDF2-SHA256</div>
                  <div className="text-[10px] text-neutral-400 font-mono mt-0.5">100 000 итераций</div>
                </div>

                <div className="p-3 bg-[#111111] border border-[#222222] rounded-lg">
                  <div className="text-[10px] text-neutral-400 font-mono uppercase mb-1">Вектор (IV)</div>
                  <div className="text-sm font-mono font-bold text-neutral-100">96-bit Nonce</div>
                  <div className="text-[10px] text-neutral-400 font-mono mt-0.5">crypto.getRandomValues</div>
                </div>
              </div>

              {/* Inspection of selected message if provided */}
              {selectedMessageForInspection && (
                <div className="p-4 bg-[#111111] border border-[#222222] rounded-lg space-y-2 font-mono">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>Инспекция сообщения {selectedMessageForInspection.id.slice(0, 10)}...</span>
                    <span className="text-[10px] text-neutral-400">
                      {selectedMessageForInspection.decryptionStatus === 'decrypted' ? 'Расшифровано' : 'Зашифровано'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-0.5">IV (Base64):</span>
                    <div className="p-1.5 bg-black rounded border border-[#222222] text-neutral-300 break-all select-all text-[11px]">
                      {selectedMessageForInspection.iv}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-0.5">Шифротекст:</span>
                    <div className="p-1.5 bg-black rounded border border-[#222222] text-neutral-400 break-all select-all text-[11px] max-h-20 overflow-y-auto">
                      {selectedMessageForInspection.ciphertext}
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Sandbox */}
              <div className="p-4 bg-[#111111] border border-[#222222] rounded-lg space-y-3 font-mono">
                <div className="flex items-center justify-between font-sans">
                  <span className="font-semibold text-white text-xs">Интерактивный тест шифрования</span>
                  <button
                    onClick={runCryptoTest}
                    className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Сброс</span>
                  </button>
                </div>

                <div>
                  <input
                    type="text"
                    value={testPlaintext}
                    onChange={(e) => setTestPlaintext(e.target.value)}
                    className="w-full bg-black border border-[#2b2b2b] rounded p-2 text-xs text-white focus:outline-none focus:border-neutral-500 font-sans"
                    placeholder="Введите текст для шифрования..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                    <span>Шифротекст AES-256-GCM:</span>
                    <button
                      onClick={handleTamperWithCiphertext}
                      className="text-neutral-400 hover:text-white underline cursor-pointer"
                    >
                      Имитировать изменение 1 байта
                    </button>
                  </div>
                  <div className="p-2 bg-black rounded border border-[#222222] text-neutral-400 break-all text-[11px]">
                    {testCiphertext}
                  </div>
                </div>

                {tamperError ? (
                  <div className="p-2.5 bg-rose-950/30 border border-rose-900/50 rounded text-rose-300 text-xs font-sans">
                    {tamperError}
                  </div>
                ) : (
                  <div className="p-2.5 bg-[#171717] border border-[#2b2b2b] rounded text-neutral-200 text-xs font-sans flex items-center justify-between">
                    <span>Расшифровано: <strong>{testDecrypted}</strong></span>
                    <span className="text-[10px] font-mono text-neutral-400">GCM Tag Valid</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SAFETY NUMBERS */}
          {activeTab === 'safety' && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                Сверьте 60-значный отпечаток или покажите QR-код собеседнику. Совпадение цифр гарантирует защиту от перехвата и атак Man-In-The-Middle.
              </p>

              <div className="p-4 bg-[#111111] border border-[#222222] rounded-lg flex flex-col items-center gap-4">
                {qrCodeDataUrl && (
                  <div className="p-2 bg-white rounded">
                    <img src={qrCodeDataUrl} alt="Safety QR Code" className="w-36 h-36" />
                  </div>
                )}

                <div className="w-full">
                  <div className="p-3 bg-black rounded border border-[#222222] font-mono text-xs text-center tracking-widest text-neutral-200 select-all leading-loose whitespace-pre">
                    {safetyNumbers || 'Генерация отпечатка...'}
                  </div>
                  <button
                    onClick={handleCopySafety}
                    className="mt-2 mx-auto text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                  >
                    {copiedSafety ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSafety ? 'Скопировано!' : 'Скопировать код'}</span>
                  </button>
                </div>
              </div>

              {peers.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-neutral-400 uppercase">Собеседники:</span>
                  {peers.map((p) => {
                    const isVer = verifiedPeers.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-2.5 bg-[#111111] border border-[#222222] rounded"
                      >
                        <span className="font-medium text-white">{p.name}</span>
                        <button
                          onClick={() => onVerifyPeer(p.id)}
                          className={`px-3 py-1 rounded text-xs cursor-pointer ${
                            isVer
                              ? 'bg-neutral-800 text-white'
                              : 'bg-white text-black hover:bg-neutral-200 font-medium'
                          }`}
                        >
                          {isVer ? 'Верифицирован ✓' : 'Отметить как проверенного'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: KEYS & ROOM */}
          {activeTab === 'keys' && (
            <div className="space-y-5">
              <form onSubmit={handleSavePassphrase} className="space-y-3 font-sans">
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    Секретный пароль комнаты (PBKDF2 → AES-256):
                  </label>
                  <input
                    type="text"
                    value={passphraseInput}
                    onChange={(e) => setPassphraseInput(e.target.value)}
                    className="w-full bg-black border border-[#2b2b2b] rounded p-2 text-xs text-white font-mono focus:outline-none focus:border-neutral-500"
                    placeholder="Введите пароль..."
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Ключ рассчитывается на клиенте и никогда не передается на сервер.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded font-semibold text-xs cursor-pointer transition-colors"
                >
                  {savedPass ? 'Сохранено!' : 'Применить ключ'}
                </button>
              </form>

              <div className="space-y-2 pt-2 border-t border-[#1E1E1E]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white font-sans">
                    Ваш открытый ключ ECDH P-256:
                  </span>
                  <button
                    onClick={handleCopyPubKey}
                    className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer font-sans"
                  >
                    {copiedPubKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPubKey ? 'Скопировано!' : 'Скопировать'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-black rounded border border-[#222222] font-mono text-[10px] text-neutral-400 break-all select-all max-h-24 overflow-y-auto">
                  {myPublicKey}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DESKTOP & SOUND */}
          {activeTab === 'desktop' && (
            <div className="space-y-5 font-sans">
              <div className="p-4 bg-[#111111] border border-[#222222] rounded-lg space-y-2">
                <div className="font-semibold text-white text-xs">Запуск на ПК (Desktop App)</div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Приложение работает через веб, но запускается на компьютере в отдельном изолированном окне с ярлыком на рабочем столе.
                </p>
                {canInstallPwa && (
                  <button
                    onClick={onInstallClick}
                    className="mt-2 px-4 py-2 bg-white text-black hover:bg-neutral-200 font-semibold text-xs rounded cursor-pointer transition-colors flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Установить #### на ПК</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-[#111111] border border-[#222222] rounded-lg">
                <div>
                  <div className="text-xs font-semibold text-white">Звуковые оповещения</div>
                  <div className="text-[11px] text-neutral-400">Синтез аудиосигнала через Web Audio API</div>
                </div>
                <button
                  onClick={onToggleMute}
                  className="px-3 py-1.5 bg-[#1f1f1f] hover:bg-[#2b2b2b] text-neutral-200 rounded text-xs cursor-pointer font-mono"
                >
                  {isMuted ? 'Выключен' : 'Включен'}
                </button>
              </div>

              <div className="space-y-1.5 text-[11px] text-neutral-400 font-mono">
                <div className="text-white font-sans text-xs font-semibold mb-1">Горячие клавиши ПК:</div>
                <div className="flex justify-between border-b border-[#1E1E1E] py-1">
                  <span>Отправка сообщения</span>
                  <span className="text-neutral-300">Enter</span>
                </div>
                <div className="flex justify-between border-b border-[#1E1E1E] py-1">
                  <span>Перенос строки</span>
                  <span className="text-neutral-300">Shift + Enter</span>
                </div>
                <div className="flex justify-between border-b border-[#1E1E1E] py-1">
                  <span>Создать / сменить комнату</span>
                  <span className="text-neutral-300">Ctrl + K</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Экстренное стирание</span>
                  <span className="text-neutral-300">Ctrl + Shift + P</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRIVACY & PURGE */}
          {activeTab === 'privacy' && (
            <div className="space-y-4 font-sans">
              <div className="p-4 bg-[#111111] border border-[#222222] rounded-lg space-y-2">
                <div className="text-xs font-semibold text-white">Очистить сообщения в комнате</div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Удалит все сообщения текущего канала с сервера реле.
                </p>
                <button
                  onClick={onClearRoomMessages}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs cursor-pointer font-medium"
                >
                  Очистить историю канала
                </button>
              </div>

              <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-lg space-y-3">
                <div className="text-xs font-bold text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Экстренное уничтожение ключей (Panic Wipe)</span>
                </div>
                <p className="text-xs text-rose-400/80 leading-relaxed">
                  Мгновенно обнуляет все криптографические ключи AES-256 и пару ECDH в оперативной памяти браузера, закрывает все соединения и очищает локальное хранилище.
                </p>
                <button
                  onClick={onPanicPurge}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-xs cursor-pointer shadow-md"
                >
                  Стереть все ключи и выйти
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#23242a] bg-[#101114] flex items-center justify-between text-xs text-neutral-400 font-mono">
          <span>Web Crypto API · AES-256</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1d1e24] hover:bg-[#272832] text-white rounded cursor-pointer transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
