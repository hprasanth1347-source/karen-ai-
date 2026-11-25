// Karen Ultra — Shared Utilities

// ─── Date / Time ──────────────────────────────────────────────────────────────

/**
 * Format a date string or Date object in Indian Standard Time (IST / Asia/Kolkata).
 * Returns a localised, human-readable string.
 */
export function formatDate(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';

  const defaults: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  return new Intl.DateTimeFormat('en-IN', { ...defaults, ...options }).format(d);
}

/**
 * Format a date as a relative time string (e.g. "2 hours ago").
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';

  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(d, { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Returns the current timestamp as an ISO 8601 string.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

// ─── String Utilities ─────────────────────────────────────────────────────────

/**
 * Convert a string to a URL-friendly slug.
 * Example: "Hello World!" -> "hello-world"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate a string to a maximum length, appending an ellipsis if needed.
 */
export function truncate(text: string, maxLength: number, ellipsis = '…'): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Mask sensitive data (e.g. API keys) for display — shows only the last 4 chars.
 * Example: "sk-abc123xyz" -> "sk-...xyz"
 */
export function maskSensitive(value: string | null | undefined, visibleSuffix = 4): string {
  if (!value) return '***';
  if (value.length <= visibleSuffix) return '***';
  const prefix = value.slice(0, Math.min(4, value.length - visibleSuffix));
  const suffix = value.slice(-visibleSuffix);
  return `${prefix}...${suffix}`;
}

/**
 * Capitalize the first character of a string.
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert camelCase or snake_case to a readable Title Case string.
 */
export function toReadable(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Object Utilities ─────────────────────────────────────────────────────────

/**
 * Remove all keys with undefined or null values from an object (shallow).
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>;
}

/**
 * Pick a subset of keys from an object.
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Check if a string looks like a valid email address.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if a string is a valid UUID v4.
 */
export function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// ─── Async Utilities ──────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function up to `maxAttempts` times with exponential back-off.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}
