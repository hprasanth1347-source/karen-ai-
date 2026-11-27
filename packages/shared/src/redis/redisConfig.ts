import type { RedisConfig } from './redisTypes.js';

export function loadRedisConfig(envObj: Record<string, string | undefined> = process.env): RedisConfig {
  const env = (envObj.NODE_ENV || 'development').trim();
  const keyPrefix = (envObj.REDIS_KEY_PREFIX || `karen:${env}`).trim().replace(/:+$/, '');
  const restUrl = (envObj.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const restToken = (envObj.UPSTASH_REDIS_REST_TOKEN || '').trim();
  const tcpUrl = (envObj.REDIS_URL || '').trim();
  const tcpHost = (envObj.REDIS_HOST || '').trim();
  const tcpPort = Number(envObj.REDIS_PORT || 6379);
  const tls = (envObj.REDIS_TLS || 'true').toLowerCase() !== 'false';

  return {
    env,
    keyPrefix,
    restUrl,
    restToken,
    tcpUrl,
    tcpHost,
    tcpPort: Number.isFinite(tcpPort) ? tcpPort : 6379,
    tls,
    restConfigured: Boolean(restUrl && restToken && restUrl.startsWith('https://')),
    tcpConfigured: Boolean(tcpUrl || tcpHost),
  };
}
