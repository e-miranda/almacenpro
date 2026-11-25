import type { Express, Response } from 'express';
import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import {
  categories,
  exitBatches,
  movements,
  orderItems,
  orders,
  personnel,
  products,
  rolePermissions,
  roles,
  sectors,
  users,
} from '../src/db/schema.ts';
import { ALL_PERMISSIONS, ensureDatabaseSeeded, type PermissionKey } from '../src/db/seed.ts';
import {
  findOrCreatePasscodeAdmin,
  findUserForLogin,
  getAuthSystemStatus,
  loadAuthUserById,
} from '../src/db/users.ts';
import {
  hashPassword,
  signSessionToken,
  verifyEnvAdminPasscode,
  verifyPassword,
} from '../src/lib/password.ts';
import {
  type AuthRequest,
  requireAdmin,
  requireAuth,
  requirePermission,
} from '../src/middleware/auth.ts';

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

function normalizeUsername(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.trim().toLowerCase();
}

function sanitizeString(val: unknown, max = 300): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}

function toNumber(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

function isPgUniqueError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return (
    e.code === '23505' ||
    e.cause?.code === '23505' ||
    String(e.message || '').includes('duplicate key')
  );
}

function formatPgDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function generateCode(prefix: string, name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4);
  const rand = Math.floor(100 + Math.random() * 899);
  return `${prefix}-${clean || 'GEN'}-${rand}`;
}

async function generateNextFolio(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  prefix: 'ING' | 'SAL' | 'PED'
): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  let existingCount = 0;

  if (prefix === 'PED') {
    const [row] = await tx
      .select({ c: count() })
      .from(orders)
      .where(ilike(orders.folio, pattern));
    existingCount = Number(row?.c ?? 0);
  } else if (prefix === 'SAL') {
    const [row] = await tx
      .select({ c: count() })
      .from(exitBatches)
      .where(ilike(exitBatches.folio, pattern));
    existingCount = Number(row?.c ?? 0);
  } else {
    const [row] = await tx
      .select({ c: count() })
      .from(movements)
      .where(ilike(movements.folio, pattern));
    existingCount = Number(row?.c ?? 0);
  }

  let seq = existingCount + 1;
  while (true) {
    const candidate = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
    if (prefix === 'PED') {
      const hit = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.folio, candidate))
        .limit(1);
      if (hit.length === 0) return candidate;
    } else if (prefix === 'SAL') {
      const hit = await tx
        .select({ id: exitBatches.id })
        .from(exitBatches)
        .where(eq(exitBatches.folio, candidate))
        .limit(1);
      if (hit.length === 0) return candidate;
    } else {
      const hit = await tx
        .select({ id: movements.id })
        .from(movements)
        .where(eq(movements.folio, candidate))
        .limit(1);
      if (hit.length === 0) return candidate;
    }
    seq += 1;
  }
}

async function resolveCategory(
  categoryIdInput: unknown,
  categoryNameInput: unknown,
  fallbackName = 'General'
): Promise<{ category_id: number; category: string }> {
  const rawId = Number(categoryIdInput);
  if (Number.isInteger(rawId) && rawId > 0) {
    const rows = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, rawId))
      .limit(1);
    if (rows[0]) return { category_id: rows[0].id, category: rows[0].name };
  }

  const name = sanitizeString(categoryNameInput, 80) || fallbackName;
  const existing = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(ilike(categories.name, name))
    .limit(1);
  if (existing[0]) {
    return { category_id: existing[0].id, category: existing[0].name };
  }

  let code = generateCode('CAT', name);
  while (
    (await db.select({ id: categories.id }).from(categories).where(eq(categories.code, code)).limit(1))
      .length > 0
  ) {
    code = generateCode('CAT', name);
  }
  const [inserted] = await db
    .insert(categories)
    .values({ code, name, description: '', active: 1 })
    .returning();
  return { category_id: inserted.id, category: inserted.name };
}

function serializeProduct(p: typeof products.$inferSelect, catName?: string | null) {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    description: p.description,
    category_id: p.categoryId,
    category: catName || p.category,
    unit: p.unit,
    location: p.location,
    stock_current: p.stockCurrent,
    stock_min: p.stockMin,
    cost_previous: p.costPrevious,
    cost_current: p.costCurrent,
    margin_percent: p.marginPercent,
    price_current: p.priceCurrent,
    updated_at: formatPgDate(p.updatedAt),
    created_at: formatPgDate(p.createdAt),
  };
}

function serializeMovement(row: {
  m: typeof movements.$inferSelect;
  sku: string;
  barcode: string;
  productName: string;
  unit: string;
  category: string | null;
  operatorName: string | null;
  operatorRole: string | null;
  sectorName: string | null;
  personnelName: string | null;
}) {
  const { m } = row;
  return {
    id: m.id,
    folio: m.folio,
    type: m.type as 'INGRESO' | 'SALIDA',
    product_id: m.productId,
    quantity: m.quantity,
    cost_previous: m.costPrevious,
    cost_entry: m.costEntry,
    cost_resulting: m.costResulting,
    price_previous: m.pricePrevious,
    price_resulting: m.priceResulting,
    total_value: m.totalValue,
    personnel_id: m.personnelId,
    sector_id: m.sectorId,
    responsible_name: m.responsibleName,
    responsible_area: row.sectorName || m.responsibleArea,
    reason_detail: m.reasonDetail,
    exit_batch_id: m.exitBatchId,
    order_id: m.orderId,
    user_id: m.userId,
    created_at: formatPgDate(m.createdAt),
    sku: row.sku,
    barcode: row.barcode,
    product_name: row.productName,
    unit: row.unit,
    category: row.category || '',
    operator_name: row.operatorName || undefined,
    operator_role: row.operatorRole || undefined,
    personnel_name: row.personnelName || undefined,
    sector_name: row.sectorName || undefined,
  };
}

async function fetchMovementById(movId: number) {
  const rows = await db
    .select({
      m: movements,
      sku: products.sku,
      barcode: products.barcode,
      productName: products.name,
      unit: products.unit,
      category: products.category,
      operatorName: users.name,
      operatorRole: roles.name,
      sectorName: sectors.name,
      personnelName: personnel.name,
    })
    .from(movements)
    .innerJoin(products, eq(movements.productId, products.id))
    .leftJoin(users, eq(movements.userId, users.id))
    .leftJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(sectors, eq(movements.sectorId, sectors.id))
    .leftJoin(personnel, eq(movements.personnelId, personnel.id))
    .where(eq(movements.id, movId))
    .limit(1);

  return rows[0] ? serializeMovement(rows[0]) : null;
}

