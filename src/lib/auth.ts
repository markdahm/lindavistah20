// Session token helpers.
//
// Runs in both the Edge runtime (middleware) and Node (route handlers), so everything
// here uses Web Crypto rather than node:crypto.
//
// A token is `<expiry-ms>.<hmac>` where the hmac covers the expiry, signed with
// SESSION_SECRET. There is nothing secret inside the token — it only proves that whoever
// holds it knew the password at some point before the expiry.

export const SESSION_COOKIE = 'lvw_session';
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

const encoder = new TextEncoder();

/** Which required environment variables are missing. Empty array means configured. */
export function missingAuthConfig(env: {
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
}): string[] {
  const missing: string[] = [];
  if (!env.APP_PASSWORD) missing.push('APP_PASSWORD');
  if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');
  return missing;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compare two strings without leaking where they diverge. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const expiry = now + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiry}.${await hmac(secret, String(expiry))}`;
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined,
  now = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const expiryPart = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expiry = Number(expiryPart);
  if (!Number.isFinite(expiry) || expiry <= now) return false;

  return safeEqual(signature, await hmac(secret, expiryPart));
}

/**
 * True when the request carries the automation API key. Lets the readings skill and any
 * restore run without a browser session. Absent or unset key means no.
 */
export function hasValidApiKey(
  providedKey: string | null,
  expectedKey: string | undefined
): boolean {
  if (!expectedKey || !providedKey) return false;
  return safeEqual(providedKey, expectedKey);
}
