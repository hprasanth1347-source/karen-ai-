import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

test('Security: AES-256-GCM encryption and decryption round-trip', () => {
  const algorithm = 'aes-256-gcm';
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const plaintext = 'Aadhaar: 1234-5678-9012; Bank: 9876543210';

  // Encrypt
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Decrypt
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  assert.strictEqual(decrypted, plaintext, 'Decrypted text must match plaintext');
});
