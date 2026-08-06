import https from 'node:https';
import { createLocalJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CACHE_TTL_MS = 60 * 60 * 1000;

type Cache = {
  keys: JWTVerifyGetKey;
  expiresAt: number;
};

let cache: Cache | null = null;
let inflight: Promise<JWTVerifyGetKey> | null = null;

/** HTTPS GET that ignores HTTP(S)_PROXY — Cursor/sandbox proxies break Google cert fetches. */
function httpsGetJson(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'jot-api-google-auth/1.0',
        },
        timeout: 12_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('Google JWKS request timed out'));
    });
    req.on('error', reject);
  });
}

async function loadGoogleJwks(force = false): Promise<JWTVerifyGetKey> {
  if (!force && cache && cache.expiresAt > Date.now()) {
    return cache.keys;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { status, body } = await httpsGetJson(JWKS_URL);
        if (status !== 200) {
          throw new Error(`Google JWKS HTTP ${status}`);
        }
        const jwks = JSON.parse(body) as JSONWebKeySet;
        if (!jwks.keys?.length) {
          throw new Error('Google JWKS response had no keys');
        }
        const keys = createLocalJWKSet(jwks);
        cache = { keys, expiresAt: Date.now() + CACHE_TTL_MS };
        return keys;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function getGoogleJwksVerifier(): Promise<JWTVerifyGetKey> {
  return loadGoogleJwks(false);
}

/** Force refresh once if verification fails due to key rotation. */
export async function refreshGoogleJwksVerifier(): Promise<JWTVerifyGetKey> {
  cache = null;
  return loadGoogleJwks(true);
}

/** Fallback validation via Google tokeninfo (also uses direct https, no proxy). */
export async function googleTokenInfo(
  idToken: string,
): Promise<Record<string, unknown>> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const { status, body } = await httpsGetJson(url);
  if (status !== 200) {
    throw new Error(`Google tokeninfo HTTP ${status}`);
  }
  return JSON.parse(body) as Record<string, unknown>;
}
