import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  deriveKeyFromPassphrase,
  encryptText,
  decryptText,
  encryptBuffer,
  decryptBuffer,
  generateECDHKeyPair,
  exportPublicKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './crypto/cipher';
import { ChatMessage, Peer, RoomConfig } from './types/chat';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { InviteModal } from './components/InviteModal';
import { ExeLauncherModal } from './components/ExeLauncherModal';
import { NewRoomModal } from './components/NewRoomModal';
import { InstallModal } from './components/InstallModal';
import { playMessageSound, playSendSound, playPurgeSound } from './utils/sound';

export default function App() {
  // User identity
  const [peerId] = useState<string>(() => {
    const saved = sessionStorage.getItem('ch_peer_id');
    if (saved) return saved;
    const newId = `node_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('ch_peer_id', newId);
    return newId;
  });

  const [userName, setUserName] = useState<string>(() => {
    return sessionStorage.getItem('ch_user_name') || `user_${Math.floor(1000 + Math.random() * 9000)}`;
  });

  const [myPublicKeyBase64, setMyPublicKeyBase64] = useState<string>('');
  const keyPairRef = useRef<CryptoKeyPair | null>(null);

  // Active channels
  const [rooms, setRooms] = useState<RoomConfig[]>(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const hashRoom = params.get('room');
    const hashKey = params.get('key');

    const defaultRooms: RoomConfig[] = [
      {
        id: 'secure-vault',
        name: 'vault',
        passphrase: 'CipherHaven-Master-Key-2026',
      },
      {
        id: 'ops',
        name: 'ops',
        passphrase: 'Alpha-Ops-Encrypted-Key-991',
      },
    ];

    if (hashRoom && hashKey) {
      const customRoom: RoomConfig = {
        id: hashRoom,
        name: hashRoom,
        passphrase: hashKey,
      };
      return [customRoom, ...defaultRooms];
    }

    return defaultRooms;
  });

  const [currentRoomId, setCurrentRoomId] = useState<string>(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    return params.get('room') || 'secure-vault';
  });

  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [peers, setPeers] = useState<Peer[]>([]);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isExeModalOpen, setIsExeModalOpen] = useState(false);
  const [isNewRoomOpen, setIsNewRoomOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [selectedInspectMessage, setSelectedInspectMessage] = useState<ChatMessage | null>(null);

  const [verifiedPeers, setVerifiedPeers] = useState<Set<string>>(new Set());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize ECDH keys on start
  useEffect(() => {
    async function initCrypto() {
      try {
        const pair = await generateECDHKeyPair();
        keyPairRef.current = pair;
        const pubBase64 = await exportPublicKey(pair.publicKey);
        setMyPublicKeyBase64(pubBase64);
      } catch (err) {
        console.error('Failed to init ECDH key pair:', err);
      }
    }
    initCrypto();
  }, []);

  // Listen for PWA beforeinstallprompt on desktop PC
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsNewRoomOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'з')) {
        e.preventDefault();
        handlePanicPurge();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentRoom = rooms.find((r) => r.id === currentRoomId) || rooms[0] || null;

  // Decrypt incoming message
  const decryptIncomingMessage = useCallback(
    async (rawMsg: any, passphrase: string): Promise<ChatMessage> => {
      try {
        const key = await deriveKeyFromPassphrase(passphrase);
        let decryptedText: string | undefined;

        if (rawMsg.ciphertext && rawMsg.iv) {
          decryptedText = await decryptText(rawMsg.ciphertext, rawMsg.iv, key);
        }

        let fileMeta = rawMsg.fileMeta;
        if (fileMeta && fileMeta.fileId) {
          let decryptedName = 'file';
          try {
            decryptedName = await decryptText(fileMeta.encryptedFilename, rawMsg.iv, key);
          } catch {
            decryptedName = 'file';
          }

          try {
            const resp = await fetch(`/api/rooms/${rawMsg.roomId}/files/${fileMeta.fileId}`);
            if (resp.ok) {
              const encryptedBuf = await resp.arrayBuffer();
              const ivBytes = new Uint8Array(base64ToArrayBuffer(rawMsg.iv));
              const decryptedBuf = await decryptBuffer(encryptedBuf, ivBytes, key);
              const blob = new Blob([decryptedBuf], { type: fileMeta.mimeType || 'application/octet-stream' });
              const url = URL.createObjectURL(blob);

              fileMeta = {
                ...fileMeta,
                decryptedName,
                decryptedBlob: blob,
                decryptedUrl: url,
              };
            }
          } catch (fileErr) {
            console.error('File decrypt error:', fileErr);
          }
        }

        return {
          ...rawMsg,
          decryptedText,
          fileMeta,
          decryptionStatus: 'decrypted',
        };
      } catch (err: any) {
        return {
          ...rawMsg,
          decryptionStatus: 'error',
          decryptionError: 'Wrong passphrase or corrupted data',
        };
      }
    },
    []
  );

  // SSE Stream
  useEffect(() => {
    if (!currentRoom) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/rooms/${encodeURIComponent(currentRoom.id)}/events?peerId=${encodeURIComponent(
      peerId
    )}&peerName=${encodeURIComponent(userName)}&publicKey=${encodeURIComponent(myPublicKeyBase64)}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('init', async (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const peersList: Peer[] = (data.peers || []).filter((p: Peer) => p.id !== peerId);
        setPeers(peersList);

        const decryptedMessages: ChatMessage[] = [];
        for (const rawMsg of data.messages || []) {
          const dec = await decryptIncomingMessage(rawMsg, currentRoom.passphrase);
          decryptedMessages.push(dec);
        }

        setMessagesByRoom((prev) => ({
          ...prev,
          [currentRoom.id]: decryptedMessages,
        }));
      } catch (err) {
        console.error('Failed to parse init snapshot:', err);
      }
    });

    es.addEventListener('message', async (e: MessageEvent) => {
      try {
        const rawMsg = JSON.parse(e.data);
        const dec = await decryptIncomingMessage(rawMsg, currentRoom.passphrase);

        setMessagesByRoom((prev) => {
          const currentList = prev[currentRoom.id] || [];
          if (currentList.some((m) => m.id === dec.id)) return prev;
          return {
            ...prev,
            [currentRoom.id]: [...currentList, dec],
          };
        });

        if (rawMsg.senderId !== peerId && !isMuted) {
          playMessageSound();
        }
      } catch (err) {
        console.error('Failed to process message:', err);
      }
    });

    es.addEventListener('peer-joined', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.peer && data.peer.id !== peerId) {
          setPeers((prev) => {
            const filtered = prev.filter((p) => p.id !== data.peer.id);
            return [...filtered, data.peer];
          });
        }
      } catch (err) {}
    });

    es.addEventListener('peer-left', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setPeers((prev) => prev.filter((p) => p.id !== data.peerId));
      } catch (err) {}
    });

    es.addEventListener('room-wiped', () => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [currentRoom.id]: [],
      }));
      playPurgeSound();
    });

    return () => {
      es.close();
    };
  }, [currentRoom?.id, currentRoom?.passphrase, peerId, userName, myPublicKeyBase64, decryptIncomingMessage, isMuted]);

  // Send Encrypted Message (timer removed per user request)
  const handleSendMessage = async (text: string) => {
    if (!currentRoom) return;
    setIsEncrypting(true);

    try {
      const key = await deriveKeyFromPassphrase(currentRoom.passphrase);
      const { ciphertext, iv } = await encryptText(text, key);

      const payload = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        senderId: peerId,
        senderName: userName,
        senderPublicKey: myPublicKeyBase64,
        ciphertext,
        iv,
        type: 'text',
      };

      const resp = await fetch(`/api/rooms/${currentRoom.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (resp.ok && !isMuted) {
        playSendSound();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsEncrypting(false);
    }
  };

  // Send Encrypted File
  const handleSendFile = async (file: File) => {
    if (!currentRoom) return;
    setIsEncrypting(true);

    try {
      const key = await deriveKeyFromPassphrase(currentRoom.passphrase);
      const fileBuffer = await file.arrayBuffer();

      const { encryptedBuffer, iv } = await encryptBuffer(fileBuffer, key);
      const ivBase64 = arrayBufferToBase64(iv);
      const encFilename = await encryptText(file.name, key);

      const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const uploadResp = await fetch(`/api/rooms/${currentRoom.id}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-id': fileId,
        },
        body: encryptedBuffer,
      });

      if (!uploadResp.ok) throw new Error('File upload failed');

      const descPayload = await encryptText(`Файл: ${file.name}`, key);

      const payload = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        senderId: peerId,
        senderName: userName,
        senderPublicKey: myPublicKeyBase64,
        ciphertext: descPayload.ciphertext,
        iv: ivBase64,
        type: 'file',
        fileMeta: {
          fileId,
          encryptedFilename: encFilename.ciphertext,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
        },
      };

      await fetch(`/api/rooms/${currentRoom.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!isMuted) playSendSound();
    } catch (err) {
      console.error('Failed to encrypt/send file:', err);
    } finally {
      setIsEncrypting(false);
    }
  };

  // Send Encrypted Voice Note
  const handleSendVoiceNote = async (audioBlob: Blob, durationSec: number) => {
    if (!currentRoom) return;
    setIsEncrypting(true);

    try {
      const key = await deriveKeyFromPassphrase(currentRoom.passphrase);
      const audioBuffer = await audioBlob.arrayBuffer();

      const { encryptedBuffer, iv } = await encryptBuffer(audioBuffer, key);
      const ivBase64 = arrayBufferToBase64(iv);
      const encFilename = await encryptText(`Аудио (${durationSec}с)`, key);

      const fileId = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await fetch(`/api/rooms/${currentRoom.id}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-id': fileId,
        },
        body: encryptedBuffer,
      });

      const descPayload = await encryptText(`Голосовое (${durationSec}с)`, key);

      const payload = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        senderId: peerId,
        senderName: userName,
        senderPublicKey: myPublicKeyBase64,
        ciphertext: descPayload.ciphertext,
        iv: ivBase64,
        type: 'file',
        fileMeta: {
          fileId,
          encryptedFilename: encFilename.ciphertext,
          size: audioBlob.size,
          mimeType: 'audio/webm',
          isAudioVoice: true,
        },
      };

      await fetch(`/api/rooms/${currentRoom.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!isMuted) playSendSound();
    } catch (err) {
      console.error('Failed to send voice note:', err);
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleClearRoomMessages = async () => {
    if (!currentRoom) return;
    try {
      await fetch(`/api/rooms/${currentRoom.id}/messages`, { method: 'DELETE' });
    } catch (err) {}
  };

  const handlePanicPurge = () => {
    playPurgeSound();
    sessionStorage.clear();
    localStorage.clear();
    keyPairRef.current = null;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setMessagesByRoom({});
    setRooms([
      {
        id: 'secure-vault',
        name: 'vault',
        passphrase: 'CipherHaven-Master-Key-2026',
      },
    ]);
    setCurrentRoomId('secure-vault');
    setIsSettingsOpen(false);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      setIsInstallModalOpen(false);
    }
  };

  const handleUpdateRoomPassphrase = (newPassphrase: string) => {
    if (!currentRoom) return;
    setRooms((prev) =>
      prev.map((r) => (r.id === currentRoom.id ? { ...r, passphrase: newPassphrase } : r))
    );
  };

  // Join channel by base64 invite code
  const handleJoinByCode = (code: string) => {
    try {
      const decoded = decodeURIComponent(window.atob(code.trim()));
      const [roomId, passphrase] = decoded.split(':');
      if (roomId && passphrase) {
        setRooms((prev) => {
          const exists = prev.some((r) => r.id === roomId);
          if (exists) {
            return prev.map((r) => (r.id === roomId ? { ...r, passphrase } : r));
          }
          return [...prev, { id: roomId, name: roomId, passphrase }];
        });
        setCurrentRoomId(roomId);
      }
    } catch (err) {
      console.error('Invalid invite code:', err);
    }
  };

  const currentMessages = currentRoom ? messagesByRoom[currentRoom.id] || [] : [];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f1013] text-neutral-200 font-sans overflow-hidden">
      {/* Top Header */}
      <Header
        currentRoom={currentRoom}
        peerCount={peers.length + 1}
        onOpenSettings={() => {
          setSelectedInspectMessage(null);
          setIsSettingsOpen(true);
        }}
        onOpenExeModal={() => setIsExeModalOpen(true)}
      />

      {/* Main Split: Sidebar + Chat Area */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          rooms={rooms}
          currentRoomId={currentRoomId}
          onSelectRoom={(id) => setCurrentRoomId(id)}
          onOpenNewRoomModal={() => setIsNewRoomOpen(true)}
          onOpenInviteModal={() => setIsInviteModalOpen(true)}
          userName={userName}
          onChangeUserName={(name) => {
            setUserName(name);
            sessionStorage.setItem('ch_user_name', name);
          }}
          peerId={peerId}
          peers={peers}
          onOpenPeerSettings={() => setIsSettingsOpen(true)}
        />

        {currentRoom ? (
          <ChatArea
            room={currentRoom}
            messages={currentMessages}
            currentUserId={peerId}
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onSendVoiceNote={handleSendVoiceNote}
            onInspectMessage={(msg) => {
              setSelectedInspectMessage(msg);
              setIsSettingsOpen(true);
            }}
            onClearRoomMessages={handleClearRoomMessages}
            isEncrypting={isEncrypting}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500 font-mono text-xs">
            Выберите канал
          </div>
        )}
      </div>

      {/* Invite Modal (QR code, invite code, join by code) */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        currentRoom={currentRoom}
        onJoinByCode={handleJoinByCode}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentRoom={currentRoom}
        onUpdatePassphrase={handleUpdateRoomPassphrase}
        myPublicKey={myPublicKeyBase64}
        peers={peers}
        onVerifyPeer={(pId) => {
          setVerifiedPeers((prev) => new Set([...prev, pId]));
        }}
        verifiedPeers={verifiedPeers}
        onPanicPurge={handlePanicPurge}
        onClearRoomMessages={handleClearRoomMessages}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted((prev) => !prev)}
        canInstallPwa={!!deferredPrompt}
        onInstallClick={handleInstallClick}
        selectedMessageForInspection={selectedInspectMessage}
      />

      {/* Create Channel Modal */}
      <NewRoomModal
        isOpen={isNewRoomOpen}
        onClose={() => setIsNewRoomOpen(false)}
        onCreateRoom={(newRoom) => {
          setRooms((prev) => {
            const exists = prev.some((r) => r.id === newRoom.id);
            if (exists) {
              return prev.map((r) => (r.id === newRoom.id ? newRoom : r));
            }
            return [...prev, newRoom];
          });
          setCurrentRoomId(newRoom.id);
        }}
      />

      {/* Desktop App Modal */}
      <InstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onInstallClick={handleInstallClick}
      />

      {/* EXE Launcher Modal */}
      <ExeLauncherModal
        isOpen={isExeModalOpen}
        onClose={() => setIsExeModalOpen(false)}
      />
    </div>
  );
}
