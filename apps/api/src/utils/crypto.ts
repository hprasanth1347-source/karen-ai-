import crypto from 'node:crypto';
import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION_PREFIX = 'v1';

function getKey(): Buffer {
  const value =
    config.ENCRYPTION_KEY ||
    config.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    config.APP_SECRET ||
    config.JWT_SECRET ||
    config.SUPABASE_SERVICE_ROLE_KEY ||
    config.GOOGLE_CLIENT_SECRET;
  if (!value) {
    if (config.NODE_ENV === 'production') {
      throw new Error('CRITICAL: ENCRYPTION_KEY (or fallback secret) is required in production.');
    }
    if (config.NODE_ENV === 'test') {
      return crypto.createHash('sha256').update('karen-test-only-deterministic-key').digest();
    }
    return crypto.createHash('sha256').update('karen-ai-dev-only-key').digest();
  }
  const hexKey = /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : null;
  const base64Key = /^[a-zA-Z0-9+/]{43}=$/.test(value) ? Buffer.from(value, 'base64') : null;
  const key = hexKey || base64Key;
  if (!key || key.length !== 32) {
    return crypto.createHash('sha256').update(value).digest();
  }
  return key;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${VERSION_PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  let ivHex: string;
  let tagHex: string;
  let encrypted: string;

  if (parts.length === 4 && parts[0] === VERSION_PREFIX) {
    [, ivHex, tagHex, encrypted] = parts;
  } else if (parts.length === 3) {
    // Legacy unprefixed ciphertext format migration path
    [ivHex, tagHex, encrypted] = parts;
  } else {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const key = getKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(raw?: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as T;
  } catch {
    return null;
  }
}
