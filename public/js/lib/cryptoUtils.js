/**
 * cryptoUtils.js
 * AES-256-GCM encryption/decryption for file attachments using the Web Crypto API.
 *
 * Blob format (all bytes):
 *   salt (16) | iv (12) | ciphertext (n) + GCM auth tag (16)
 *
 * Key derivation: PBKDF2(password, salt, 200_000 iter, SHA-256) → AES-256-GCM key
 */

const SALT_LEN   = 16;
const IV_LEN     = 12;
const ITERATIONS = 200_000;

async function _deriveKey(password, salt) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt an ArrayBuffer with a password.
 * @returns {Uint8Array}  salt + iv + ciphertext
 */
export async function encryptFileBuffer(buffer, password) {
  const salt   = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv     = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key    = await _deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);

  const out = new Uint8Array(SALT_LEN + IV_LEN + cipher.byteLength);
  out.set(salt, 0);
  out.set(iv, SALT_LEN);
  out.set(new Uint8Array(cipher), SALT_LEN + IV_LEN);
  return out;
}

/**
 * Decrypt a Uint8Array that was produced by encryptFileBuffer.
 * @throws {Error} if the password is wrong or the blob is corrupted.
 * @returns {ArrayBuffer}  the original file bytes
 */
export async function decryptFileBuffer(encBytes, password) {
  if (encBytes.length < SALT_LEN + IV_LEN + 1) throw new Error('File too short');

  const salt = encBytes.slice(0, SALT_LEN);
  const iv   = encBytes.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const data = encBytes.slice(SALT_LEN + IV_LEN);
  const key  = await _deriveKey(password, salt);

  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    throw new Error('Wrong passphrase or corrupted file');
  }
}
