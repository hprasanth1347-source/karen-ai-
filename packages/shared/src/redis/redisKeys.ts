export type RedisDomain =
  | 'cache'
  | 'sessions'
  | 'ai'
  | 'instagram'
  | 'telegram'
  | 'newspaper'
  | 'google'
  | 'notifications'
  | 'locks'
  | 'ratelimit';

export function buildRedisKey(
  prefix: string,
  domain: RedisDomain,
  scopeId: string,
  resource: string
): string {
  const cleanPrefix = prefix.replace(/:+$/, '');
  const cleanScope = scopeId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleanRes = resource.replace(/[^a-zA-Z0-9._:-]/g, '_');
  return `${cleanPrefix}:${domain}:${cleanScope}:${cleanRes}`;
}
