import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, type PermissionKey } from './db.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  uid: number;
  exp: number;
}

export function createAuthToken(userId: number): string {
  const payload: TokenPayload = {
    uid: userId,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role_slug: string;
  role_name: string;
  department: string;
  permissions: Record<PermissionKey, boolean>;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export function loadUserWithPermissions(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role_id, u.department, u.active, r.slug as role_slug, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: number;
        name: string;
        email: string;
        role_id: number;
        department: string;
        active: number;
        role_slug: string;
        role_name: string;
      }
    | undefined;

  if (!row || row.active !== 1) return null;

  const permRows = db
    .prepare('SELECT permission_key, allowed FROM role_permissions WHERE role_id = ?')
    .all(row.role_id) as Array<{ permission_key: PermissionKey; allowed: number }>;

  const permissions = {} as Record<PermissionKey, boolean>;
  for (const p of permRows) {
    permissions[p.permission_key] = p.allowed === 1;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role_id: row.role_id,
    role_slug: row.role_slug,
    role_name: row.role_name,
    department: row.department,
    permissions,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesión no autenticada.' });
    return;
  }
  const token = header.slice(7).trim();
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Tu sesión expiró o es inválida.' });
    return;
  }
  const user = loadUserWithPermissions(payload.uid);
  if (!user) {
    res.status(401).json({ error: 'Usuario inactivo o no encontrado.' });
    return;
  }
  req.authUser = user;
  next();
}

export function requirePermission(perm: PermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Sesión requerida.' });
      return;
    }
    if (!req.authUser.permissions[perm]) {
      res.status(403).json({
        error: `Acceso denegado: tu rol (${req.authUser.role_name}) no tiene permiso para esta acción.`,
      });
      return;
    }
    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Sesión requerida.' });
    return;
  }
  if (req.authUser.role_slug !== 'admin') {
    res.status(403).json({
      error: 'Acceso denegado: esta operación es exclusiva del rol Administrador.',
    });
    return;
  }
  next();
}

export function getAdminSetupStatus(): { needsSetup: boolean; hasEnvPasscode: boolean } {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  const adminRow = db
    .prepare(
      `SELECT u.id, u.password_hash
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.slug = 'admin' AND u.active = 1 AND length(u.password_hash) > 0
       LIMIT 1`
    )
    .get() as { id: number; password_hash: string } | undefined;

  return {
    needsSetup: !adminRow && !envPass,
    hasEnvPasscode: Boolean(envPass),
  };
}
