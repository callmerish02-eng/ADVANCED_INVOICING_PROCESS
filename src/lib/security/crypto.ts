/**
 * AES-256-CBC encryption utilities.
 *
 * Used for encrypting sensitive fields at rest (audit logs, etc.)
 * Key MUST be a 32-byte hex string (256 bits) supplied via ENCRYPTION_KEY env var.
 *
 * Wire format: base64(iv) : base64(ciphertext)
 */
import CryptoJS from 'crypto-js';

const KEY_ENV = process.env.ENCRYPTION_KEY;

function getKey(): CryptoJS.lib.WordArray {
  if (!KEY_ENV || KEY_ENV.length !== 64) {
    // Fail-fast in dev; in prod we still want a clear error.
    throw new Error(
      'ENCRYPTION_KEY must be a 64-char hex string (32 bytes / 256 bits). ' +
        'Generate with: openssl rand -hex 32',
    );
  }
  return CryptoJS.enc.Hex.parse(KEY_ENV);
}

export function encryptString(plaintext: string): string {
  if (plaintext === null || plaintext === undefined) return '';
  const key = getKey();
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return `${CryptoJS.enc.Base64.stringify(iv)}:${encrypted.toString()}`;
}

export function decryptString(payload: string): string {
  if (!payload || !payload.includes(':')) return '';
  const key = getKey();
  const [ivB64, ctB64] = payload.split(':');
  const iv = CryptoJS.enc.Base64.parse(ivB64);
  const decrypted = CryptoJS.AES.decrypt(ctB64, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  try {
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    return '';
  }
}

/**
 * Constant-time string compare to prevent timing attacks on hashes/tokens.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
