/**
 * SecureMessenger Cryptographic Primitives
 * Industrial-strength Web Crypto API implementation:
 * - AES-256-GCM (Authenticated Encryption with Associated Data)
 * - PBKDF2-HMAC-SHA256 (210,000 iterations, per-room salt)
 * - ECDH (NIST P-256 Elliptic Curve Diffie-Hellman key agreement)
 * - SHA-256 Safety Fingerprints & Verification Codes
 *
 * All operations run in the browser. The server never sees keys or plaintext.
 */

export const PBKDF2_ITERATIONS = 210000;
export const KDF_SALT_VERSION = 'SecureMessenger|v1|salt|';

export interface EncryptedPayload {
  ciphertext: string; // Base64 ciphertext + 128-bit GCM auth tag
  iv: string;         // Base64 96-bit initialization vector
}

export interface KeyPairExport {
  publicKeyJwk: JsonWebKey;
  publicKeyBase64: string;
}

// Convert ArrayBuffer to Base64 (chunked to avoid call-stack overflows on large buffers)
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[]
    );
  }
  return window.btoa(binary);
}

// Convert Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate cryptographically secure random bytes
export function getRandomBytes(length: number): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

// Derive a 256-bit AES-GCM CryptoKey from a passphrase using PBKDF2
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array = new Uint8Array([73, 219, 102, 14, 88, 129, 44, 211, 95, 33, 18, 77, 240, 6, 182, 90]),
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive the room key.
 *
 * A unique, deterministic salt is derived from the room id, so every room has
 * its own PBKDF2 salt while all members of the same room still derive the same
 * key. This prevents precomputed (rainbow table) attacks that a single global
 * hard-coded salt would allow.
 */
export async function deriveRoomKey(
  passphrase: string,
  roomId: string,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    enc.encode(`${KDF_SALT_VERSION}${roomId}`)
  );
  const salt = new Uint8Array(digest).slice(0, 16);
  return deriveKeyFromPassphrase(passphrase, salt, iterations);
}

// Encrypt plaintext string using AES-256-GCM with fresh 96-bit IV
export async function encryptText(text: string, key: CryptoKey): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const iv = getRandomBytes(12); // 96 bits standard for AES-GCM

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
      tagLength: 128, // 16 bytes authentication tag
    },
    key,
    data
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
  };
}

// Decrypt AES-256-GCM ciphertext back to plaintext string
export async function decryptText(
  ciphertextBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> {
  try {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv) as any,
        tagLength: 128,
      },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    throw new Error('Decryption failed: invalid key or corrupted/manipulated ciphertext');
  }
}

// Encrypt arbitrary binary ArrayBuffer (Files, Audio, etc.)
export async function encryptBuffer(
  buffer: ArrayBuffer,
  key: CryptoKey
): Promise<{ encryptedBuffer: ArrayBuffer; iv: Uint8Array }> {
  const iv = getRandomBytes(12);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
      tagLength: 128,
    },
    key,
    buffer
  );

  return { encryptedBuffer, iv };
}

// Decrypt arbitrary binary ArrayBuffer
export async function decryptBuffer(
  encryptedBuffer: ArrayBuffer,
  ivBytes: Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  try {
    return await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as any,
        tagLength: 128,
      },
      key,
      encryptedBuffer
    );
  } catch (err) {
    throw new Error('File decryption failed: authenticity tag mismatch or wrong key');
  }
}

// Generate ECDH Key Pair (P-256) for asymmetric key exchange
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Export Public Key to Base64 string for transmission over network
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const spkiBuffer = await window.crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(spkiBuffer);
}

// Import peer's Public Key from Base64
export async function importPublicKey(base64Spki: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64Spki);
  return window.crypto.subtle.importKey(
    'spki',
    buffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

// Derive AES-256-GCM key from local private key and peer's public key
export async function deriveECDHSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

// Calculate Safety Numbers (60-digit formatted fingerprint) like Signal
export async function calculateSafetyNumbers(keyA: string, keyB: string): Promise<string> {
  const sorted = [keyA, keyB].sort().join(':');
  const enc = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(sorted));
  const hashBytes = new Uint8Array(hashBuffer);

  // Convert first 30 bytes into 12 blocks of 5 digits
  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const val = (hashBytes[i * 2] << 8) | hashBytes[i * 2 + 1];
    const fiveDigits = (val % 100000).toString().padStart(5, '0');
    blocks.push(fiveDigits);
  }

  // Format as 2 rows of 6 blocks
  return blocks.slice(0, 6).join(' ') + '\n' + blocks.slice(6, 12).join(' ');
}

// Compute SHA-256 hash of any string or buffer in hex
export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await window.crypto.subtle.digest('SHA-256', buffer as any);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate a cryptographically secure, URL-safe identifier
export function randomId(prefix = 'id'): string {
  const bytes = getRandomBytes(12);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${hex}`;
}

// Generate a strong random passphrase (no modulo bias)
export function generatePassphrase(length = 32): string {
  const alphabet =
    'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+';
  const max = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    const bytes = getRandomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < max) {
        out += alphabet[bytes[i] % alphabet.length];
      }
    }
  }
  return out;
}
