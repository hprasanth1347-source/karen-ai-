import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../apps/api/dist/utils/appError.js';
import { validateProductionConfig } from '../../apps/api/dist/config/env.js';

test('AppError maps error codes to expected HTTP status codes', () => {
  const errAuth = new AppError('AUTH_REQUIRED', 'Login required');
  assert.equal(errAuth.statusCode, 401);
  assert.equal(errAuth.code, 'AUTH_REQUIRED');

  const errForbidden = new AppError('FORBIDDEN', 'Owner only');
  assert.equal(errForbidden.statusCode, 403);

  const errGoogle = new AppError('GOOGLE_NOT_CONNECTED', 'Connect Google');
  assert.equal(errGoogle.statusCode, 409);

  const errRate = new AppError('RATE_LIMITED', 'Slow down');
  assert.equal(errRate.statusCode, 429);
});

test('validateProductionConfig fails closed in production when secrets are missing', () => {
  assert.throws(
    () => validateProductionConfig({ NODE_ENV: 'production' }),
    /CRITICAL PRODUCTION CONFIG MISSING/
  );
  assert.doesNotThrow(() => validateProductionConfig({ NODE_ENV: 'test' }));
  assert.doesNotThrow(() =>
    validateProductionConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-123456',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      OWNER_USER_ID: '00000000-0000-0000-0000-000000000001',
    })
  );
});
