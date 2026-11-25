import crypto from 'node:crypto';

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

const TOKEN_PREFIX = 'ap1';
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(
  plainPassword: string,
  storedHash: string | null | undefined
): boolean {
  if (!plainPassword || !storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(plainPassword, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function hasEnvAdminPasscode(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
}

export function verifyEnvAdminPasscode(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSCODE?.trim();
  if (!expected || !candidate) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(userId: number): string {
  const payload = {
    sub: userId,
    exp: Date.now() + DEFAULT_TTL_MS,
    ver: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${TOKEN_PREFIX}.${encodedPayload}`)
    .digest('base64url');
  return `${TOKEN_PREFIX}.${encodedPayload}.${sig}`;
}

export function isCustomSessionToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

export function verifySessionToken(token: string): { userId: number } | null {
  if (!isCustomSessionToken(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [prefix, encodedPayload, sig] = parts;
  if (prefix !== TOKEN_PREFIX || !encodedPayload || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${prefix}.${encodedPayload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as { sub?: number; exp?: number };

    if (
      typeof decoded.sub !== 'number' ||
      !Number.isInteger(decoded.sub) ||
      decoded.sub <= 0 ||
      typeof decoded.exp !== 'number' ||
      decoded.exp <= Date.now()
    ) {
      return null;
    }

    return { userId: decoded.sub };
  } catch {
    return null;
  }
}
