import { loadRedisConfig } from './redisConfig.js';

let circuitOpenUntil = 0;

export async function execUpstashCommand<T = unknown>(
  args: Array<string | number>,
  envObj: Record<string, string | undefined> = process.env
): Promise<{ ok: boolean; result: T | null; error?: string }> {
  const cfg = loadRedisConfig(envObj);
  if (!cfg.restConfigured) {
    return { ok: false, result: null, error: 'UPSTASH_REDIS_REST_URL / TOKEN not configured' };
  }
  if (Date.now() < circuitOpenUntil) {
    return { ok: false, result: null, error: 'Upstash circuit breaker open' };
  }

  try {
    const res = await fetch(cfg.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      circuitOpenUntil = Date.now() + 15_000;
      return { ok: false, result: null, error: `Upstash HTTP ${res.status}` };
    }
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) {
      return { ok: false, result: null, error: json.error };
    }
    return { ok: true, result: (json.result ?? null) as T | null };
  } catch (err) {
    circuitOpenUntil = Date.now() + 15_000;
    return {
      ok: false,
      result: null,
      error: err instanceof Error ? err.message : 'Upstash network timeout',
    };
  }
}

export function resetUpstashCircuitForTests(): void {
  circuitOpenUntil = 0;
}
