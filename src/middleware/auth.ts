import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { isCustomSessionToken, verifySessionToken } from '../lib/password.ts';
import { getOrCreateFirebaseUser, loadAuthUserById, type AuthUser } from '../db/users.ts';
import type { PermissionKey } from '../db/seed.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  authUser?: AuthUser;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesión no autenticada. Inicia sesión para continuar.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({ error: 'Token de autenticación faltante.' });
    return;
  }

  if (isCustomSessionToken(token)) {
    const session = verifySessionToken(token);
    if (!session) {
      res.status(401).json({ error: 'Tu sesión expiró o es inválida. Inicia sesión nuevamente.' });
      return;
    }

    try {
      const authUser = await loadAuthUserById(session.userId);
      if (!authUser) {
        res.status(403).json({ error: 'Tu cuenta está desactivada o no existe.' });
        return;
      }
      req.authUser = authUser;
      next();
    } catch (error) {
      console.error('Error loading session user:', error);
      res.status(500).json({ error: 'No se pudo validar tu perfil en la base de datos.' });
    }
    return;
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Tu sesión expiró o es inválida. Inicia sesión nuevamente.' });
    return;
  }

  try {
    const email = decodedToken.email || `${decodedToken.uid}@firebase.local`;
    const authUser = await getOrCreateFirebaseUser(
      decodedToken.uid,
      email,
      decodedToken.name || decodedToken.email?.split('@')[0]
    );
    if (!authUser) {
      res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al Administrador.' });
      return;
    }
    req.user = decodedToken;
    req.authUser = authUser;
    next();
  } catch (error) {
    console.error('Error syncing authenticated user:', error);
    res.status(500).json({ error: 'No se pudo validar tu perfil en la base de datos.' });
  }
}

export function requirePermission(perm: PermissionKey) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
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

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
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
