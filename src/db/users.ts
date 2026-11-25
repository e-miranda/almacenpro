import { and, count, eq, ilike, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from './index.ts';
import { ensureDatabaseSeeded, type PermissionKey } from './seed.ts';
import { movements, rolePermissions, roles, sectors, users } from './schema.ts';
import { hasEnvAdminPasscode } from '../lib/password.ts';

export interface AuthUser {
  id: number;
  uid: string | null;
  username: string | null;
  has_password: boolean;
  name: string;
  email: string;
  role_id: number;
  role_slug: string;
  role_name: string;
  sector_id: number | null;
  department: string;
  permissions: Record<PermissionKey, boolean>;
}

export async function loadAuthUserById(userId: number): Promise<AuthUser | null> {
  try {
    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        username: users.username,
        passwordHash: users.passwordHash,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        sectorId: users.sectorId,
        department: users.department,
        active: users.active,
        roleSlug: roles.slug,
        roleName: roles.name,
        sectorName: sectors.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(sectors, eq(users.sectorId, sectors.id))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row || row.active !== 1) return null;

    const permRows = await db
      .select({
        permissionKey: rolePermissions.permissionKey,
        allowed: rolePermissions.allowed,
      })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, row.roleId));

    const permissions = {} as Record<PermissionKey, boolean>;
    for (const p of permRows) {
      permissions[p.permissionKey as PermissionKey] = p.allowed === 1;
    }

    return {
      id: row.id,
      uid: row.uid,
      username: row.username,
      has_password: Boolean(row.passwordHash),
      name: row.name,
      email: row.email,
      role_id: row.roleId,
      role_slug: row.roleSlug,
      role_name: row.roleName,
      sector_id: row.sectorId,
      department: row.sectorName || row.department,
      permissions,
    };
  } catch (error) {
    console.error('Failed to load authenticated user permissions:', error);
    throw new Error('No se pudo cargar el perfil y permisos del usuario.', { cause: error });
  }
}

export async function findUserForLogin(identifier: string) {
  const clean = identifier.trim().toLowerCase();
  if (!clean) return null;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      passwordHash: users.passwordHash,
      active: users.active,
      roleSlug: roles.slug,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(or(ilike(users.email, clean), ilike(users.username, clean)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getAuthSystemStatus(): Promise<{
  needsSetup: boolean;
  hasEnvPasscode: boolean;
  allowRegistration: boolean;
}> {
  await ensureDatabaseSeeded();
  const hasPasscode = hasEnvAdminPasscode();

  const adminRoleRows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, 'admin'))
    .limit(1);

  const adminRoleId = adminRoleRows[0]?.id;
  if (!adminRoleId) {
    return { needsSetup: true, hasEnvPasscode: hasPasscode, allowRegistration: true };
  }

  const [{ adminWithPassword }] = await db
    .select({ adminWithPassword: count() })
    .from(users)
    .where(
      and(
        eq(users.roleId, adminRoleId),
        eq(users.active, 1),
        isNotNull(users.passwordHash)
      )
    );

  return {
    needsSetup: Number(adminWithPassword) === 0,
    hasEnvPasscode: hasPasscode,
    allowRegistration: true,
  };
}

export async function findOrCreatePasscodeAdmin(): Promise<AuthUser | null> {
  await ensureDatabaseSeeded();
  const adminRoleRows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, 'admin'))
    .limit(1);
  const adminRoleId = adminRoleRows[0]?.id;
  if (!adminRoleId) return null;

  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.roleId, adminRoleId), eq(users.active, 1)))
    .limit(1);

  if (existing[0]) {
    return loadAuthUserById(existing[0].id);
  }

  const admSector = await db
    .select()
    .from(sectors)
    .where(eq(sectors.code, 'SEC-ADM'))
    .limit(1);

  const [created] = await db
    .insert(users)
    .values({
      username: 'admin',
      name: 'Administrador del Sistema',
      email: 'admin@almacenpro.local',
      roleId: adminRoleId,
      sectorId: admSector[0]?.id ?? null,
      department: admSector[0]?.name || 'Administración y Compras',
      active: 1,
    })
    .returning();

  if (created) {
    await db.update(movements).set({ userId: created.id }).where(isNull(movements.userId));
    return loadAuthUserById(created.id);
  }
  return null;
}

export async function getOrCreateFirebaseUser(
  uid: string,
  rawEmail: string,
  displayName?: string
): Promise<AuthUser | null> {
  try {
    await ensureDatabaseSeeded();
    const email = rawEmail.trim().toLowerCase();
    const cleanName = (displayName || email.split('@')[0] || 'Usuario').trim().slice(0, 120);

    // 1. Check if UID already exists
    const byUid = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (byUid[0]) {
      if (byUid[0].email !== email) {
        await db.update(users).set({ email }).where(eq(users.id, byUid[0].id));
      }
      return await loadAuthUserById(byUid[0].id);
    }

    // 2. Check if admin pre-registered this email without UID yet
    const byEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail[0]) {
      await db
        .update(users)
        .set({
          uid,
          name: byEmail[0].name || cleanName,
        })
        .where(eq(users.id, byEmail[0].id));
      return await loadAuthUserById(byEmail[0].id);
    }

    // 3. Determine role for newly signed-in Google user (first user gets Admin automatically)
    const adminRoleRows = await db.select().from(roles).where(eq(roles.slug, 'admin')).limit(1);
    const usuarioRoleRows = await db.select().from(roles).where(eq(roles.slug, 'usuario')).limit(1);
    const adminRoleId = adminRoleRows[0]?.id;
    const usuarioRoleId = usuarioRoleRows[0]?.id ?? adminRoleId;

    if (!adminRoleId || !usuarioRoleId) {
      throw new Error('Roles base no inicializados.');
    }

    const [{ adminUsersCount }] = await db
      .select({ adminUsersCount: count() })
      .from(users)
      .where(and(eq(users.roleId, adminRoleId), eq(users.active, 1)));

    const isFirstAdmin = Number(adminUsersCount) === 0;
    const assignedRoleId = isFirstAdmin ? adminRoleId : usuarioRoleId;

    const admSector = await db
      .select()
      .from(sectors)
      .where(eq(sectors.code, isFirstAdmin ? 'SEC-ADM' : 'SEC-MANT'))
      .limit(1);

    const upserted = await db
      .insert(users)
      .values({
        uid,
        name: cleanName,
        email,
        roleId: assignedRoleId,
        sectorId: admSector[0]?.id ?? null,
        department: admSector[0]?.name || (isFirstAdmin ? 'Administración y Compras' : 'Operaciones'),
        active: 1,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email },
      })
      .returning();

    const createdUser = upserted[0];
    if (createdUser && isFirstAdmin) {
      await db
        .update(movements)
        .set({ userId: createdUser.id })
        .where(isNull(movements.userId));
    }

    return createdUser ? await loadAuthUserById(createdUser.id) : null;
  } catch (error) {
    console.error('Database query failed during user sync:', error);
    throw new Error('Error al sincronizar el usuario en la base de datos.', { cause: error });
  }
}
