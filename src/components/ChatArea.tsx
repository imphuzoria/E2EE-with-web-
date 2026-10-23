import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  Download,
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  Volume2,
  Trash2,
  QrCode,
} from 'lucide-react';
import { ChatMessage, RoomConfig } from '../types/chat';
import { VoiceRecorder } from './VoiceRecorder';

interface ChatAreaProps {
  room: RoomConfig;
  messages: ChatMessage[];
  currentUserId: string;
  onSendMessage: (text: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onSendVoiceNote: (audioBlob: Blob, durationSec: number) => Promise<void>;
  onInspectMessage: (msg: ChatMessage) => void;
  onClearRoomMessages: () => void;
  isEncrypting: boolean;
  onOpenSettings: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  room,
  messages,
  currentUserId,
  onSendMessage,
  onSendFile,
  onSendVoiceNote,
  onInspectMessage,
  onClearRoomMessages,
  isEncrypting,
  onOpenSettings,
}) => {
  const [inputText, setInputText] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isEncrypting) return;
    const text = inputText;
    setInputText('');
    await onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onSendFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await onSendFile(file);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string, filename: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-neutral-300" />;
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar'))
      return <FileArchive className="w-4 h-4 text-neutral-300" />;
    if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('python') || filename.endsWith('.ts'))
      return <FileCode className="w-4 h-4 text-neutral-300" />;
    return <FileText className="w-4 h-4 text-neutral-300" />;
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-[#0f1013] relative font-sans ${
        isDragging ? 'ring-1 ring-neutral-500 ring-inset bg-[#14151a]' : ''
      }`}
    >
      {/* Drag overlay notice */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-black/75 flex items-center justify-center pointer-events-none">
          <div className="p-6 bg-[#16171d] border border-neutral-700 rounded-xl flex flex-col items-center gap-2 text-white">
            <div className="text-xs font-mono">Отпустите файл для отправки</div>
          </div>
        </div>
      )}

      {/* Room Toolbar */}
      <div className="h-12 px-6 border-b border-[#23242a] bg-[#141518] flex items-center justify-between gap-4 shrink-0 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">#{room.name || room.id}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClearRoomMessages}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-[#1c1d24] transition-colors cursor-pointer"
            title="Очистить историю канала"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto space-y-2 select-none font-mono">
            <div className="text-neutral-300 font-bold text-sm tracking-wider">####</div>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Канал пуст. Начните писать сообщение ниже.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            const hasError = msg.decryptionStatus === 'error';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
              >
                {/* Meta header */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-mono text-neutral-400">
                  <span className={isMe ? 'text-neutral-300' : 'text-neutral-400'}>
                    {isMe ? 'Вы' : msg.senderName}
                  </span>
                  <span>·</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-xl rounded-lg p-3 text-xs relative ${
                    isMe
                      ? 'bg-[#1e2027] border border-[#2c2e39] text-neutral-100'
                      : 'bg-[#15161b] border border-[#23242c] text-neutral-200'
                  }`}
                >
                  {hasError ? (
                    <div className="space-y-1 text-rose-300 font-mono">
                      <div>Ошибка ключа: не удалось расшифровать</div>
                      <button
                        onClick={onOpenSettings}
                        className="text-[11px] underline hover:text-white cursor-pointer font-sans"
                      >
                        Сменить пароль в настройках
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Text */}
                      {msg.decryptedText && (
                        <div className="whitespace-pre-wrap leading-relaxed select-text font-sans">
                          {msg.decryptedText}
                        </div>
                      )}

                      {/* File attachment */}
                      {msg.fileMeta && (
                        <div className="mt-2 space-y-2">
                          {/* Image preview */}
                          {msg.fileMeta.decryptedUrl && msg.fileMeta.mimeType.startsWith('image/') ? (
                            <div className="relative rounded overflow-hidden border border-[#2b2c36] max-w-sm">
                              <img
                                src={msg.fileMeta.decryptedUrl}
                                alt={msg.fileMeta.decryptedName || 'Файл'}
                                className="max-h-60 w-auto object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setLightboxImage(msg.fileMeta?.decryptedUrl || null)}
                              />
                            </div>
                          ) : null}

                          {/* Voice Note Player */}
                          {msg.fileMeta.decryptedUrl && (msg.fileMeta.isAudioVoice || msg.fileMeta.mimeType.startsWith('audio/')) ? (
                            <div className="p-2 rounded bg-[#101115] border border-[#24252e] flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-[#202129] text-neutral-300 flex items-center justify-center shrink-0">
                                <Volume2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0 font-mono">
                                <div className="text-[11px] text-neutral-300 truncate">
                                  {msg.fileMeta.decryptedName || 'Аудио'}
                                </div>
                                <audio src={msg.fileMeta.decryptedUrl} controls className="h-6 w-full mt-1" />
                              </div>
                            </div>
                          ) : null}

                          {/* Generic file */}
                          {!(msg.fileMeta.mimeType.startsWith('image/')) && !(msg.fileMeta.mimeType.startsWith('audio/')) && (
                            <div className="p-2.5 rounded bg-[#101115] border border-[#24252e] flex items-center justify-between gap-3 font-mono">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1.5 rounded bg-[#1d1e25]">
                                  {getFileIcon(msg.fileMeta.mimeType, msg.fileMeta.decryptedName || '')}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-neutral-200 truncate text-xs">
                                    {msg.fileMeta.decryptedName || 'file'}
                                  </div>
                                  <div className="text-[10px] text-neutral-400">
                                    {formatFileSize(msg.fileMeta.size)}
                                  </div>
                                </div>
                              </div>

                              {msg.fileMeta.decryptedUrl && (
                                <a
                                  href={msg.fileMeta.decryptedUrl}
                                  download={msg.fileMeta.decryptedName || 'file'}
                                  className="p-1.5 rounded bg-[#202129] hover:bg-[#2b2c36] text-neutral-200 hover:text-white transition-colors cursor-pointer shrink-0"
                                  title="Скачать"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-[#23242a] bg-[#141518] shrink-0">
        {isVoiceRecording ? (
          <VoiceRecorder
            onSendVoiceNote={onSendVoiceNote}
            onCancel={() => setIsVoiceRecording(false)}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex items-center gap-2 bg-[#101115] border border-[#292a34] rounded-lg p-2 focus-within:border-neutral-400 transition-colors">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isEncrypting}
                className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#1e1f27] transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                title="Прикрепить файл"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsVoiceRecording(true)}
                disabled={isEncrypting}
                className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#1e1f27] transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                title="Записать голосовое сообщение"
              >
                <Mic className="w-4 h-4" />
              </button>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Сообщение..."
                rows={1}
                className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none resize-none max-h-32 min-h-[1.75rem] py-1 px-1 font-sans"
              />

              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isEncrypting}
                className="p-1.5 rounded bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
                title="Отправить"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Просмотр"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded"
          />
        </div>
      )}
    </div>
  );
};
