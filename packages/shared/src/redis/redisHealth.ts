import { execUpstashCommand } from './redisClient.js';
import { loadRedisConfig } from './redisConfig.js';
import { KAREN_QUEUES, type RedisHealthReport } from './redisTypes.js';

export async function checkRedisHealth(
  envObj: Record<string, string | undefined> = process.env
): Promise<RedisHealthReport> {
  const cfg = loadRedisConfig(envObj);

  if (!cfg.restConfigured && !cfg.tcpConfigured) {
    return {
      status: 'disconnected',
      restConfigured: false,
      tcpConfigured: false,
      bullmqCompatible: false,
      latencyMs: null,
      queues: KAREN_QUEUES,
      error: 'No Upstash REST or TCP Redis credentials configured.',
    };
  }

  if (cfg.restConfigured) {
    const start = Date.now();
    const ping = await execUpstashCommand<string>(['PING'], envObj);
    const latencyMs = Date.now() - start;
    if (ping.ok && ping.result === 'PONG') {
      return {
        status: cfg.tcpConfigured ? 'healthy' : 'degraded',
        restConfigured: true,
        tcpConfigured: cfg.tcpConfigured,
        bullmqCompatible: cfg.tcpConfigured,
        latencyMs,
        queues: KAREN_QUEUES,
        ...(cfg.tcpConfigured ? {} : { error: 'REST-only mode: caching/locks active; TCP Redis required for BullMQ.' }),
      };
    }
    return {
      status: 'degraded',
      restConfigured: true,
      tcpConfigured: cfg.tcpConfigured,
      bullmqCompatible: false,
      latencyMs,
      queues: KAREN_QUEUES,
      error: ping.error || 'Upstash PING failed',
    };
  }

  return {
    status: 'misconfigured',
    restConfigured: false,
    tcpConfigured: cfg.tcpConfigured,
    bullmqCompatible: cfg.tcpConfigured,
    latencyMs: null,
    queues: KAREN_QUEUES,
    error: 'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for REST health checks.',
  };
}
