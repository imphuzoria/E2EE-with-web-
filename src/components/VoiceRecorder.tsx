import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoiceNote: (audioBlob: Blob, durationSec: number) => Promise<void>;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendVoiceNote,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSend = async () => {
    if (!recordedBlob) return;
    setIsSending(true);
    try {
      await onSendVoiceNote(recordedBlob, duration);
      cleanup();
      onCancel();
    } catch (err) {
      console.error('Failed to send voice note:', err);
      setIsSending(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-[#0d0d0d] border border-[#222222] p-2 rounded-lg text-xs w-full font-mono">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white font-semibold">{formatTime(duration)}</span>
      </div>

      <div className="flex-1 px-2">
        {audioUrl ? (
          <audio src={audioUrl} controls className="h-6 w-full max-w-xs" />
        ) : (
          <span className="text-[11px] text-neutral-400 font-sans">
            Запись голоса...
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white cursor-pointer transition-colors"
            title="Остановить"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={isSending || !recordedBlob}
            className="px-3 py-1.5 rounded bg-white text-black hover:bg-neutral-200 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Отправить</span>
          </button>
        )}

        <button
          onClick={() => {
            cleanup();
            onCancel();
          }}
          disabled={isSending}
          className="p-1.5 rounded text-neutral-400 hover:text-white cursor-pointer transition-colors"
          title="Отмена"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