export function registerRoutes(app: Express): void {
  // ── AUTH STATUS, CLASSIC LOGIN, SETUP & REGISTRATION ──────────────────────
  app.get('/api/auth/status', async (_req, res: Response) => {
    try {
      const status = await getAuthSystemStatus();
      const sectorList = await db
        .select({ id: sectors.id, name: sectors.name })
        .from(sectors)
        .where(eq(sectors.active, 1))
        .orderBy(asc(sectors.name));
      res.json({
        ...status,
        sectors: sectorList,
      });
    } catch (err) {
      console.error('Auth status error:', err);
      res.status(500).json({ error: 'No se pudo consultar el estado de acceso.' });
    }
  });

  app.post('/api/auth/setup', async (req, res: Response) => {
    const name = sanitizeString(req.body?.name, 120);
    const username = normalizeUsername(req.body?.username);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const createTeamDemo = Boolean(req.body?.createTeamDemo);

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Ingresa el nombre completo del administrador.' });
      return;
    }
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({
        error: 'El nombre de usuario debe tener entre 3 y 40 caracteres (letras, números, ".", "_" o "-").',
      });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    try {
      await ensureDatabaseSeeded();
      const adminId = await db.transaction(async (tx) => {
        const adminRoleRows = await tx
          .select()
          .from(roles)
          .where(eq(roles.slug, 'admin'))
          .limit(1);
        const almRoleRows = await tx
          .select()
          .from(roles)
          .where(eq(roles.slug, 'almacenista'))
          .limit(1);
        const userRoleRows = await tx
          .select()
          .from(roles)
          .where(eq(roles.slug, 'usuario'))
          .limit(1);

        const adminRole = adminRoleRows[0];
        if (!adminRole) {
          throw new Error('Rol Administrador no encontrado.');
        }

        const [{ existingClaimed }] = await tx
          .select({ existingClaimed: count() })
          .from(users)
          .where(
            and(
              eq(users.roleId, adminRole.id),
              eq(users.active, 1),
              isNotNull(users.passwordHash)
            )
          );

        if (Number(existingClaimed) > 0) {
          return -1;
        }

        const admSector = await tx
          .select()
          .from(sectors)
          .where(eq(sectors.code, 'SEC-ADM'))
          .limit(1);
        const mantSector = await tx
          .select()
          .from(sectors)
          .where(eq(sectors.code, 'SEC-MANT'))
          .limit(1);

        const pwdHash = hashPassword(password);

        // If an admin account already exists via Google Sign-In without passwordHash, claim it
        const unclaimedAdmins = await tx
          .select()
          .from(users)
          .where(and(eq(users.roleId, adminRole.id), eq(users.active, 1)))
          .orderBy(asc(users.id))
          .limit(1);

        let claimedAdminId: number;
        if (unclaimedAdmins[0]) {
          const [updated] = await tx
            .update(users)
            .set({
              name,
              username,
              email,
              passwordHash: pwdHash,
            })
            .where(eq(users.id, unclaimedAdmins[0].id))
            .returning();
          claimedAdminId = updated.id;
        } else {
          const [created] = await tx
            .insert(users)
            .values({
              username,
              passwordHash: pwdHash,
              name,
              email,
              roleId: adminRole.id,
              sectorId: admSector[0]?.id ?? null,
              department: admSector[0]?.name || 'Administración y Compras',
              active: 1,
            })
            .returning();
          claimedAdminId = created.id;
        }

        await tx
          .update(movements)
          .set({ userId: claimedAdminId })
          .where(isNull(movements.userId));

        if (createTeamDemo) {
          if (almRoleRows[0]) {
            const existingAlm = await tx
              .select({ id: users.id })
              .from(users)
              .where(
                or(
                  ilike(users.username, 'almacenista'),
                  ilike(users.email, 'almacen@almacenpro.local')
                )
              )
              .limit(1);
            if (!existingAlm[0]) {
              await tx.insert(users).values({
                username: 'almacenista',
                passwordHash: pwdHash,
                name: 'Encargado de Almacén',
                email: 'almacen@almacenpro.local',
                roleId: almRoleRows[0].id,
                sectorId: admSector[0]?.id ?? null,
                department: admSector[0]?.name || 'Almacén Central',
                active: 1,
              });
            }
          }
          if (userRoleRows[0]) {
            const existingOp = await tx
              .select({ id: users.id })
              .from(users)
              .where(
                or(
                  ilike(users.username, 'operaciones'),
                  ilike(users.email, 'operaciones@almacenpro.local')
                )
              )
              .limit(1);
            if (!existingOp[0]) {
              await tx.insert(users).values({
                username: 'operaciones',
                passwordHash: pwdHash,
                name: 'Solicitante de Operaciones',
                email: 'operaciones@almacenpro.local',
                roleId: userRoleRows[0].id,
                sectorId: mantSector[0]?.id ?? null,
                department: mantSector[0]?.name || 'Mantenimiento',
                active: 1,
              });
            }
          }
        }

        return claimedAdminId;
      });

      if (adminId === -1) {
        res.status(409).json({
          error: 'La configuración inicial ya fue completada. Inicia sesión con tu usuario y contraseña.',
        });
        return;
      }

      const authUser = await loadAuthUserById(adminId);
      if (!authUser) {
        res.status(500).json({ error: 'No se pudo cargar el perfil del administrador.' });
        return;
      }

      const token = signSessionToken(authUser.id);
      res.status(201).json({ token, user: authUser });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({
          error: 'El usuario o correo electrónico ya se encuentra registrado.',
        });
        return;
      }
      console.error('Auth setup error:', err);
      res.status(500).json({ error: 'No se pudo completar la configuración inicial.' });
    }
  });

  app.post('/api/auth/login', async (req, res: Response) => {
    const rawIdentifier =
      req.body?.identifier ?? req.body?.username ?? req.body?.email ?? '';
    const identifier = sanitizeString(rawIdentifier, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Ingresa tu usuario (o correo) y contraseña.' });
      return;
    }

    try {
      await ensureDatabaseSeeded();
      const candidate = await findUserForLogin(identifier);

      if (candidate) {
        if (candidate.active !== 1) {
          res.status(403).json({
            error: 'Tu cuenta está desactivada. Contacta al Administrador.',
          });
          return;
        }

        const validPwd = verifyPassword(password, candidate.passwordHash);
        const validEnvOverride =
          candidate.roleSlug === 'admin' && verifyEnvAdminPasscode(password);

        if (validPwd || validEnvOverride) {
          const authUser = await loadAuthUserById(candidate.id);
          if (!authUser) {
            res.status(403).json({ error: 'Tu cuenta no está disponible.' });
            return;
          }
          const token = signSessionToken(authUser.id);
          res.json({ token, user: authUser });
          return;
        }

        if (!candidate.passwordHash) {
          res.status(401).json({
            error:
              'Esta cuenta aún no tiene contraseña local asignada. Usa "Continuar con Google" o pide al Administrador asignarte una contraseña.',
          });
          return;
        }

        res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        return;
      }

      // Support direct admin passcode login if ADMIN_PASSCODE is configured in env
      if (
        (identifier === 'admin' || identifier === 'administrador') &&
        verifyEnvAdminPasscode(password)
      ) {
        const adminUser = await findOrCreatePasscodeAdmin();
        if (adminUser) {
          const token = signSessionToken(adminUser.id);
          res.json({ token, user: adminUser });
          return;
        }
      }

      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'No se pudo iniciar sesión.' });
    }
  });

  app.post('/api/auth/register', async (req, res: Response) => {
    const name = sanitizeString(req.body?.name, 120);
    const username = normalizeUsername(req.body?.username);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rawSectorId = Number(req.body?.sector_id);
    const sectorId = Number.isInteger(rawSectorId) && rawSectorId > 0 ? rawSectorId : null;

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Ingresa tu nombre completo.' });
      return;
    }
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({
        error: 'El usuario debe tener entre 3 y 40 caracteres (letras, números, ".", "_" o "-").',
      });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    try {
      await ensureDatabaseSeeded();

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(or(ilike(users.username, username), ilike(users.email, email)))
        .limit(1);

      if (existing[0]) {
        res.status(409).json({
          error: 'El nombre de usuario o correo electrónico ya está registrado.',
        });
        return;
      }

      const usuarioRoleRows = await db
        .select()
        .from(roles)
        .where(eq(roles.slug, 'usuario'))
        .limit(1);
      const fallbackRoleRows = await db.select().from(roles).orderBy(asc(roles.id)).limit(1);
      const assignedRoleId = usuarioRoleRows[0]?.id ?? fallbackRoleRows[0]?.id;
      if (!assignedRoleId) {
        res.status(500).json({ error: 'Roles base no disponibles.' });
        return;
      }

      let department = 'Operaciones';
      let resolvedSectorId = sectorId;
      if (sectorId) {
        const secRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
        if (secRows[0]) department = secRows[0].name;
        else resolvedSectorId = null;
      }

      const [created] = await db
        .insert(users)
        .values({
          username,
          passwordHash: hashPassword(password),
          name,
          email,
          roleId: assignedRoleId,
          sectorId: resolvedSectorId,
          department,
          active: 1,
        })
        .returning();

      const authUser = await loadAuthUserById(created.id);
      if (!authUser) {
        res.status(500).json({ error: 'No se pudo cargar la cuenta recién creada.' });
        return;
      }

      const token = signSessionToken(authUser.id);
      res.status(201).json({ token, user: authUser });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({
          error: 'El nombre de usuario o correo electrónico ya está registrado.',
        });
        return;
      }
      console.error('Register error:', err);
      res.status(500).json({ error: 'No se pudo crear la cuenta.' });
    }
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
    const currentPassword =
      typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';

    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    try {
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, req.authUser!.id))
        .limit(1);
      const current = userRows[0];
      if (!current) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }

      if (current.passwordHash && !verifyPassword(currentPassword, current.passwordHash)) {
        res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
        return;
      }

      await db
        .update(users)
        .set({ passwordHash: hashPassword(newPassword) })
        .where(eq(users.id, current.id));

      res.json({ ok: true });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
    }
  });

  // ── AUTH PROFILE ──────────────────────────────────────────────────────────
  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
    res.json({ user: req.authUser });
  });

  // ── DASHBOARD EN TIEMPO REAL ──────────────────────────────────────────────
  app.get(
    '/api/dashboard',
    requireAuth,
    requirePermission('view_dashboard'),
    async (_req: AuthRequest, res: Response) => {
      try {
        await ensureDatabaseSeeded();
        const allProds = await db.select().from(products);

        let totalUnits = 0;
        let inventoryCostValue = 0;
        let inventorySaleValue = 0;
        let outOfStockCount = 0;
        let lowStockCount = 0;

        for (const p of allProds) {
          totalUnits += p.stockCurrent;
          inventoryCostValue += p.stockCurrent * p.costCurrent;
          inventorySaleValue += p.stockCurrent * p.priceCurrent;
          if (p.stockCurrent === 0) outOfStockCount++;
          else if (p.stockCurrent <= p.stockMin) lowStockCount++;
        }

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const startOfYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
        const endOfYear = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59));

        const yearMovements = await db
          .select()
          .from(movements)
          .where(and(gte(movements.createdAt, startOfYear), lte(movements.createdAt, endOfYear)));

        let entriesCount = 0;
        let exitsCount = 0;
        let entriesValue = 0;
        let exitsValue = 0;
        const seriesMap = new Map<
          string,
          { ym: string; ingreso_qty: number; salida_qty: number; ingreso_val: number; salida_val: number }
        >();

        for (const m of yearMovements) {
          const d = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
          const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          const bucket = seriesMap.get(ym) || {
            ym,
            ingreso_qty: 0,
            salida_qty: 0,
            ingreso_val: 0,
            salida_val: 0,
          };
          if (m.type === 'INGRESO') {
            bucket.ingreso_qty += m.quantity;
            bucket.ingreso_val = roundMoney(bucket.ingreso_val + m.totalValue);
          } else {
            bucket.salida_qty += m.quantity;
            bucket.salida_val = roundMoney(bucket.salida_val + m.totalValue);
          }
          seriesMap.set(ym, bucket);

          if (d.getUTCFullYear() === currentYear && d.getUTCMonth() === currentMonth) {
            if (m.type === 'INGRESO') {
              entriesCount++;
              entriesValue += m.totalValue;
            } else {
              exitsCount++;
              exitsValue += m.totalValue;
            }
          }
        }

        const [{ pendingOrders }] = await db
          .select({ pendingOrders: count() })
          .from(orders)
          .where(eq(orders.status, 'Pendiente'));

        const [{ approvedOrders }] = await db
          .select({ approvedOrders: count() })
          .from(orders)
          .where(eq(orders.status, 'Aprobado'));

        const alerts = allProds
          .filter((p) => p.stockCurrent <= p.stockMin)
          .sort((a, b) => a.stockCurrent - b.stockCurrent || b.stockMin - b.stockCurrent - (a.stockMin - a.stockCurrent))
          .slice(0, 10)
          .map((p) => serializeProduct(p));

        const recentRows = await db
          .select({
            m: movements,
            sku: products.sku,
            barcode: products.barcode,
            productName: products.name,
            unit: products.unit,
            category: products.category,
            operatorName: users.name,
            operatorRole: roles.name,
            sectorName: sectors.name,
            personnelName: personnel.name,
          })
          .from(movements)
          .innerJoin(products, eq(movements.productId, products.id))
          .leftJoin(users, eq(movements.userId, users.id))
          .leftJoin(roles, eq(users.roleId, roles.id))
          .leftJoin(sectors, eq(movements.sectorId, sectors.id))
          .leftJoin(personnel, eq(movements.personnelId, personnel.id))
          .orderBy(desc(movements.createdAt), desc(movements.id))
          .limit(8);

        const monthlySeries = Array.from(seriesMap.values()).sort((a, b) => a.ym.localeCompare(b.ym));

        res.json({
          kpis: {
            total_products: allProds.length,
            total_units: totalUnits,
            inventory_cost_value: roundMoney(inventoryCostValue),
            inventory_sale_value: roundMoney(inventorySaleValue),
            out_of_stock_count: outOfStockCount,
            low_stock_count: lowStockCount,
            entries_count: entriesCount,
            exits_count: exitsCount,
            entries_value: roundMoney(entriesValue),
            exits_value: roundMoney(exitsValue),
            pending_orders: Number(pendingOrders),
            approved_to_dispatch: Number(approvedOrders),
          },
          alerts,
          recentMovements: recentRows.map(serializeMovement),
          monthlySeries,
          serverTime: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'No se pudo cargar el monitoreo en tiempo real.' });
      }
    }
  );

  // ── SECTORES (CRUD + CATÁLOGO PARA SALIDAS Y PEDIDOS) ────────────────────
  app.get('/api/sectors', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      await ensureDatabaseSeeded();
      const sectorList = await db.select().from(sectors).orderBy(asc(sectors.name));
      const allPersonnel = await db.select().from(personnel);
      const countBySector = new Map<number, number>();
      for (const p of allPersonnel) {
        countBySector.set(p.sectorId, (countBySector.get(p.sectorId) ?? 0) + 1);
      }

      res.json({
        sectors: sectorList.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          description: s.description,
          active: s.active,
          created_at: formatPgDate(s.createdAt),
          personnel_count: countBySector.get(s.id) ?? 0,
        })),
      });
    } catch (error) {
      console.error('List sectors error:', error);
      res.status(500).json({ error: 'No se pudieron cargar los sectores.' });
    }
  });

  app.post('/api/sectors', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const name = sanitizeString(req.body?.name, 100);
    const codeInput = sanitizeString(req.body?.code, 30).toUpperCase();
    const description = sanitizeString(req.body?.description, 300);
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : 1;

    if (!name) {
      res.status(400).json({ error: 'El nombre del sector es obligatorio.' });
      return;
    }

    const code = codeInput || generateCode('SEC', name);
    try {
      const [created] = await db
        .insert(sectors)
        .values({ code, name, description, active })
        .returning();
      res.status(201).json({
        sector: {
          id: created.id,
          code: created.code,
          name: created.name,
          description: created.description,
          active: created.active,
          created_at: formatPgDate(created.createdAt),
          personnel_count: 0,
        },
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe un sector con ese nombre o código.' });
        return;
      }
      console.error('Create sector error:', err);
      res.status(500).json({ error: 'No se pudo crear el sector.' });
    }
  });

  app.put('/api/sectors/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(sectors).where(eq(sectors.id, id)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Sector no encontrado.' });
        return;
      }

      const code = sanitizeString(req.body?.code, 30).toUpperCase() || existing.code;
      const name = sanitizeString(req.body?.name, 100) || existing.name;
      const description =
        req.body?.description !== undefined
          ? sanitizeString(req.body.description, 300)
          : existing.description;
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;

      const updated = await db.transaction(async (tx) => {
        const [sec] = await tx
          .update(sectors)
          .set({ code, name, description, active })
          .where(eq(sectors.id, id))
          .returning();
        await tx.update(users).set({ department: name }).where(eq(users.sectorId, id));
        await tx.update(orders).set({ department: name }).where(eq(orders.sectorId, id));
        return sec;
      });

      const [{ pCount }] = await db
        .select({ pCount: count() })
        .from(personnel)
        .where(eq(personnel.sectorId, id));

      res.json({
        sector: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          description: updated.description,
          active: updated.active,
          created_at: formatPgDate(updated.createdAt),
          personnel_count: Number(pCount),
        },
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe otro sector con ese nombre o código.' });
        return;
      }
      console.error('Update sector error:', err);
      res.status(500).json({ error: 'No se pudo actualizar el sector.' });
    }
  });

  app.delete('/api/sectors/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(sectors).where(eq(sectors.id, id)).limit(1);
      if (!existingRows[0]) {
        res.status(404).json({ error: 'Sector no encontrado.' });
        return;
      }

      const [{ pCount }] = await db
        .select({ pCount: count() })
        .from(personnel)
        .where(eq(personnel.sectorId, id));

      if (Number(pCount) > 0) {
        res.status(409).json({
          error: `No se puede eliminar "${existingRows[0].name}" porque tiene ${pCount} persona(s) asignada(s). Reasigna el personal primero.`,
        });
        return;
      }

      await db.delete(sectors).where(eq(sectors.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete sector error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el sector.' });
    }
  });

  // ── PERSONAL (CRUD + DIRECTORIO CON SECTOR) ───────────────────────────────
  app.get('/api/personnel', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      await ensureDatabaseSeeded();
      const rows = await db
        .select({
          p: personnel,
          sectorName: sectors.name,
          sectorCode: sectors.code,
        })
        .from(personnel)
        .innerJoin(sectors, eq(personnel.sectorId, sectors.id))
        .orderBy(asc(personnel.name));

      res.json({
        personnel: rows.map((r) => ({
          id: r.p.id,
          code: r.p.code,
          name: r.p.name,
          position: r.p.position,
          email: r.p.email,
          phone: r.p.phone,
          sector_id: r.p.sectorId,
          sector_name: r.sectorName,
          sector_code: r.sectorCode,
          active: r.p.active,
          created_at: formatPgDate(r.p.createdAt),
        })),
      });
    } catch (err) {
      console.error('List personnel error:', err);
      res.status(500).json({ error: 'No se pudo cargar la lista de personal.' });
    }
  });

  app.post('/api/personnel', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const name = sanitizeString(req.body?.name, 120);
    const codeInput = sanitizeString(req.body?.code, 30).toUpperCase();
    const position = sanitizeString(req.body?.position, 100) || 'Operador';
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const phone = sanitizeString(req.body?.phone, 40);
    const sectorId = Number(req.body?.sector_id);
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : 1;

    if (!name || !sectorId) {
      res.status(400).json({ error: 'El nombre del trabajador y su sector son obligatorios.' });
      return;
    }

    try {
      const secRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
      if (!secRows[0]) {
        res.status(400).json({ error: 'El sector seleccionado no existe.' });
        return;
      }

      const code = codeInput || generateCode('PER', name);
      const [created] = await db
        .insert(personnel)
        .values({ code, name, position, email, phone, sectorId, active })
        .returning();

      res.status(201).json({
        person: {
          id: created.id,
          code: created.code,
          name: created.name,
          position: created.position,
          email: created.email,
          phone: created.phone,
          sector_id: created.sectorId,
          sector_name: secRows[0].name,
          sector_code: secRows[0].code,
          active: created.active,
          created_at: formatPgDate(created.createdAt),
        },
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe personal con ese código.' });
        return;
      }
      console.error('Create personnel error:', err);
      res.status(500).json({ error: 'No se pudo registrar al personal.' });
    }
  });

  app.put('/api/personnel/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(personnel).where(eq(personnel.id, id)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Registro de personal no encontrado.' });
        return;
      }

      const code = sanitizeString(req.body?.code, 30).toUpperCase() || existing.code;
      const name = sanitizeString(req.body?.name, 120) || existing.name;
      const position = sanitizeString(req.body?.position, 100) || existing.position;
      const email =
        req.body?.email !== undefined ? sanitizeString(req.body.email, 160).toLowerCase() : existing.email;
      const phone = req.body?.phone !== undefined ? sanitizeString(req.body.phone, 40) : existing.phone;
      const sectorId = req.body?.sector_id ? Number(req.body.sector_id) : existing.sectorId;
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;

      const secRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
      if (!secRows[0]) {
        res.status(400).json({ error: 'El sector seleccionado no existe.' });
        return;
      }

      const [updated] = await db
        .update(personnel)
        .set({ code, name, position, email, phone, sectorId, active })
        .where(eq(personnel.id, id))
        .returning();

      res.json({
        person: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          position: updated.position,
          email: updated.email,
          phone: updated.phone,
          sector_id: updated.sectorId,
          sector_name: secRows[0].name,
          sector_code: secRows[0].code,
          active: updated.active,
          created_at: formatPgDate(updated.createdAt),
        },
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe otro trabajador con ese código.' });
        return;
      }
      console.error('Update personnel error:', err);
      res.status(500).json({ error: 'No se pudo actualizar el personal.' });
    }
  });

  app.delete('/api/personnel/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(personnel).where(eq(personnel.id, id)).limit(1);
      if (!existingRows[0]) {
        res.status(404).json({ error: 'Registro de personal no encontrado.' });
        return;
      }
      await db.delete(personnel).where(eq(personnel.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete personnel error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el registro de personal.' });
    }
  });

  // ── CATEGORÍAS DE PRODUCTOS (CRUD) ────────────────────────────────────────
  app.get('/api/categories', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      await ensureDatabaseSeeded();
      const catList = await db.select().from(categories).orderBy(asc(categories.name));
      const allProds = await db.select({ categoryId: products.categoryId }).from(products);
      const countByCat = new Map<number, number>();
      for (const p of allProds) {
        if (p.categoryId) countByCat.set(p.categoryId, (countByCat.get(p.categoryId) ?? 0) + 1);
      }

      res.json({
        categories: catList.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          description: c.description,
          active: c.active,
          created_at: formatPgDate(c.createdAt),
          product_count: countByCat.get(c.id) ?? 0,
        })),
      });
    } catch (err) {
      console.error('List categories error:', err);
      res.status(500).json({ error: 'No se pudieron cargar las categorías.' });
    }
  });

  app.post('/api/categories', requireAuth, async (req: AuthRequest, res: Response) => {
    if (req.authUser!.role_slug !== 'admin' && !req.authUser!.permissions.manage_products) {
      res.status(403).json({ error: 'No tienes permiso para crear categorías.' });
      return;
    }
    const name = sanitizeString(req.body?.name, 80);
    const codeInput = sanitizeString(req.body?.code, 30).toUpperCase();
    const description = sanitizeString(req.body?.description, 300);
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : 1;

    if (!name) {
      res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
      return;
    }

    const code = codeInput || generateCode('CAT', name);
    try {
      const [created] = await db
        .insert(categories)
        .values({ code, name, description, active })
        .returning();
      res.status(201).json({
        category: {
          id: created.id,
          code: created.code,
          name: created.name,
          description: created.description,
          active: created.active,
          created_at: formatPgDate(created.createdAt),
          product_count: 0,
        },
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe una categoría con ese nombre o código.' });
        return;
      }
      console.error('Create category error:', err);
      res.status(500).json({ error: 'No se pudo crear la categoría.' });
    }
  });

  app.put('/api/categories/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Categoría no encontrada.' });
        return;
      }

      const code = sanitizeString(req.body?.code, 30).toUpperCase() || existing.code;
      const name = sanitizeString(req.body?.name, 80) || existing.name;
      const description =
        req.body?.description !== undefined
          ? sanitizeString(req.body.description, 300)
          : existing.description;
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;

      const updated = await db.transaction(async (tx) => {
        const [cat] = await tx
          .update(categories)
          .set({ code, name, description, active })
          .where(eq(categories.id, id))
          .returning();
        await tx.update(products).set({ category: name }).where(eq(products.categoryId, id));
        return cat;
      });

      const [{ pCount }] = await db
        .select({ pCount: count() })
        .from(products)
        .where(eq(products.categoryId, id));

      res.json({
        category: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          description: updated.description,
          active: updated.active,
          created_at: formatPgDate(updated.createdAt),
          product_count: Number(pCount),
        },
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe otra categoría con ese nombre o código.' });
        return;
      }
      console.error('Update category error:', err);
      res.status(500).json({ error: 'No se pudo actualizar la categoría.' });
    }
  });

  app.delete('/api/categories/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
      if (!existingRows[0]) {
        res.status(404).json({ error: 'Categoría no encontrada.' });
        return;
      }
      const [{ pCount }] = await db
        .select({ pCount: count() })
        .from(products)
        .where(eq(products.categoryId, id));
      if (Number(pCount) > 0) {
        res.status(409).json({
          error: `No se puede eliminar "${existingRows[0].name}" porque tiene ${pCount} producto(s) asignado(s).`,
        });
        return;
      }
      await db.delete(categories).where(eq(categories.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete category error:', err);
      res.status(500).json({ error: 'No se pudo eliminar la categoría.' });
    }
  });

  // ── PRODUCTOS E INVENTARIO ────────────────────────────────────────────────
  app.get(
    '/api/products',
    requireAuth,
    requirePermission('view_inventory'),
    async (req: AuthRequest, res: Response) => {
      try {
        await ensureDatabaseSeeded();
        const q = sanitizeString(req.query.q, 100).toLowerCase();
        const category = sanitizeString(req.query.category, 80);
        const categoryId = Number(req.query.category_id);
        const status = sanitizeString(req.query.status, 30);

        const rows = await db
          .select({
            p: products,
            catName: categories.name,
          })
          .from(products)
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .orderBy(asc(products.name));

        const allCats = await db.select().from(categories).orderBy(asc(categories.name));
        const prodCountByCat = new Map<number, number>();
        for (const r of rows) {
          if (r.p.categoryId) {
            prodCountByCat.set(r.p.categoryId, (prodCountByCat.get(r.p.categoryId) ?? 0) + 1);
          }
        }

        const filtered = rows
          .map((r) => serializeProduct(r.p, r.catName))
          .filter((p) => {
            if (q) {
              const hit =
                p.name.toLowerCase().includes(q) ||
                p.sku.toLowerCase().includes(q) ||
                p.barcode.toLowerCase().includes(q) ||
                p.location.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q);
              if (!hit) return false;
            }
            if (Number.isInteger(categoryId) && categoryId > 0) {
              if (p.category_id !== categoryId) return false;
            } else if (category && category !== 'ALL') {
              if (p.category !== category) return false;
            }
            if (status === 'LOW' && !(p.stock_current > 0 && p.stock_current <= p.stock_min)) {
              return false;
            }
            if (status === 'OUT' && p.stock_current !== 0) return false;
            if (status === 'OK' && !(p.stock_current > p.stock_min)) return false;
            return true;
          });

        const categoryList = allCats.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          description: c.description,
          active: c.active,
          created_at: formatPgDate(c.createdAt),
          product_count: prodCountByCat.get(c.id) ?? 0,
        }));

        res.json({
          products: filtered,
          categories: categoryList.filter((c) => c.active === 1).map((c) => c.name),
          categoryList,
        });
      } catch (err) {
        console.error('List products error:', err);
        res.status(500).json({ error: 'No se pudo cargar el inventario.' });
      }
    }
  );

  app.get(
    '/api/products/barcode/:code',
    requireAuth,
    requirePermission('view_inventory'),
    async (req: AuthRequest, res: Response) => {
      const code = sanitizeString(req.params.code, 80);
      if (!code) {
        res.status(400).json({ error: 'Código de barras inválido.' });
        return;
      }
      try {
        const rows = await db
          .select()
          .from(products)
          .where(or(eq(products.barcode, code), ilike(products.sku, code)))
          .limit(1);
        if (!rows[0]) {
          res.status(404).json({ error: `No se encontró ningún producto con el código ${code}.` });
          return;
        }
        res.json({ product: serializeProduct(rows[0]) });
      } catch (err) {
        console.error('Barcode lookup error:', err);
        res.status(500).json({ error: 'Error al buscar el producto por código.' });
      }
    }
  );

  app.post(
    '/api/products',
    requireAuth,
    requirePermission('manage_products'),
    async (req: AuthRequest, res: Response) => {
      const sku = sanitizeString(req.body?.sku, 40).toUpperCase();
      const barcode = sanitizeString(req.body?.barcode, 60) || sku;
      const name = sanitizeString(req.body?.name, 160);
      const description = sanitizeString(req.body?.description, 400);
      const unit = sanitizeString(req.body?.unit, 30) || 'Pza';
      const location = sanitizeString(req.body?.location, 80) || 'Almacén General';
      const stockCurrent = Math.max(0, Math.floor(toNumber(req.body?.stock_current, 0)));
      const stockMin = Math.max(0, Math.floor(toNumber(req.body?.stock_min, 5)));
      const costCurrent = Math.max(0, roundMoney(toNumber(req.body?.cost_current, 0)));
      const marginPercent = Math.max(0, roundMoney(toNumber(req.body?.margin_percent, 30)));
      const explicitPrice = toNumber(req.body?.price_current, -1);
      const priceCurrent =
        explicitPrice >= 0
          ? roundMoney(explicitPrice)
          : roundMoney(costCurrent * (1 + marginPercent / 100));

      if (!sku || !name) {
        res.status(400).json({ error: 'SKU y nombre son obligatorios.' });
        return;
      }

      try {
        const resolvedCat = await resolveCategory(req.body?.category_id, req.body?.category, 'General');
        const [created] = await db
          .insert(products)
          .values({
            sku,
            barcode,
            name,
            description,
            categoryId: resolvedCat.category_id,
            category: resolvedCat.category,
            unit,
            location,
            stockCurrent,
            stockMin,
            costPrevious: costCurrent,
            costCurrent,
            marginPercent,
            priceCurrent,
          })
          .returning();

        res.status(201).json({ product: serializeProduct(created) });
      } catch (err) {
        if (isPgUniqueError(err)) {
          res.status(409).json({ error: 'El SKU o código de barras ya está registrado en otro producto.' });
          return;
        }
        console.error('Create product error:', err);
        res.status(500).json({ error: 'No se pudo guardar el producto.' });
      }
    }
  );

  app.put(
    '/api/products/:id',
    requireAuth,
    requirePermission('manage_products'),
    async (req: AuthRequest, res: Response) => {
      const id = Number(req.params.id);
      try {
        const existingRows = await db.select().from(products).where(eq(products.id, id)).limit(1);
        const existing = existingRows[0];
        if (!existing) {
          res.status(404).json({ error: 'Producto no encontrado.' });
          return;
        }

        const sku = sanitizeString(req.body?.sku, 40).toUpperCase() || existing.sku;
        const barcode = sanitizeString(req.body?.barcode, 60) || existing.barcode;
        const name = sanitizeString(req.body?.name, 160) || existing.name;
        const description =
          req.body?.description !== undefined
            ? sanitizeString(req.body.description, 400)
            : existing.description;
        const resolvedCat = await resolveCategory(
          req.body?.category_id ?? existing.categoryId,
          req.body?.category ?? existing.category,
          existing.category || 'General'
        );
        const unit = sanitizeString(req.body?.unit, 30) || existing.unit;
        const location = sanitizeString(req.body?.location, 80) || existing.location;
        const stockCurrent =
          req.authUser!.role_slug === 'admin' && req.body?.stock_current !== undefined
            ? Math.max(0, Math.floor(toNumber(req.body.stock_current, existing.stockCurrent)))
            : existing.stockCurrent;
        const stockMin = Math.max(0, Math.floor(toNumber(req.body?.stock_min, existing.stockMin)));
        const marginPercent = Math.max(
          0,
          roundMoney(toNumber(req.body?.margin_percent, existing.marginPercent))
        );
        const costCurrent = Math.max(
          0,
          roundMoney(toNumber(req.body?.cost_current, existing.costCurrent))
        );
        const priceCurrent = Math.max(
          0,
          roundMoney(toNumber(req.body?.price_current, existing.priceCurrent))
        );

        const [updated] = await db
          .update(products)
          .set({
            sku,
            barcode,
            name,
            description,
            categoryId: resolvedCat.category_id,
            category: resolvedCat.category,
            unit,
            location,
            stockCurrent,
            stockMin,
            costCurrent,
            marginPercent,
            priceCurrent,
            updatedAt: new Date(),
          })
          .where(eq(products.id, id))
          .returning();

        res.json({ product: serializeProduct(updated) });
      } catch (err) {
        if (isPgUniqueError(err)) {
          res.status(409).json({ error: 'El SKU o código de barras ya pertenece a otro producto.' });
          return;
        }
        console.error('Update product error:', err);
        res.status(500).json({ error: 'Error al actualizar el producto.' });
      }
    }
  );

  app.delete('/api/products/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!existingRows[0]) {
        res.status(404).json({ error: 'Producto no encontrado.' });
        return;
      }

      const [{ movCount }] = await db
        .select({ movCount: count() })
        .from(movements)
        .where(eq(movements.productId, id));
      const [{ ordCount }] = await db
        .select({ ordCount: count() })
        .from(orderItems)
        .where(eq(orderItems.productId, id));

      if (Number(movCount) > 0 || Number(ordCount) > 0) {
        res.status(409).json({
          error: `No se puede eliminar "${existingRows[0].name}" porque tiene ${movCount} movimiento(s) y ${ordCount} línea(s) de pedido asociadas.`,
        });
        return;
      }

      await db.delete(products).where(eq(products.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete product error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el producto.' });
    }
  });

  // ── MOVIMIENTOS: INGRESOS Y SALIDAS MULTIPRODUCTO ─────────────────────────
  app.get(
    '/api/movements',
    requireAuth,
    requirePermission('view_inventory'),
    async (req: AuthRequest, res: Response) => {
      try {
        await ensureDatabaseSeeded();
        const type = sanitizeString(req.query.type, 20).toUpperCase();
        const q = sanitizeString(req.query.q, 100).toLowerCase();
        const month = sanitizeString(req.query.month, 2);
        const year = sanitizeString(req.query.year, 4);

        const rows = await db
          .select({
            m: movements,
            sku: products.sku,
            barcode: products.barcode,
            productName: products.name,
            unit: products.unit,
            category: products.category,
            operatorName: users.name,
            operatorRole: roles.name,
            sectorName: sectors.name,
            personnelName: personnel.name,
          })
          .from(movements)
          .innerJoin(products, eq(movements.productId, products.id))
          .leftJoin(users, eq(movements.userId, users.id))
          .leftJoin(roles, eq(users.roleId, roles.id))
          .leftJoin(sectors, eq(movements.sectorId, sectors.id))
          .leftJoin(personnel, eq(movements.personnelId, personnel.id))
          .orderBy(desc(movements.createdAt), desc(movements.id))
          .limit(300);

        const filtered = rows.map(serializeMovement).filter((m) => {
          if ((type === 'INGRESO' || type === 'SALIDA') && m.type !== type) return false;
          if (year) {
            const d = new Date(m.created_at);
            if (String(d.getUTCFullYear()) !== year) return false;
            if (month && String(d.getUTCMonth() + 1).padStart(2, '0') !== month.padStart(2, '0')) {
              return false;
            }
          }
          if (q) {
            const hit =
              m.folio.toLowerCase().includes(q) ||
              m.product_name.toLowerCase().includes(q) ||
              m.barcode.toLowerCase().includes(q) ||
              m.responsible_name.toLowerCase().includes(q) ||
              m.responsible_area.toLowerCase().includes(q) ||
              m.reason_detail.toLowerCase().includes(q);
            if (!hit) return false;
          }
          return true;
        });

        res.json({ movements: filtered.slice(0, 200) });
      } catch (err) {
        console.error('List movements error:', err);
        res.status(500).json({ error: 'No se pudo cargar el historial de movimientos.' });
      }
    }
  );

  // Get all items belonging to a multi-product exit folio / batch
  app.get(
    '/api/movements/exit-batch/:idOrFolio',
    requireAuth,
    requirePermission('view_inventory'),
    async (req: AuthRequest, res: Response) => {
      const param = sanitizeString(req.params.idOrFolio, 60);
      if (!param) {
        res.status(400).json({ error: 'Folio o lote inválido.' });
        return;
      }

      try {
        const numericId = Number(param);
        const batchRows =
          Number.isInteger(numericId) && numericId > 0
            ? await db.select().from(exitBatches).where(eq(exitBatches.id, numericId)).limit(1)
            : await db.select().from(exitBatches).where(eq(exitBatches.folio, param)).limit(1);

        const batch = batchRows[0];
        const movRows = await db
          .select({
            m: movements,
            sku: products.sku,
            barcode: products.barcode,
            productName: products.name,
            unit: products.unit,
            category: products.category,
            operatorName: users.name,
            operatorRole: roles.name,
            sectorName: sectors.name,
            personnelName: personnel.name,
          })
          .from(movements)
          .innerJoin(products, eq(movements.productId, products.id))
          .leftJoin(users, eq(movements.userId, users.id))
          .leftJoin(roles, eq(users.roleId, roles.id))
          .leftJoin(sectors, eq(movements.sectorId, sectors.id))
          .leftJoin(personnel, eq(movements.personnelId, personnel.id))
          .where(
            batch
              ? or(eq(movements.exitBatchId, batch.id), eq(movements.folio, batch.folio))
              : eq(movements.folio, param)
          )
          .orderBy(asc(movements.id));

        if (movRows.length === 0) {
          res.status(404).json({ error: 'Comprobante de salida no encontrado.' });
          return;
        }

        const serializedItems = movRows.map(serializeMovement);
        res.json({
          batch: batch
            ? {
                id: batch.id,
                folio: batch.folio,
                personnel_id: batch.personnelId,
                sector_id: batch.sectorId,
                responsible_name: batch.responsibleName,
                responsible_area: batch.responsibleArea,
                reason_detail: batch.reasonDetail,
                total_value: batch.totalValue,
                created_at: formatPgDate(batch.createdAt),
              }
            : null,
          items: serializedItems,
        });
      } catch (err) {
        console.error('Get exit batch error:', err);
        res.status(500).json({ error: 'No se pudo cargar el detalle de la salida.' });
      }
    }
  );

  app.post(
    '/api/movements/entry',
    requireAuth,
    requirePermission('register_entry'),
    async (req: AuthRequest, res: Response) => {
      const productId = Number(req.body?.product_id);
      const quantity = Math.floor(toNumber(req.body?.quantity, 0));
      const costEntry = roundMoney(toNumber(req.body?.cost_entry, -1));
      const marginOverride =
        req.body?.margin_percent !== undefined ? roundMoney(toNumber(req.body.margin_percent, 0)) : null;
      const customNewPrice =
        req.body?.new_price !== undefined && req.body?.new_price !== '' && req.body?.new_price !== null
          ? roundMoney(toNumber(req.body.new_price, -1))
          : null;
      const responsibleName = sanitizeString(req.body?.responsible_name, 120) || req.authUser!.name;
      const responsibleArea = sanitizeString(req.body?.responsible_area, 120) || 'Compras / Proveedor';
      const reasonDetail = sanitizeString(req.body?.reason_detail, 300) || 'Ingreso de mercancía al almacén';

      if (!productId || quantity <= 0 || costEntry < 0) {
        res.status(400).json({
          error: 'Selecciona un producto, una cantidad mayor a 0 y un costo de ingreso válido.',
        });
        return;
      }

      try {
        const result = await db.transaction(async (tx) => {
          const prodRows = await tx
            .select()
            .from(products)
            .where(eq(products.id, productId))
            .limit(1);
          const product = prodRows[0];
          if (!product) {
            return { notFound: true as const };
          }

          const oldStock = product.stockCurrent;
          const oldCost = product.costCurrent;
          const oldPrice = product.priceCurrent;
          const newStock = oldStock + quantity;

          const weightedCost =
            oldStock > 0
              ? roundMoney((oldStock * oldCost + quantity * costEntry) / newStock)
              : roundMoney(costEntry);

          const activeMargin =
            marginOverride !== null && marginOverride >= 0 ? marginOverride : product.marginPercent;
          const newPrice =
            customNewPrice !== null && customNewPrice >= 0
              ? customNewPrice
              : roundMoney(weightedCost * (1 + activeMargin / 100));

          const resultingMargin =
            weightedCost > 0
              ? roundMoney(((newPrice - weightedCost) / weightedCost) * 100)
              : activeMargin;

          const folio = await generateNextFolio(tx, 'ING');
          const totalValue = roundMoney(quantity * costEntry);

          const [updatedProd] = await tx
            .update(products)
            .set({
              stockCurrent: newStock,
              costPrevious: oldCost,
              costCurrent: weightedCost,
              marginPercent: resultingMargin,
              priceCurrent: newPrice,
              updatedAt: new Date(),
            })
            .where(eq(products.id, productId))
            .returning();

          const [insertedMov] = await tx
            .insert(movements)
            .values({
              folio,
              type: 'INGRESO',
              productId,
              quantity,
              costPrevious: oldCost,
              costEntry,
              costResulting: weightedCost,
              pricePrevious: oldPrice,
              priceResulting: newPrice,
              totalValue,
              responsibleName,
              responsibleArea,
              reasonDetail,
              userId: req.authUser!.id,
            })
            .returning();

          return { notFound: false as const, movId: insertedMov.id, updatedProd };
        });

        if (result.notFound) {
          res.status(404).json({ error: 'Producto no encontrado.' });
          return;
        }

        const movement = await fetchMovementById(result.movId);
        res.status(201).json({ movement, product: serializeProduct(result.updatedProd) });
      } catch (err) {
        console.error('Entry movement error:', err);
        res.status(500).json({ error: 'No se pudo registrar el ingreso.' });
      }
    }
  );

  // Multi-product exit dispatch (also backward-compatible with single { product_id, quantity })
  app.post(
    '/api/movements/exit',
    requireAuth,
    requirePermission('register_exit'),
    async (req: AuthRequest, res: Response) => {
      const rawItems = Array.isArray(req.body?.items)
        ? req.body.items
        : req.body?.product_id
          ? [{ product_id: req.body.product_id, quantity: req.body.quantity }]
          : [];

      const rawPersonnelId = Number(req.body?.personnel_id);
      const personnelId = Number.isInteger(rawPersonnelId) && rawPersonnelId > 0 ? rawPersonnelId : null;
      const rawSectorId = Number(req.body?.sector_id);
      let sectorId = Number.isInteger(rawSectorId) && rawSectorId > 0 ? rawSectorId : null;

      let responsibleName = sanitizeString(req.body?.responsible_name, 120);
      let responsibleArea = sanitizeString(req.body?.responsible_area, 120);
      const reasonDetail = sanitizeString(req.body?.reason_detail, 400);

      // Aggregate quantities by product_id to validate total stock cleanly
      const qtyByProduct = new Map<number, number>();
      for (const item of rawItems) {
        const pid = Number(item?.product_id);
        const qty = Math.floor(toNumber(item?.quantity, 0));
        if (!pid || qty <= 0) continue;
        qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty);
      }

      if (qtyByProduct.size === 0) {
        res.status(400).json({ error: 'Agrega al menos un producto con cantidad válida mayor a 0.' });
        return;
      }

      if (!reasonDetail) {
        res.status(400).json({ error: 'Debes indicar el detalle o motivo de la salida.' });
        return;
      }

      try {
        if (personnelId) {
          const pRows = await db
            .select({ p: personnel, sectorName: sectors.name })
            .from(personnel)
            .innerJoin(sectors, eq(personnel.sectorId, sectors.id))
            .where(eq(personnel.id, personnelId))
            .limit(1);
          if (!pRows[0]) {
            res.status(400).json({ error: 'El trabajador seleccionado no existe.' });
            return;
          }
          if (!responsibleName) responsibleName = pRows[0].p.name;
          if (!sectorId) sectorId = pRows[0].p.sectorId;
          if (!responsibleArea) responsibleArea = pRows[0].sectorName;
        }

        if (sectorId && !responsibleArea) {
          const sRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
          if (sRows[0]) responsibleArea = sRows[0].name;
        }

        if (!responsibleName) {
          res.status(400).json({ error: 'Selecciona el personal responsable o ingresa su nombre.' });
          return;
        }

        const finalArea = responsibleArea || 'Operaciones';

        const outcome = await db.transaction(async (tx) => {
          const lineData: Array<{
            product: typeof products.$inferSelect;
            quantity: number;
            totalValue: number;
          }> = [];
          let batchTotalValue = 0;

          for (const [pid, qty] of qtyByProduct.entries()) {
            const prodRows = await tx
              .select()
              .from(products)
              .where(eq(products.id, pid))
              .limit(1);
            const product = prodRows[0];
            if (!product) {
              return { errorStatus: 404 as const, errorMsg: `Producto #${pid} no encontrado.` };
            }
            if (product.stockCurrent < qty) {
              return {
                errorStatus: 400 as const,
                errorMsg: `Stock insuficiente para "${product.name}". Disponible: ${product.stockCurrent}, solicitado: ${qty}.`,
              };
            }
            const totalValue = roundMoney(qty * product.costCurrent);
            batchTotalValue = roundMoney(batchTotalValue + totalValue);
            lineData.push({ product, quantity: qty, totalValue });
          }

          const folio = await generateNextFolio(tx, 'SAL');
          const [batch] = await tx
            .insert(exitBatches)
            .values({
              folio,
              personnelId,
              sectorId,
              responsibleName,
              responsibleArea: finalArea,
              reasonDetail,
              userId: req.authUser!.id,
              totalValue: batchTotalValue,
            })
            .returning();

          const insertedIds: number[] = [];
          for (const line of lineData) {
            await tx
              .update(products)
              .set({
                stockCurrent: line.product.stockCurrent - line.quantity,
                updatedAt: new Date(),
              })
              .where(eq(products.id, line.product.id));

            const [mov] = await tx
              .insert(movements)
              .values({
                folio,
                type: 'SALIDA',
                productId: line.product.id,
                quantity: line.quantity,
                costPrevious: line.product.costCurrent,
                costEntry: line.product.costCurrent,
                costResulting: line.product.costCurrent,
                pricePrevious: line.product.priceCurrent,
                priceResulting: line.product.priceCurrent,
                totalValue: line.totalValue,
                personnelId,
                sectorId,
                responsibleName,
                responsibleArea: finalArea,
                reasonDetail,
                exitBatchId: batch.id,
                userId: req.authUser!.id,
              })
              .returning();
            insertedIds.push(mov.id);
          }

          return { errorStatus: null, batch, insertedIds };
        });

        if (outcome.errorStatus) {
          res.status(outcome.errorStatus).json({ error: outcome.errorMsg });
          return;
        }

        const createdMovements = [];
        for (const id of outcome.insertedIds) {
          const m = await fetchMovementById(id);
          if (m) createdMovements.push(m);
        }

        res.status(201).json({
          batch: {
            id: outcome.batch.id,
            folio: outcome.batch.folio,
            personnel_id: outcome.batch.personnelId,
            sector_id: outcome.batch.sectorId,
            responsible_name: outcome.batch.responsibleName,
            responsible_area: outcome.batch.responsibleArea,
            reason_detail: outcome.batch.reasonDetail,
            total_value: outcome.batch.totalValue,
            created_at: formatPgDate(outcome.batch.createdAt),
          },
          movement: createdMovements[0],
          movements: createdMovements,
        });
      } catch (err) {
        console.error('Exit movement error:', err);
        res.status(500).json({ error: 'No se pudo registrar la salida.' });
      }
    }
  );

  // Admin CRUD: Editar y Eliminar movimientos
  app.put('/api/movements/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const existingRows = await db.select().from(movements).where(eq(movements.id, id)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Movimiento no encontrado.' });
        return;
      }

      const folio = sanitizeString(req.body?.folio, 40).toUpperCase() || existing.folio;
      const responsibleName =
        req.body?.responsible_name !== undefined
          ? sanitizeString(req.body.responsible_name, 120)
          : existing.responsibleName;
      const responsibleArea =
        req.body?.responsible_area !== undefined
          ? sanitizeString(req.body.responsible_area, 120)
          : existing.responsibleArea;
      const reasonDetail =
        req.body?.reason_detail !== undefined
          ? sanitizeString(req.body.reason_detail, 400)
          : existing.reasonDetail;

      await db
        .update(movements)
        .set({ folio, responsibleName, responsibleArea, reasonDetail })
        .where(eq(movements.id, id));

      const updated = await fetchMovementById(id);
      res.json({ movement: updated });
    } catch (err) {
      console.error('Update movement error:', err);
      res.status(500).json({ error: 'No se pudo actualizar el movimiento.' });
    }
  });

  app.delete('/api/movements/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
      const result = await db.transaction(async (tx) => {
        const movRows = await tx.select().from(movements).where(eq(movements.id, id)).limit(1);
        const mov = movRows[0];
        if (!mov) {
          return { errorStatus: 404 as const, errorMsg: 'Movimiento no encontrado.' };
        }

        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, mov.productId))
          .limit(1);
        const prod = prodRows[0];

        if (prod) {
          const delta = mov.type === 'INGRESO' ? -mov.quantity : mov.quantity;
          const nextStock = prod.stockCurrent + delta;
          if (nextStock < 0) {
            return {
              errorStatus: 409 as const,
              errorMsg: `No se puede eliminar este ingreso porque el stock actual (${prod.stockCurrent}) quedaría negativo al revertir ${mov.quantity} unidades.`,
            };
          }
          await tx
            .update(products)
            .set({ stockCurrent: nextStock, updatedAt: new Date() })
            .where(eq(products.id, prod.id));
        }

        await tx.delete(movements).where(eq(movements.id, id));

        if (mov.exitBatchId) {
          const [{ remaining }] = await tx
            .select({ remaining: count() })
            .from(movements)
            .where(eq(movements.exitBatchId, mov.exitBatchId));
          if (Number(remaining) === 0) {
            await tx.delete(exitBatches).where(eq(exitBatches.id, mov.exitBatchId));
          }
        }

        return { errorStatus: null };
      });

      if (result.errorStatus) {
        res.status(result.errorStatus).json({ error: result.errorMsg });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete movement error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el movimiento.' });
    }
  });

  // ── PEDIDOS DE ALMACÉN (MULTIPRODUCTO + PERSONAL Y SECTOR) ────────────────
  app.get('/api/orders', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await ensureDatabaseSeeded();
      const canSeeAll =
        req.authUser!.permissions.approve_orders || req.authUser!.permissions.register_exit;

      const orderRows = await db
        .select({
          o: orders,
          personnelName: personnel.name,
          sectorName: sectors.name,
        })
        .from(orders)
        .leftJoin(personnel, eq(orders.personnelId, personnel.id))
        .leftJoin(sectors, eq(orders.sectorId, sectors.id))
        .where(canSeeAll ? undefined : eq(orders.requesterId, req.authUser!.id))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(100);

      const allItems = await db
        .select({
          oi: orderItems,
          sku: products.sku,
          barcode: products.barcode,
          productName: products.name,
          unit: products.unit,
          stockCurrent: products.stockCurrent,
          costCurrent: products.costCurrent,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .orderBy(asc(orderItems.id));

      const itemsByOrder = new Map<number, Array<Record<string, unknown>>>();
      for (const row of allItems) {
        const list = itemsByOrder.get(row.oi.orderId) ?? [];
        list.push({
          id: row.oi.id,
          order_id: row.oi.orderId,
          product_id: row.oi.productId,
          quantity_requested: row.oi.quantityRequested,
          quantity_approved: row.oi.quantityApproved,
          sku: row.sku,
          barcode: row.barcode,
          product_name: row.productName,
          unit: row.unit,
          stock_current: row.stockCurrent,
          cost_current: row.costCurrent,
        });
        itemsByOrder.set(row.oi.orderId, list);
      }

      const enriched = orderRows.map(({ o, personnelName, sectorName }) => ({
        id: o.id,
        folio: o.folio,
        requester_id: o.requesterId,
        requester_name: o.requesterName,
        personnel_id: o.personnelId,
        sector_id: o.sectorId,
        personnel_name: personnelName || o.requesterName,
        sector_name: sectorName || o.department,
        department: sectorName || o.department,
        priority: o.priority,
        status: o.status,
        notes: o.notes,
        reviewed_by: o.reviewedBy,
        reviewed_at: formatPgDate(o.reviewedAt) || null,
        review_notes: o.reviewNotes,
        dispatched_by: o.dispatchedBy,
        dispatched_at: formatPgDate(o.dispatchedAt) || null,
        created_at: formatPgDate(o.createdAt),
        items: itemsByOrder.get(o.id) ?? [],
      }));

      res.json({ orders: enriched });
    } catch (err) {
      console.error('List orders error:', err);
      res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
    }
  });

  app.post(
    '/api/orders',
    requireAuth,
    requirePermission('request_order'),
    async (req: AuthRequest, res: Response) => {
      const rawPersonnelId = Number(req.body?.personnel_id);
      const personnelId = Number.isInteger(rawPersonnelId) && rawPersonnelId > 0 ? rawPersonnelId : null;
      const rawSectorId = Number(req.body?.sector_id);
      let sectorId = Number.isInteger(rawSectorId) && rawSectorId > 0 ? rawSectorId : null;

      let requesterName = sanitizeString(req.body?.requester_name, 120) || req.authUser!.name;
      let department = sanitizeString(req.body?.department, 120) || req.authUser!.department;
      const priority = req.body?.priority === 'Urgente' ? 'Urgente' : 'Normal';
      const notes = sanitizeString(req.body?.notes, 400);
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

      // Merge duplicate products in the same request cleanly
      const qtyByProd = new Map<number, number>();
      for (const item of rawItems) {
        const pid = Number(item?.product_id);
        const qty = Math.floor(toNumber(item?.quantity, 0));
        if (!pid || qty <= 0) continue;
        qtyByProd.set(pid, (qtyByProd.get(pid) ?? 0) + qty);
      }

      if (qtyByProd.size === 0) {
        res.status(400).json({ error: 'Agrega al menos un producto válido al pedido.' });
        return;
      }

      try {
        if (personnelId) {
          const pRows = await db
            .select({ p: personnel, sectorName: sectors.name })
            .from(personnel)
            .innerJoin(sectors, eq(personnel.sectorId, sectors.id))
            .where(eq(personnel.id, personnelId))
            .limit(1);
          if (pRows[0]) {
            requesterName = pRows[0].p.name;
            if (!sectorId) sectorId = pRows[0].p.sectorId;
            department = pRows[0].sectorName;
          }
        } else if (sectorId) {
          const sRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
          if (sRows[0]) department = sRows[0].name;
        }

        const created = await db.transaction(async (tx) => {
          const folio = await generateNextFolio(tx, 'PED');
          const [ord] = await tx
            .insert(orders)
            .values({
              folio,
              requesterId: req.authUser!.id,
              requesterName,
              personnelId,
              sectorId,
              department,
              priority,
              status: 'Pendiente',
              notes,
            })
            .returning();

          let validCount = 0;
          for (const [pid, qty] of qtyByProd.entries()) {
            const exists = await tx
              .select({ id: products.id })
              .from(products)
              .where(eq(products.id, pid))
              .limit(1);
            if (exists.length === 0) continue;
            await tx.insert(orderItems).values({
              orderId: ord.id,
              productId: pid,
              quantityRequested: qty,
              quantityApproved: 0,
            });
            validCount++;
          }

          if (validCount === 0) {
            throw new Error('INVALID_ITEMS');
          }
          return ord;
        });

        res.status(201).json({ id: created.id, folio: created.folio });
      } catch (err) {
        if (err instanceof Error && err.message === 'INVALID_ITEMS') {
          res.status(400).json({ error: 'Los artículos del pedido no son válidos.' });
          return;
        }
        console.error('Create order error:', err);
        res.status(500).json({ error: 'No se pudo crear la solicitud de pedido.' });
      }
    }
  );

  app.post(
    '/api/orders/:id/review',
    requireAuth,
    requirePermission('approve_orders'),
    async (req: AuthRequest, res: Response) => {
      const orderId = Number(req.params.id);
      const decision = req.body?.decision === 'Aprobado' ? 'Aprobado' : 'Rechazado';
      const reviewNotes = sanitizeString(req.body?.review_notes, 300);

      try {
        const result = await db.transaction(async (tx) => {
          const existingRows = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1);
          const order = existingRows[0];
          if (!order) return { errorStatus: 404 as const, errorMsg: 'Pedido no encontrado.' };
          if (order.status !== 'Pendiente') {
            return {
              errorStatus: 400 as const,
              errorMsg: 'Solo se pueden revisar pedidos en estado Pendiente.',
            };
          }

          await tx
            .update(orders)
            .set({
              status: decision,
              reviewedBy: req.authUser!.name,
              reviewedAt: new Date(),
              reviewNotes,
            })
            .where(eq(orders.id, orderId));

          if (decision === 'Aprobado') {
            await tx
              .update(orderItems)
              .set({ quantityApproved: sql`${orderItems.quantityRequested}` })
              .where(eq(orderItems.orderId, orderId));
          }
          return { errorStatus: null };
        });

        if (result.errorStatus) {
          res.status(result.errorStatus).json({ error: result.errorMsg });
          return;
        }
        res.json({ ok: true, status: decision });
      } catch (err) {
        console.error('Review order error:', err);
        res.status(500).json({ error: 'No se pudo actualizar la autorización del pedido.' });
      }
    }
  );

  app.post(
    '/api/orders/:id/dispatch',
    requireAuth,
    requirePermission('register_exit'),
    async (req: AuthRequest, res: Response) => {
      const orderId = Number(req.params.id);
      const responsibleOverride = sanitizeString(req.body?.responsible_name, 120);

      try {
        const outcome = await db.transaction(async (tx) => {
          const orderRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
          const order = orderRows[0];
          if (!order) return { errorStatus: 404 as const, errorMsg: 'Pedido no encontrado.' };
          if (order.status !== 'Aprobado') {
            return {
              errorStatus: 400 as const,
              errorMsg: 'El pedido debe estar Autorizado antes de despachar la salida.',
            };
          }

          const items = await tx
            .select({
              oi: orderItems,
              product: products,
            })
            .from(orderItems)
            .innerJoin(products, eq(orderItems.productId, products.id))
            .where(eq(orderItems.orderId, orderId));

          let batchTotalValue = 0;
          for (const row of items) {
            const qty =
              row.oi.quantityApproved > 0 ? row.oi.quantityApproved : row.oi.quantityRequested;
            if (row.product.stockCurrent < qty) {
              return {
                errorStatus: 400 as const,
                errorMsg: `Stock insuficiente para "${row.product.name}". Disponible: ${row.product.stockCurrent}, requerido: ${qty}.`,
              };
            }
            batchTotalValue = roundMoney(batchTotalValue + qty * row.product.costCurrent);
          }

          const folio = await generateNextFolio(tx, 'SAL');
          const responsibleName = responsibleOverride || order.requesterName;
          const detail = `Despacho de pedido autorizado ${order.folio}${order.notes ? ` — ${order.notes}` : ''}`;

          const [batch] = await tx
            .insert(exitBatches)
            .values({
              folio,
              personnelId: order.personnelId,
              sectorId: order.sectorId,
              responsibleName,
              responsibleArea: order.department,
              reasonDetail: detail,
              orderId,
              userId: req.authUser!.id,
              totalValue: batchTotalValue,
            })
            .returning();

          const createdMovIds: number[] = [];
          for (const row of items) {
            const qty =
              row.oi.quantityApproved > 0 ? row.oi.quantityApproved : row.oi.quantityRequested;
            const totalValue = roundMoney(qty * row.product.costCurrent);

            await tx
              .update(products)
              .set({
                stockCurrent: row.product.stockCurrent - qty,
                updatedAt: new Date(),
              })
              .where(eq(products.id, row.product.id));

            const [mov] = await tx
              .insert(movements)
              .values({
                folio,
                type: 'SALIDA',
                productId: row.product.id,
                quantity: qty,
                costPrevious: row.product.costCurrent,
                costEntry: row.product.costCurrent,
                costResulting: row.product.costCurrent,
                pricePrevious: row.product.priceCurrent,
                priceResulting: row.product.priceCurrent,
                totalValue,
                personnelId: order.personnelId,
                sectorId: order.sectorId,
                responsibleName,
                responsibleArea: order.department,
                reasonDetail: detail,
                exitBatchId: batch.id,
                orderId,
                userId: req.authUser!.id,
              })
              .returning();
            createdMovIds.push(mov.id);
          }

          await tx
            .update(orders)
            .set({
              status: 'Despachado',
              dispatchedBy: req.authUser!.name,
              dispatchedAt: new Date(),
            })
            .where(eq(orders.id, orderId));

          return { errorStatus: null, batch, createdMovIds };
        });

        if (outcome.errorStatus) {
          res.status(outcome.errorStatus).json({ error: outcome.errorMsg });
          return;
        }

        const createdMovements = [];
        for (const id of outcome.createdMovIds) {
          const m = await fetchMovementById(id);
          if (m) createdMovements.push(m);
        }

        res.json({
          ok: true,
          batch: {
            id: outcome.batch.id,
            folio: outcome.batch.folio,
            responsible_name: outcome.batch.responsibleName,
            responsible_area: outcome.batch.responsibleArea,
            reason_detail: outcome.batch.reasonDetail,
            total_value: outcome.batch.totalValue,
            created_at: formatPgDate(outcome.batch.createdAt),
          },
          movements: createdMovements,
        });
      } catch (err) {
        console.error('Dispatch order error:', err);
        res.status(500).json({ error: 'No se pudo despachar el pedido.' });
      }
    }
  );

  app.put('/api/orders/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const orderId = Number(req.params.id);
    try {
      const existingRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Pedido no encontrado.' });
        return;
      }

      const department = sanitizeString(req.body?.department, 120) || existing.department;
      const priority =
        req.body?.priority === 'Urgente'
          ? 'Urgente'
          : req.body?.priority === 'Normal'
            ? 'Normal'
            : existing.priority;
      const validStatuses = new Set(['Pendiente', 'Aprobado', 'Rechazado', 'Despachado']);
      const status = validStatuses.has(String(req.body?.status))
        ? String(req.body.status)
        : existing.status;
      const notes =
        req.body?.notes !== undefined ? sanitizeString(req.body.notes, 400) : existing.notes;
      const reviewNotes =
        req.body?.review_notes !== undefined
          ? sanitizeString(req.body.review_notes, 300)
          : existing.reviewNotes || '';

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ department, priority, status, notes, reviewNotes })
          .where(eq(orders.id, orderId));

        if (Array.isArray(req.body?.items) && req.body.items.length > 0) {
          await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
          for (const item of req.body.items) {
            const pid = Number(item?.product_id);
            const qtyReq = Math.floor(toNumber(item?.quantity_requested ?? item?.quantity, 0));
            const qtyApp = Math.max(
              0,
              Math.floor(
                toNumber(
                  item?.quantity_approved,
                  status === 'Aprobado' || status === 'Despachado' ? qtyReq : 0
                )
              )
            );
            if (!pid || qtyReq <= 0) continue;
            await tx.insert(orderItems).values({
              orderId,
              productId: pid,
              quantityRequested: qtyReq,
              quantityApproved: qtyApp,
            });
          }
        }
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('Update order error:', err);
      res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
    }
  });

  app.delete('/api/orders/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const orderId = Number(req.params.id);
    try {
      const existing = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!existing[0]) {
        res.status(404).json({ error: 'Pedido no encontrado.' });
        return;
      }

      await db.transaction(async (tx) => {
        await tx.update(movements).set({ orderId: null }).where(eq(movements.orderId, orderId));
        await tx.update(exitBatches).set({ orderId: null }).where(eq(exitBatches.orderId, orderId));
        await tx.delete(orders).where(eq(orders.id, orderId));
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete order error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el pedido.' });
    }
  });

  // ── REPORTES MENSUALES, ANUALES, POR USUARIO Y POR CATEGORÍA ──────────────
  app.get(
    '/api/reports/summary',
    requireAuth,
    requirePermission('view_reports'),
    async (req: AuthRequest, res: Response) => {
      try {
        await ensureDatabaseSeeded();
        const mode = req.query.mode === 'annual' ? 'annual' : 'monthly';
        const yearNum = Number(sanitizeString(req.query.year, 4)) || new Date().getFullYear();
        const year = String(yearNum);
        const monthNum =
          Number(sanitizeString(req.query.month, 2)) || new Date().getMonth() + 1;
        const month = String(monthNum).padStart(2, '0');

        const rawUserId = Number(req.query.user_id);
        const userId = Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : null;

        const rawCategoryId = Number(req.query.category_id);
        const categoryId = Number.isInteger(rawCategoryId) && rawCategoryId > 0 ? rawCategoryId : null;

        const periodStart =
          mode === 'annual'
            ? new Date(Date.UTC(yearNum, 0, 1, 0, 0, 0))
            : new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0));
        const periodEnd =
          mode === 'annual'
            ? new Date(Date.UTC(yearNum, 11, 31, 23, 59, 59, 999))
            : new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));

        const [allCats, allProds, allUsersRows, allOrders, periodMovRows] = await Promise.all([
          db.select().from(categories).orderBy(asc(categories.name)),
          db.select().from(products).orderBy(asc(products.name)),
          db
            .select({ u: users, roleName: roles.name, roleSlug: roles.slug })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .orderBy(asc(users.name)),
          db.select({ requesterId: orders.requesterId }).from(orders),
          db
            .select({
              m: movements,
              sku: products.sku,
              barcode: products.barcode,
              productName: products.name,
              unit: products.unit,
              prodCategoryId: products.categoryId,
              prodCategory: products.category,
              operatorName: users.name,
              operatorRole: roles.name,
              sectorName: sectors.name,
              personnelName: personnel.name,
            })
            .from(movements)
            .innerJoin(products, eq(movements.productId, products.id))
            .leftJoin(users, eq(movements.userId, users.id))
            .leftJoin(roles, eq(users.roleId, roles.id))
            .leftJoin(sectors, eq(movements.sectorId, sectors.id))
            .leftJoin(personnel, eq(movements.personnelId, personnel.id))
            .where(and(gte(movements.createdAt, periodStart), lte(movements.createdAt, periodEnd)))
            .orderBy(desc(movements.createdAt), desc(movements.id)),
        ]);

        const catNameById = new Map(allCats.map((c) => [c.id, c.name]));

        // Filtered movements for Totals, Breakdown, and Movement Details
        const filteredMovRows = periodMovRows.filter((r) => {
          if (userId !== null && r.m.userId !== userId) return false;
          if (categoryId !== null && r.prodCategoryId !== categoryId) return false;
          return true;
        });

        const totals = {
          total_movements: filteredMovRows.length,
          ingreso_count: 0,
          salida_count: 0,
          ingreso_units: 0,
          salida_units: 0,
          ingreso_value: 0,
          salida_value: 0,
        };

        const breakdownMap = new Map<
          string,
          {
            period_key: string;
            ingreso_count: number;
            salida_count: number;
            ingreso_units: number;
            salida_units: number;
            ingreso_value: number;
            salida_value: number;
          }
        >();

        for (const r of filteredMovRows) {
          const { m } = r;
          const d = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
          const periodKey =
            mode === 'annual'
              ? String(d.getUTCMonth() + 1).padStart(2, '0')
              : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

          const b = breakdownMap.get(periodKey) || {
            period_key: periodKey,
            ingreso_count: 0,
            salida_count: 0,
            ingreso_units: 0,
            salida_units: 0,
            ingreso_value: 0,
            salida_value: 0,
          };

          if (m.type === 'INGRESO') {
            totals.ingreso_count++;
            totals.ingreso_units += m.quantity;
            totals.ingreso_value = roundMoney(totals.ingreso_value + m.totalValue);
            b.ingreso_count++;
            b.ingreso_units += m.quantity;
            b.ingreso_value = roundMoney(b.ingreso_value + m.totalValue);
          } else {
            totals.salida_count++;
            totals.salida_units += m.quantity;
            totals.salida_value = roundMoney(totals.salida_value + m.totalValue);
            b.salida_count++;
            b.salida_units += m.quantity;
            b.salida_value = roundMoney(b.salida_value + m.totalValue);
          }
          breakdownMap.set(periodKey, b);
        }

        const breakdown = Array.from(breakdownMap.values()).sort((a, b) =>
          a.period_key.localeCompare(b.period_key)
        );

        // Top products (filtered by categoryId, movement stats filtered by userId + period)
        const prodStatsMap = new Map<number, { inQty: number; outQty: number; val: number }>();
        for (const r of periodMovRows) {
          if (userId !== null && r.m.userId !== userId) continue;
          const st = prodStatsMap.get(r.m.productId) || { inQty: 0, outQty: 0, val: 0 };
          if (r.m.type === 'INGRESO') st.inQty += r.m.quantity;
          else st.outQty += r.m.quantity;
          st.val = roundMoney(st.val + r.m.totalValue);
          prodStatsMap.set(r.m.productId, st);
        }

        const topProducts = allProds
          .filter((p) => (categoryId !== null ? p.categoryId === categoryId : true))
          .map((p) => {
            const st = prodStatsMap.get(p.id) || { inQty: 0, outQty: 0, val: 0 };
            const resolvedCatName =
              (p.categoryId ? catNameById.get(p.categoryId) : undefined) || p.category;
            return {
              ...serializeProduct(p, resolvedCatName),
              total_in: st.inQty,
              total_out: st.outQty,
              total_value: st.val,
            };
          })
          .sort(
            (a, b) =>
              b.total_in + b.total_out - (a.total_in + a.total_out) || a.name.localeCompare(b.name)
          );

        // Category report
        const categoryReport = allCats
          .filter((c) => (categoryId !== null ? c.id === categoryId : true))
          .map((c) => {
            const catProds = allProds.filter((p) => p.categoryId === c.id);
            const stockUnits = catProds.reduce((acc, p) => acc + p.stockCurrent, 0);
            const invCost = roundMoney(
              catProds.reduce((acc, p) => acc + p.stockCurrent * p.costCurrent, 0)
            );
            const invSale = roundMoney(
              catProds.reduce((acc, p) => acc + p.stockCurrent * p.priceCurrent, 0)
            );

            let totalMovs = 0;
            let inUnits = 0;
            let outUnits = 0;
            let inVal = 0;
            let outVal = 0;
            for (const r of periodMovRows) {
              if (userId !== null && r.m.userId !== userId) continue;
              if (r.prodCategoryId !== c.id) continue;
              totalMovs++;
              if (r.m.type === 'INGRESO') {
                inUnits += r.m.quantity;
                inVal = roundMoney(inVal + r.m.totalValue);
              } else {
                outUnits += r.m.quantity;
                outVal = roundMoney(outVal + r.m.totalValue);
              }
            }

            return {
              id: c.id,
              code: c.code,
              name: c.name,
              product_count: catProds.length,
              stock_units: stockUnits,
              inventory_cost_value: invCost,
              inventory_sale_value: invSale,
              total_movements: totalMovs,
              ingreso_units: inUnits,
              salida_units: outUnits,
              ingreso_value: inVal,
              salida_value: outVal,
            };
          })
          .sort(
            (a, b) =>
              b.ingreso_value + b.salida_value - (a.ingreso_value + a.salida_value) ||
              a.name.localeCompare(b.name)
          );

        // User report
        const ordersByUser = new Map<number, number>();
        for (const o of allOrders) {
          ordersByUser.set(o.requesterId, (ordersByUser.get(o.requesterId) ?? 0) + 1);
        }

        const userReport = allUsersRows
          .filter((uRow) => (userId !== null ? uRow.u.id === userId : true))
          .map(({ u, roleName, roleSlug }) => {
            let movCount = 0;
            let inCount = 0;
            let outCount = 0;
            let inUnits = 0;
            let outUnits = 0;
            let inVal = 0;
            let outVal = 0;

            for (const r of periodMovRows) {
              if (r.m.userId !== u.id) continue;
              if (categoryId !== null && r.prodCategoryId !== categoryId) continue;
              movCount++;
              if (r.m.type === 'INGRESO') {
                inCount++;
                inUnits += r.m.quantity;
                inVal = roundMoney(inVal + r.m.totalValue);
              } else {
                outCount++;
                outUnits += r.m.quantity;
                outVal = roundMoney(outVal + r.m.totalValue);
              }
            }

            return {
              id: u.id,
              name: u.name,
              email: u.email,
              department: u.department,
              role_name: roleName,
              role_slug: roleSlug,
              movement_count: movCount,
              ingreso_count: inCount,
              salida_count: outCount,
              ingreso_units: inUnits,
              salida_units: outUnits,
              total_units: inUnits + outUnits,
              ingreso_value: inVal,
              salida_value: outVal,
              total_value: roundMoney(inVal + outVal),
              orders_requested: ordersByUser.get(u.id) ?? 0,
            };
          })
          .sort((a, b) => b.movement_count - a.movement_count || a.name.localeCompare(b.name));

        const toReportMovement = (r: (typeof filteredMovRows)[number]) =>
          serializeMovement({
            m: r.m,
            sku: r.sku,
            barcode: r.barcode,
            productName: r.productName,
            unit: r.unit,
            category:
              (r.prodCategoryId ? catNameById.get(r.prodCategoryId) : undefined) || r.prodCategory,
            operatorName: r.operatorName,
            operatorRole: r.operatorRole,
            sectorName: r.sectorName,
            personnelName: r.personnelName,
          });

        const movementDetails = filteredMovRows.slice(0, 500).map(toReportMovement);
        const ingresoDetails = filteredMovRows
          .filter((r) => r.m.type === 'INGRESO')
          .slice(0, 500)
          .map(toReportMovement);
        const egresoDetails = filteredMovRows
          .filter((r) => r.m.type === 'SALIDA')
          .slice(0, 500)
          .map(toReportMovement);

        res.json({
          mode,
          year,
          month,
          user_id: userId,
          category_id: categoryId,
          totals,
          breakdown,
          categoryReport,
          topProducts,
          userReport,
          movementDetails,
          ingresoDetails,
          egresoDetails,
          filterUsers: allUsersRows.map(({ u, roleName }) => ({
            id: u.id,
            name: u.name,
            department: u.department,
            role_name: roleName,
          })),
          filterCategories: allCats.map((c) => ({ id: c.id, code: c.code, name: c.name })),
        });
      } catch (err) {
        console.error('Report summary error:', err);
        res.status(500).json({ error: 'No se pudo generar el reporte.' });
      }
    }
  );

  // ── USUARIOS, ROLES Y PERMISOS CONFIGURABLES ──────────────────────────────
  app.get(
    '/api/users',
    requireAuth,
    requirePermission('manage_users'),
    async (_req: AuthRequest, res: Response) => {
      try {
        const rows = await db
          .select({
            u: users,
            roleSlug: roles.slug,
            roleName: roles.name,
            sectorName: sectors.name,
          })
          .from(users)
          .innerJoin(roles, eq(users.roleId, roles.id))
          .leftJoin(sectors, eq(users.sectorId, sectors.id))
          .orderBy(asc(users.id));

        res.json({
          users: rows.map(({ u, roleSlug, roleName, sectorName }) => ({
            id: u.id,
            uid: u.uid,
            username: u.username,
            has_password: Boolean(u.passwordHash),
            name: u.name,
            email: u.email,
            role_id: u.roleId,
            sector_id: u.sectorId,
            department: sectorName || u.department,
            active: u.active,
            created_at: formatPgDate(u.createdAt),
            role_slug: roleSlug,
            role_name: roleName,
          })),
        });
      } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'No se pudieron cargar los usuarios.' });
      }
    }
  );

  app.post(
    '/api/users',
    requireAuth,
    requirePermission('manage_users'),
    async (req: AuthRequest, res: Response) => {
      const name = sanitizeString(req.body?.name, 120);
      const rawUsername = normalizeUsername(req.body?.username);
      const username = rawUsername || null;
      const rawEmail = sanitizeString(req.body?.email, 160).toLowerCase();
      const email = rawEmail || (username ? `${username}@almacenpro.local` : '');
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const roleId = Number(req.body?.role_id);
      const rawSectorId = Number(req.body?.sector_id);
      const sectorId = Number.isInteger(rawSectorId) && rawSectorId > 0 ? rawSectorId : null;
      let department = sanitizeString(req.body?.department, 120) || 'Operaciones';

      if (!name || !email || !email.includes('@') || !roleId) {
        res.status(400).json({
          error: 'Completa nombre, usuario o correo válido y rol asignado.',
        });
        return;
      }

      if (username && !USERNAME_RE.test(username)) {
        res.status(400).json({
          error: 'El nombre de usuario debe tener entre 3 y 40 caracteres (letras, números, ".", "_" o "-").',
        });
        return;
      }

      if (password && (password.length < 6 || password.length > 128)) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
      }

      if (username && !password) {
        res.status(400).json({
          error: 'Ingresa una contraseña de al menos 6 caracteres para el acceso con usuario.',
        });
        return;
      }

      try {
        const roleRows = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
        if (!roleRows[0]) {
          res.status(400).json({ error: 'Rol inválido.' });
          return;
        }

        if (sectorId) {
          const secRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
          if (secRows[0]) department = secRows[0].name;
        }

        const [created] = await db
          .insert(users)
          .values({
            name,
            username,
            passwordHash: password ? hashPassword(password) : null,
            email,
            roleId,
            sectorId,
            department,
            active: 1,
          })
          .returning();

        res.status(201).json({
          user: {
            id: created.id,
            uid: created.uid,
            username: created.username,
            has_password: Boolean(created.passwordHash),
            name: created.name,
            email: created.email,
            role_id: created.roleId,
            sector_id: created.sectorId,
            department: created.department,
            active: created.active,
            created_at: formatPgDate(created.createdAt),
            role_slug: roleRows[0].slug,
            role_name: roleRows[0].name,
          },
        });
      } catch (err) {
        if (isPgUniqueError(err)) {
          res.status(409).json({
            error: 'Ya existe un usuario con ese nombre de usuario o correo electrónico.',
          });
          return;
        }
        console.error('Create user error:', err);
        res.status(500).json({ error: 'No se pudo crear el usuario.' });
      }
    }
  );

  app.put(
    '/api/users/:id',
    requireAuth,
    requirePermission('manage_users'),
    async (req: AuthRequest, res: Response) => {
      const targetId = Number(req.params.id);
      try {
        const existingRows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
        const existing = existingRows[0];
        if (!existing) {
          res.status(404).json({ error: 'Usuario no encontrado.' });
          return;
        }

        const name = sanitizeString(req.body?.name, 120) || existing.name;
        const username =
          req.body?.username !== undefined
            ? normalizeUsername(req.body.username) || null
            : existing.username;
        const email =
          req.body?.email !== undefined
            ? sanitizeString(req.body.email, 160).toLowerCase()
            : existing.email;
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const rawSectorId =
          req.body?.sector_id !== undefined ? Number(req.body.sector_id) : existing.sectorId;
        const sectorId = rawSectorId && Number.isInteger(rawSectorId) ? rawSectorId : null;
        let department = sanitizeString(req.body?.department, 120) || existing.department;
        const roleId = req.body?.role_id ? Number(req.body.role_id) : existing.roleId;
        const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;

        if (!email || !email.includes('@')) {
          res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
          return;
        }

        if (username && !USERNAME_RE.test(username)) {
          res.status(400).json({
            error: 'El nombre de usuario debe tener entre 3 y 40 caracteres (letras, números, ".", "_" o "-").',
          });
          return;
        }

        if (password && (password.length < 6 || password.length > 128)) {
          res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
          return;
        }

        if (targetId === req.authUser!.id && active === 0) {
          res.status(400).json({ error: 'No puedes desactivar tu propia cuenta en sesión.' });
          return;
        }

        if (sectorId) {
          const secRows = await db.select().from(sectors).where(eq(sectors.id, sectorId)).limit(1);
          if (secRows[0]) department = secRows[0].name;
        }

        const [updated] = await db
          .update(users)
          .set({
            name,
            username,
            email,
            department,
            sectorId,
            roleId,
            active,
            ...(password ? { passwordHash: hashPassword(password) } : {}),
          })
          .where(eq(users.id, targetId))
          .returning();

        const roleRows = await db.select().from(roles).where(eq(roles.id, updated.roleId)).limit(1);

        res.json({
          user: {
            id: updated.id,
            uid: updated.uid,
            username: updated.username,
            has_password: Boolean(updated.passwordHash),
            name: updated.name,
            email: updated.email,
            role_id: updated.roleId,
            sector_id: updated.sectorId,
            department: updated.department,
            active: updated.active,
            created_at: formatPgDate(updated.createdAt),
            role_slug: roleRows[0]?.slug || '',
            role_name: roleRows[0]?.name || '',
          },
        });
      } catch (err) {
        if (isPgUniqueError(err)) {
          res.status(409).json({
            error: 'Ya existe otro usuario con ese nombre de usuario o correo electrónico.',
          });
          return;
        }
        console.error('Update user error:', err);
        res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
      }
    }
  );

  app.delete('/api/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const targetId = Number(req.params.id);
    if (targetId === req.authUser!.id) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta en sesión.' });
      return;
    }

    try {
      const targetRows = await db
        .select({ u: users, roleSlug: roles.slug })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, targetId))
        .limit(1);
      const target = targetRows[0];
      if (!target) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }

      if (target.roleSlug === 'admin') {
        const [{ adminCount }] = await db
          .select({ adminCount: count() })
          .from(users)
          .innerJoin(roles, eq(users.roleId, roles.id))
          .where(and(eq(roles.slug, 'admin'), eq(users.active, 1)));
        if (Number(adminCount) <= 1) {
          res.status(409).json({ error: 'Debe existir al menos un Administrador activo en el sistema.' });
          return;
        }
      }

      const [{ ordCount }] = await db
        .select({ ordCount: count() })
        .from(orders)
        .where(eq(orders.requesterId, targetId));
      const [{ movCount }] = await db
        .select({ movCount: count() })
        .from(movements)
        .where(eq(movements.userId, targetId));

      if (Number(ordCount) > 0 || Number(movCount) > 0) {
        res.status(409).json({
          error: `No se puede eliminar a "${target.u.name}" porque tiene ${movCount} movimiento(s) y ${ordCount} pedido(s) registrados. Desactívalo desde Editar.`,
        });
        return;
      }

      await db.delete(users).where(eq(users.id, targetId));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete user error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
    }
  });

  app.get(
    '/api/roles',
    requireAuth,
    requirePermission('manage_users'),
    async (_req: AuthRequest, res: Response) => {
      try {
        const roleList = await db.select().from(roles).orderBy(asc(roles.id));
        const perms = await db.select().from(rolePermissions);

        const permsByRole = new Map<number, Record<string, boolean>>();
        for (const p of perms) {
          const map = permsByRole.get(p.roleId) || {};
          map[p.permissionKey] = p.allowed === 1;
          permsByRole.set(p.roleId, map);
        }

        res.json({
          roles: roleList.map((r) => ({
            id: r.id,
            slug: r.slug,
            name: r.name,
            description: r.description,
            is_system: r.isSystem,
            permissions: permsByRole.get(r.id) || {},
          })),
          catalog: ALL_PERMISSIONS,
        });
      } catch (err) {
        console.error('List roles error:', err);
        res.status(500).json({ error: 'No se pudieron cargar los roles.' });
      }
    }
  );

  app.post('/api/roles', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const name = sanitizeString(req.body?.name, 80);
    const description = sanitizeString(req.body?.description, 260);
    const rawSlug = sanitizeString(req.body?.slug, 40)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const slug =
      rawSlug ||
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

    if (!name || !slug) {
      res.status(400).json({ error: 'El nombre y el identificador (slug) del rol son obligatorios.' });
      return;
    }

    const incomingPerms = (req.body?.permissions || {}) as Record<string, unknown>;
    try {
      const created = await db.transaction(async (tx) => {
        const [role] = await tx
          .insert(roles)
          .values({ slug, name, description, isSystem: 0 })
          .returning();

        await tx.insert(rolePermissions).values(
          ALL_PERMISSIONS.map((perm) => ({
            roleId: role.id,
            permissionKey: perm.key,
            allowed: incomingPerms[perm.key] ? 1 : 0,
          }))
        );
        return role;
      });
      res.status(201).json({
        id: created.id,
        slug: created.slug,
        name: created.name,
        description: created.description,
        is_system: 0,
      });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'Ya existe un rol con ese identificador (slug).' });
        return;
      }
      console.error('Create role error:', err);
      res.status(500).json({ error: 'No se pudo crear el rol.' });
    }
  });

  app.put('/api/roles/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const roleId = Number(req.params.id);
    try {
      const existingRows = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Rol no encontrado.' });
        return;
      }

      const name = sanitizeString(req.body?.name, 80) || existing.name;
      const description =
        req.body?.description !== undefined
          ? sanitizeString(req.body.description, 260)
          : existing.description;
      const slug =
        existing.isSystem === 1
          ? existing.slug
          : sanitizeString(req.body?.slug, 40)
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, '_') || existing.slug;

      await db.update(roles).set({ slug, name, description }).where(eq(roles.id, roleId));
      res.json({ ok: true });
    } catch (err) {
      if (isPgUniqueError(err)) {
        res.status(409).json({ error: 'El identificador (slug) ya está en uso.' });
        return;
      }
      console.error('Update role error:', err);
      res.status(500).json({ error: 'No se pudo actualizar el rol.' });
    }
  });

  app.delete('/api/roles/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const roleId = Number(req.params.id);
    try {
      const existingRows = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ error: 'Rol no encontrado.' });
        return;
      }
      if (existing.isSystem === 1) {
        res.status(409).json({ error: `El rol base "${existing.name}" es del sistema y no se puede eliminar.` });
        return;
      }
      const [{ uCount }] = await db
        .select({ uCount: count() })
        .from(users)
        .where(eq(users.roleId, roleId));
      if (Number(uCount) > 0) {
        res.status(409).json({
          error: `No se puede eliminar "${existing.name}" porque tiene ${uCount} usuario(s) asignado(s).`,
        });
        return;
      }
      await db.delete(roles).where(eq(roles.id, roleId));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete role error:', err);
      res.status(500).json({ error: 'No se pudo eliminar el rol.' });
    }
  });

  app.put(
    '/api/roles/:id/permissions',
    requireAuth,
    requirePermission('manage_users'),
    async (req: AuthRequest, res: Response) => {
      const roleId = Number(req.params.id);
      const incoming = req.body?.permissions;
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ error: 'Formato de permisos inválido.' });
        return;
      }

      try {
        const roleRows = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
        const role = roleRows[0];
        if (!role) {
          res.status(404).json({ error: 'Rol no encontrado.' });
          return;
        }

        const validKeys = new Set<string>(ALL_PERMISSIONS.map((p) => p.key));
        await db.transaction(async (tx) => {
          for (const [key, val] of Object.entries(incoming as Record<string, unknown>)) {
            if (!validKeys.has(key)) continue;
            const allowed = role.slug === 'admin' && key === 'manage_users' ? 1 : val ? 1 : 0;
            await tx
              .insert(rolePermissions)
              .values({ roleId, permissionKey: key, allowed })
              .onConflictDoUpdate({
                target: [rolePermissions.roleId, rolePermissions.permissionKey],
                set: { allowed },
              });
          }
        });
        res.json({ ok: true });
      } catch (err) {
        console.error('Update permissions error:', err);
        res.status(500).json({ error: 'No se pudieron guardar los permisos.' });
      }
    }
  );

  // ── EXPORTACIÓN COMPLETA DE BASE DE DATOS (SOLO ADMINISTRADOR) ───────────
  app.get(
    '/api/admin/export-database',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      const format =
        String(req.query.format || 'sql').toLowerCase() === 'json' ? 'json' : 'sql';
      const dateStamp = new Date().toISOString().slice(0, 10);

      try {
        await ensureDatabaseSeeded();

        const [
          rolesRows,
          rolePermRows,
          sectorRows,
          personnelRows,
          userRows,
          categoryRows,
          productRows,
          orderRows,
          orderItemRows,
          exitBatchRows,
          movementRows,
        ] = await Promise.all([
          db.select().from(roles).orderBy(asc(roles.id)),
          db
            .select()
            .from(rolePermissions)
            .orderBy(asc(rolePermissions.roleId), asc(rolePermissions.permissionKey)),
          db.select().from(sectors).orderBy(asc(sectors.id)),
          db.select().from(personnel).orderBy(asc(personnel.id)),
          db
            .select({
              id: users.id,
              uid: users.uid,
              username: users.username,
              name: users.name,
              email: users.email,
              roleId: users.roleId,
              sectorId: users.sectorId,
              department: users.department,
              active: users.active,
              createdAt: users.createdAt,
            })
            .from(users)
            .orderBy(asc(users.id)),
          db.select().from(categories).orderBy(asc(categories.id)),
          db.select().from(products).orderBy(asc(products.id)),
          db.select().from(orders).orderBy(asc(orders.id)),
          db.select().from(orderItems).orderBy(asc(orderItems.id)),
          db.select().from(exitBatches).orderBy(asc(exitBatches.id)),
          db.select().from(movements).orderBy(asc(movements.id)),
        ]);

        if (format === 'json') {
          const payload = {
            app: 'AlmacénPro',
            database: 'postgresql',
            exported_at: new Date().toISOString(),
            security_note:
              'Los hashes de contraseñas (password_hash) se excluyen por seguridad.',
            counts: {
              roles: rolesRows.length,
              role_permissions: rolePermRows.length,
              sectors: sectorRows.length,
              personnel: personnelRows.length,
              users: userRows.length,
              categories: categoryRows.length,
              products: productRows.length,
              orders: orderRows.length,
              order_items: orderItemRows.length,
              exit_batches: exitBatchRows.length,
              movements: movementRows.length,
            },
            tables: {
              roles: rolesRows,
              role_permissions: rolePermRows,
              sectors: sectorRows,
              personnel: personnelRows,
              users: userRows,
              categories: categoryRows,
              products: productRows,
              orders: orderRows,
              order_items: orderItemRows,
              exit_batches: exitBatchRows,
              movements: movementRows,
            },
          };

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="almacenpro_respaldo_${dateStamp}.json"`
          );
          res.send(JSON.stringify(payload, null, 2));
          return;
        }

        const sqlVal = (val: unknown): string => {
          if (val === null || val === undefined) return 'NULL';
          if (val instanceof Date) {
            return `'${val.toISOString().replace(/'/g, "''")}'::timestamp`;
          }
          if (typeof val === 'number') {
            return Number.isFinite(val) ? String(val) : '0';
          }
          if (typeof val === 'boolean') {
            return val ? 'TRUE' : 'FALSE';
          }
          return `'${String(val).replace(/'/g, "''")}'`;
        };

        const buildInserts = (
          tableName: string,
          columns: string[],
          rowsData: Array<Array<unknown>>,
          conflictTarget?: string
        ): string[] => {
          if (rowsData.length === 0) return [`-- Sin registros en ${tableName}`];
          const colList = columns.map((c) => `"${c}"`).join(', ');
          const lines: string[] = [`-- Tabla: ${tableName} (${rowsData.length} registros)`];
          for (const row of rowsData) {
            const vals = row.map(sqlVal).join(', ');
            const conflictClause = conflictTarget
              ? ` ON CONFLICT ${conflictTarget} DO NOTHING`
              : '';
            lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${vals})${conflictClause};`);
          }
          return lines;
        };

        const serialTables = [
          'roles',
          'sectors',
          'personnel',
          'users',
          'categories',
          'products',
          'orders',
          'order_items',
          'exit_batches',
          'movements',
        ];

        const sqlLines: string[] = [
          '-- ============================================================================',
          '-- AlmacénPro - Respaldo completo de base de datos PostgreSQL',
          `-- Exportado: ${new Date().toISOString()}`,
          '-- Nota: password_hash de usuarios excluido por seguridad.',
          '-- ============================================================================',
          '',
          'BEGIN;',
          '',
          ...buildInserts(
            'roles',
            ['id', 'slug', 'name', 'description', 'is_system'],
            rolesRows.map((r) => [r.id, r.slug, r.name, r.description, r.isSystem]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'role_permissions',
            ['role_id', 'permission_key', 'allowed'],
            rolePermRows.map((rp) => [rp.roleId, rp.permissionKey, rp.allowed]),
            '(role_id, permission_key)'
          ),
          '',
          ...buildInserts(
            'sectors',
            ['id', 'code', 'name', 'description', 'active', 'created_at'],
            sectorRows.map((s) => [s.id, s.code, s.name, s.description, s.active, s.createdAt]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'personnel',
            ['id', 'code', 'name', 'position', 'email', 'phone', 'sector_id', 'active', 'created_at'],
            personnelRows.map((p) => [
              p.id,
              p.code,
              p.name,
              p.position,
              p.email,
              p.phone,
              p.sectorId,
              p.active,
              p.createdAt,
            ]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'users',
            ['id', 'uid', 'username', 'name', 'email', 'role_id', 'sector_id', 'department', 'active', 'created_at'],
            userRows.map((u) => [
              u.id,
              u.uid,
              u.username,
              u.name,
              u.email,
              u.roleId,
              u.sectorId,
              u.department,
              u.active,
              u.createdAt,
            ]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'categories',
            ['id', 'code', 'name', 'description', 'active', 'created_at'],
            categoryRows.map((c) => [c.id, c.code, c.name, c.description, c.active, c.createdAt]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'products',
            [
              'id',
              'sku',
              'barcode',
              'name',
              'description',
              'category_id',
              'category',
              'unit',
              'location',
              'stock_current',
              'stock_min',
              'cost_previous',
              'cost_current',
              'margin_percent',
              'price_current',
              'updated_at',
              'created_at',
            ],
            productRows.map((p) => [
              p.id,
              p.sku,
              p.barcode,
              p.name,
              p.description,
              p.categoryId,
              p.category,
              p.unit,
              p.location,
              p.stockCurrent,
              p.stockMin,
              p.costPrevious,
              p.costCurrent,
              p.marginPercent,
              p.priceCurrent,
              p.updatedAt,
              p.createdAt,
            ]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'orders',
            [
              'id',
              'folio',
              'requester_id',
              'requester_name',
              'personnel_id',
              'sector_id',
              'department',
              'priority',
              'status',
              'notes',
              'reviewed_by',
              'reviewed_at',
              'review_notes',
              'dispatched_by',
              'dispatched_at',
              'created_at',
            ],
            orderRows.map((o) => [
              o.id,
              o.folio,
              o.requesterId,
              o.requesterName,
              o.personnelId,
              o.sectorId,
              o.department,
              o.priority,
              o.status,
              o.notes,
              o.reviewedBy,
              o.reviewedAt,
              o.reviewNotes,
              o.dispatchedBy,
              o.dispatchedAt,
              o.createdAt,
            ]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'order_items',
            ['id', 'order_id', 'product_id', 'quantity_requested', 'quantity_approved'],
            orderItemRows.map((oi) => [
              oi.id,
              oi.orderId,
              oi.productId,
              oi.quantityRequested,
              oi.quantityApproved,
            ]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'exit_batches',
            [
              'id',
              'folio',
              'personnel_id',
              'sector_id',
              'responsible_name',
              'responsible_area',
              'reason_detail',
              'order_id',
              'user_id',
              'total_value',
              'created_at',
            ],
            exitBatchRows.map((eb) => [
              eb.id,
              eb.folio,
              eb.personnelId,
              eb.sectorId,
              eb.responsibleName,
              eb.responsibleArea,
              eb.reasonDetail,
              eb.orderId,
              eb.userId,
              eb.totalValue,
              eb.createdAt,
            ]),
            '(id)'
          ),
          '',
          ...buildInserts(
            'movements',
            [
              'id',
              'folio',
              'type',
              'product_id',
              'quantity',
              'cost_previous',
              'cost_entry',
              'cost_resulting',
              'price_previous',
              'price_resulting',
              'total_value',
              'personnel_id',
              'sector_id',
              'responsible_name',
              'responsible_area',
              'reason_detail',
              'exit_batch_id',
              'order_id',
              'user_id',
              'created_at',
            ],
            movementRows.map((m) => [
              m.id,
              m.folio,
              m.type,
              m.productId,
              m.quantity,
              m.costPrevious,
              m.costEntry,
              m.costResulting,
              m.pricePrevious,
              m.priceResulting,
              m.totalValue,
              m.personnelId,
              m.sectorId,
              m.responsibleName,
              m.responsibleArea,
              m.reasonDetail,
              m.exitBatchId,
              m.orderId,
              m.userId,
              m.createdAt,
            ]),
            '(id)'
          ),
          '',
          '-- Sincronizar secuencias autoincrementales',
          ...serialTables.map(
            (t) =>
              `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), true);`
          ),
          '',
          'COMMIT;',
          '',
        ];

        res.setHeader('Content-Type', 'application/sql; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="almacenpro_respaldo_${dateStamp}.sql"`
        );
        res.send(sqlLines.join('\n'));
      } catch (err) {
        console.error('Export database error:', err);
        res.status(500).json({ error: 'No se pudo exportar la base de datos.' });
      }
    }
  );
}
