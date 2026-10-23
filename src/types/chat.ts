export interface MessageFileMeta {
  fileId: string;
  encryptedFilename: string;
  size: number;
  mimeType: string;
  decryptedName?: string;
  decryptedBlob?: Blob;
  decryptedUrl?: string;
  isAudioVoice?: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderPublicKey?: string;
  timestamp: number;
  iv: string; // Base64
  ciphertext: string; // Base64
  salt?: string;
  type: 'text' | 'file' | 'system';
  fileMeta?: MessageFileMeta;
  decryptedText?: string;
  decryptionStatus: 'pending' | 'decrypted' | 'error';
  decryptionError?: string;
  expiresAt?: number | null;
  burnProgress?: number; // 0 to 100%
  reactions?: Record<string, string[]>;
}

export interface Peer {
  id: string;
  name: string;
  publicKey?: string;
  lastSeen: number;
  verified?: boolean;
}

export interface RoomConfig {
  id: string;
  name: string;
  passphrase: string;
  isDirect?: boolean;
  peerId?: string;
  lastMessagePreview?: string;
  lastActivity?: number;
  unreadCount?: number;
}

export type EphemeralOption = 0 | 30 | 300 | 3600 | 86400;

export interface CryptoAuditInfo {
  algorithm: string;
  keyLength: number;
  tagLength: number;
  kdf: string;
  kdfIterations: number;
  activeIv: string;
  authTag: string;
  rawCiphertext: string;
  sha256Proof: string;
  decryptedSample?: string;
}
