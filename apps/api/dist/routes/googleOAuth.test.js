import assert from 'node:assert/strict';
import test from 'node:test';
import { verifySignedOAuthState } from './googleDrive.js';
import { decrypt, decryptJson, encryptJson } from '../utils/crypto.js';
test('Phase 1 Crypto: v1 AES-256-GCM round-trip and tamper detection', () => {
    const payload = { accessToken: 'ya29.abc', refreshToken: '1//xyz', expiresAt: 9999999999 };
    const encrypted = encryptJson(payload);
    assert.ok(encrypted.startsWith('v1:'), 'Ciphertext must use v1: prefix');
    const decrypted = decryptJson(encrypted);
    assert.deepEqual(decrypted, payload);
    // Tamper check
    const parts = encrypted.split(':');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('aa') ? 'bb' : 'aa');
    assert.throws(() => decrypt(parts.join(':')));
});
test('Phase 1 OAuth State: rejects tampered or malformed state', () => {
    assert.equal(verifySignedOAuthState(''), null);
    assert.equal(verifySignedOAuthState('invalid.state'), null);
    assert.equal(verifySignedOAuthState('tampered'), null);
});
