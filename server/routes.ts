import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  ALL_PERMISSIONS,
  db,
  nextFolio,
  type PermissionKey,
} from './db.ts';
import {
  type AuthenticatedRequest,
  createAuthToken,
  getAdminSetupStatus,
  hashPassword,
  loadUserWithPermissions,
  requireAdmin,
  requireAuth,
  requirePermission,
  verifyPassword,
} from './auth.ts';

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

function generateCategoryCode(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4);
  const rand = Math.floor(100 + Math.random() * 899);
  return `CAT-${clean || 'GEN'}-${rand}`;
}

function resolveCategory(
  categoryIdInput: unknown,
  categoryNameInput: unknown,
  fallbackName = 'General'
): { category_id: number; category: string } {
  const rawId = Number(categoryIdInput);
  if (Number.isInteger(rawId) && rawId > 0) {
    const row = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(rawId) as
      | { id: number; name: string }
      | undefined;
    if (row) return { category_id: row.id, category: row.name };
  }

  const name = sanitizeString(categoryNameInput, 80) || fallbackName;
  const existing = db
    .prepare('SELECT id, name FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1')
    .get(name) as { id: number; name: string } | undefined;
  if (existing) {
    return { category_id: existing.id, category: existing.name };
  }

  let code = generateCategoryCode(name);
  while (db.prepare('SELECT id FROM categories WHERE code = ?').get(code)) {
    code = generateCategoryCode(name);
  }
  const inserted = db
    .prepare('INSERT INTO categories (code, name, description, active) VALUES (?, ?, ?, 1)')
    .run(code, name, '');
  return { category_id: Number(inserted.lastInsertRowid), category: name };
}

export function registerRoutes(app: Express): void {
  // ── AUTH & SETUP ──────────────────────────────────────────────────────────
  app.get('/api/auth/status', (_req: Request, res: Response) => {
    const status = getAdminSetupStatus();
    const accounts = db
      .prepare(
        `SELECT u.email, u.name, r.slug as role_slug, r.name as role_name
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.active = 1
         ORDER BY r.id ASC, u.id ASC`
      )
      .all();
    res.json({ ...status, accounts });
  });

  app.post('/api/auth/setup', (req: Request, res: Response) => {
    const status = getAdminSetupStatus();
    if (!status.needsSetup) {
      res.status(409).json({ error: 'La cuenta de administrador ya fue configurada.' });
      return;
    }

    const name = sanitizeString(req.body?.name, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const createTeamDemo = Boolean(req.body?.createTeamDemo);

    if (!name || !email || !email.includes('@')) {
      res.status(400).json({ error: 'Ingresa un nombre y correo electrónico válido.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    const adminRole = db.prepare("SELECT id FROM roles WHERE slug = 'admin'").get() as { id: number };
    const almRole = db.prepare("SELECT id FROM roles WHERE slug = 'almacenista'").get() as { id: number };
    const usrRole = db.prepare("SELECT id FROM roles WHERE slug = 'usuario'").get() as { id: number };

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
      if (existing) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
        return;
      }

      const adminHash = hashPassword(password);
      const adminInsert = db
        .prepare(
          'INSERT INTO users (name, email, password_hash, role_id, department, active) VALUES (?, ?, ?, ?, ?, 1)'
        )
        .run(name, email, adminHash, adminRole.id, 'Administración General');
      const adminId = Number(adminInsert.lastInsertRowid);

      // Link seeded historical movements without a user_id to this admin for initial metrics
      db.prepare('UPDATE movements SET user_id = ? WHERE user_id IS NULL').run(adminId);

      if (createTeamDemo) {
        const teamHash = hashPassword(password);
        const almId = Number(
          db
            .prepare(
              'INSERT OR IGNORE INTO users (name, email, password_hash, role_id, department, active) VALUES (?, ?, ?, ?, ?, 1)'
            )
            .run('Marcos Beltrán', 'almacen@almacenpro.local', teamHash, almRole.id, 'Almacén Central')
            .lastInsertRowid
        );
        const usrId = Number(
          db
            .prepare(
              'INSERT OR IGNORE INTO users (name, email, password_hash, role_id, department, active) VALUES (?, ?, ?, ?, ?, 1)'
            )
            .run('Sofía Navarro', 'operaciones@almacenpro.local', teamHash, usrRole.id, 'Mantenimiento Planta')
            .lastInsertRowid
        );

        // Seed 2 realistic warehouse orders so Pedidos & Autorizaciones is immediately demonstrable
        if (usrId > 0) {
          const orderCount = (db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number }).c;
          if (orderCount === 0) {
            const prodGuantes = db.prepare("SELECT id FROM products WHERE sku = 'EPP-003'").get() as { id: number } | undefined;
            const prodAceite = db.prepare("SELECT id FROM products WHERE sku = 'LUB-005'").get() as { id: number } | undefined;
            const prodCasco = db.prepare("SELECT id FROM products WHERE sku = 'EPP-002'").get() as { id: number } | undefined;

            if (prodGuantes && prodAceite) {
              const ord1 = Number(
                db
                  .prepare(
                    `INSERT INTO orders (folio, requester_id, requester_name, department, priority, status, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                  )
                  .run(
                    'PED-2026-0001',
                    usrId,
                    'Sofía Navarro',
                    'Mantenimiento Planta',
                    'Urgente',
                    'Pendiente',
                    'Requerimiento urgente para parada programada de prensa hidráulica.'
                  ).lastInsertRowid
              );
              db.prepare(
                'INSERT INTO order_items (order_id, product_id, quantity_requested, quantity_approved) VALUES (?, ?, ?, ?)'
              ).run(ord1, prodAceite.id, 2, 0);
              db.prepare(
                'INSERT INTO order_items (order_id, product_id, quantity_requested, quantity_approved) VALUES (?, ?, ?, ?)'
              ).run(ord1, prodGuantes.id, 4, 0);
            }

            if (prodCasco) {
              const ord2 = Number(
                db
                  .prepare(
                    `INSERT INTO orders (folio, requester_id, requester_name, department, priority, status, notes, reviewed_by, reviewed_at, review_notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), ?)`
                  )
                  .run(
                    'PED-2026-0002',
                    usrId,
                    'Sofía Navarro',
                    'Mantenimiento Planta',
                    'Normal',
                    'Aprobado',
                    'Dotación de equipo de seguridad para personal de nuevo ingreso.',
                    name,
                    'Autorizado para despacho inmediato en ventanilla.'
                  ).lastInsertRowid
              );
              db.prepare(
                'INSERT INTO order_items (order_id, product_id, quantity_requested, quantity_approved) VALUES (?, ?, ?, ?)'
              ).run(ord2, prodCasco.id, 5, 5);
            }

            if (almId > 0) {
              db.prepare("UPDATE movements SET user_id = ? WHERE folio IN ('SAL-2026-0008', 'SAL-2026-0010')").run(almId);
            }
          }
        }
      }

      db.exec('COMMIT');

      const user = loadUserWithPermissions(adminId);
      const token = createAuthToken(adminId);
      res.status(201).json({ token, user });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Setup error:', err);
      res.status(500).json({ error: 'No se pudo completar la configuración inicial.' });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
      return;
    }

    const envPass = (process.env.ADMIN_PASSCODE || '').trim();
    let userRow = db
      .prepare(
        `SELECT u.id, u.password_hash, u.active, r.slug as role_slug
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.email = ?`
      )
      .get(email) as
      | { id: number; password_hash: string; active: number; role_slug: string }
      | undefined;

    // Allow ADMIN_PASSCODE from environment to authenticate or bootstrap the admin user
    if (envPass && password.length === envPass.length) {
      const matchEnv = crypto.timingSafeEqual(Buffer.from(password), Buffer.from(envPass));
      if (matchEnv) {
        if (!userRow) {
          const anyAdmin = db
            .prepare(
              `SELECT u.id, u.password_hash, u.active, r.slug as role_slug
               FROM users u JOIN roles r ON r.id = u.role_id
               WHERE r.slug = 'admin' LIMIT 1`
            )
            .get() as
            | { id: number; password_hash: string; active: number; role_slug: string }
            | undefined;

          if (!anyAdmin) {
            const adminRole = db.prepare("SELECT id FROM roles WHERE slug = 'admin'").get() as { id: number };
            const inserted = db
              .prepare(
                'INSERT INTO users (name, email, password_hash, role_id, department, active) VALUES (?, ?, ?, ?, ?, 1)'
              )
              .run('Administrador', email, hashPassword(envPass), adminRole.id, 'Administración');
            userRow = {
              id: Number(inserted.lastInsertRowid),
              password_hash: '',
              active: 1,
              role_slug: 'admin',
            };
          } else {
            userRow = anyAdmin;
          }
        }
        if (userRow.role_slug === 'admin' && userRow.active === 1) {
          const user = loadUserWithPermissions(userRow.id);
          const token = createAuthToken(userRow.id);
          res.json({ token, user });
          return;
        }
      }
    }

    if (!userRow || userRow.active !== 1 || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'Credenciales incorrectas o cuenta inactiva.' });
      return;
    }

    const user = loadUserWithPermissions(userRow.id);
    if (!user) {
      res.status(401).json({ error: 'Cuenta deshabilitada.' });
      return;
    }

    const token = createAuthToken(user.id);
    res.json({ token, user });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.authUser });
  });

  // ── DASHBOARD EN TIEMPO REAL ──────────────────────────────────────────────
  app.get(
    '/api/dashboard',
    requireAuth,
    requirePermission('view_dashboard'),
    (_req: AuthenticatedRequest, res: Response) => {
      const kpis = db
        .prepare(
          `SELECT
            COUNT(*) as total_products,
            COALESCE(SUM(stock_current), 0) as total_units,
            COALESCE(SUM(stock_current * cost_current), 0) as inventory_cost_value,
            COALESCE(SUM(stock_current * price_current), 0) as inventory_sale_value,
            SUM(CASE WHEN stock_current = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
            SUM(CASE WHEN stock_current > 0 AND stock_current <= stock_min THEN 1 ELSE 0 END) as low_stock_count
           FROM products`
        )
        .get() as Record<string, number>;

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const monthMovements = db
        .prepare(
          `SELECT
            SUM(CASE WHEN type = 'INGRESO' THEN 1 ELSE 0 END) as entries_count,
            SUM(CASE WHEN type = 'SALIDA' THEN 1 ELSE 0 END) as exits_count,
            COALESCE(SUM(CASE WHEN type = 'INGRESO' THEN total_value ELSE 0 END), 0) as entries_value,
            COALESCE(SUM(CASE WHEN type = 'SALIDA' THEN total_value ELSE 0 END), 0) as exits_value
           FROM movements
           WHERE strftime('%Y-%m', created_at) = ?`
        )
        .get(currentMonthKey) as Record<string, number>;

      const pendingOrders = db
        .prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Pendiente'")
        .get() as { c: number };

      const approvedToDispatch = db
        .prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'Aprobado'")
        .get() as { c: number };

      const alerts = db
        .prepare(
          `SELECT id, sku, barcode, name, category, unit, location, stock_current, stock_min, cost_current, price_current
           FROM products
           WHERE stock_current <= stock_min
           ORDER BY stock_current ASC, (stock_min - stock_current) DESC
           LIMIT 10`
        )
        .all();

      const recentMovements = db
        .prepare(
          `SELECT m.*, p.sku, p.barcode, p.name as product_name, p.unit, u.name as operator_name
           FROM movements m
           JOIN products p ON p.id = m.product_id
           LEFT JOIN users u ON u.id = m.user_id
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 8`
        )
        .all();

      const monthlySeries = db
        .prepare(
          `SELECT
            strftime('%Y-%m', created_at) as ym,
            COALESCE(SUM(CASE WHEN type = 'INGRESO' THEN quantity ELSE 0 END), 0) as ingreso_qty,
            COALESCE(SUM(CASE WHEN type = 'SALIDA' THEN quantity ELSE 0 END), 0) as salida_qty,
            COALESCE(SUM(CASE WHEN type = 'INGRESO' THEN total_value ELSE 0 END), 0) as ingreso_val,
            COALESCE(SUM(CASE WHEN type = 'SALIDA' THEN total_value ELSE 0 END), 0) as salida_val
           FROM movements
           WHERE strftime('%Y', created_at) = ?
           GROUP BY ym
           ORDER BY ym ASC`
        )
        .all(String(now.getFullYear()));

      res.json({
        kpis: {
          ...kpis,
          entries_count: monthMovements?.entries_count ?? 0,
          exits_count: monthMovements?.exits_count ?? 0,
          entries_value: roundMoney(monthMovements?.entries_value ?? 0),
          exits_value: roundMoney(monthMovements?.exits_value ?? 0),
          pending_orders: pendingOrders.c,
          approved_to_dispatch: approvedToDispatch.c,
        },
        alerts,
        recentMovements,
        monthlySeries,
        serverTime: new Date().toISOString(),
      });
    }
  );

  // ── CATEGORÍAS DE PRODUCTOS (CRUD) ────────────────────────────────────────
  app.get('/api/categories', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    const categories = db
      .prepare(
        `SELECT c.*, COUNT(p.id) as product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
         GROUP BY c.id
         ORDER BY c.name ASC`
      )
      .all();
    res.json({ categories });
  });

  app.post('/api/categories', requireAuth, (req: AuthenticatedRequest, res: Response) => {
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

    const code = codeInput || generateCategoryCode(name);

    try {
      const result = db
        .prepare('INSERT INTO categories (code, name, description, active) VALUES (?, ?, ?, ?)')
        .run(code, name, description, active);
      const category = db
        .prepare(
          `SELECT c.*, 0 as product_count FROM categories c WHERE c.id = ?`
        )
        .get(Number(result.lastInsertRowid));
      res.status(201).json({ category });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        res.status(409).json({ error: 'Ya existe una categoría con ese nombre o código.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo crear la categoría.' });
    }
  });

  app.put('/api/categories/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | { id: number; code: string; name: string; description: string; active: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Categoría no encontrada.' });
      return;
    }

    const code = sanitizeString(req.body?.code, 30).toUpperCase() || existing.code;
    const name = sanitizeString(req.body?.name, 80) || existing.name;
    const description =
      req.body?.description !== undefined ? sanitizeString(req.body.description, 300) : existing.description;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE categories SET code = ?, name = ?, description = ?, active = ? WHERE id = ?').run(
        code,
        name,
        description,
        active,
        id
      );
      // Keep denormalized products.category synchronized with category name
      db.prepare('UPDATE products SET category = ? WHERE category_id = ?').run(name, id);
      db.exec('COMMIT');

      const category = db
        .prepare(
          `SELECT c.*, COUNT(p.id) as product_count
           FROM categories c LEFT JOIN products p ON p.category_id = c.id
           WHERE c.id = ? GROUP BY c.id`
        )
        .get(id);
      res.json({ category });
    } catch (err) {
      db.exec('ROLLBACK');
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        res.status(409).json({ error: 'Ya existe otra categoría con ese nombre o código.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo actualizar la categoría.' });
    }
  });

  app.delete('/api/categories/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | { id: number; name: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Categoría no encontrada.' });
      return;
    }

    const refRow = db
      .prepare('SELECT COUNT(*) as c FROM products WHERE category_id = ?')
      .get(id) as { c: number };

    if (refRow.c > 0) {
      res.status(409).json({
        error: `No se puede eliminar "${existing.name}" porque tiene ${refRow.c} producto(s) asignado(s). Reasigna los productos primero.`,
      });
      return;
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ── PRODUCTOS E INVENTARIO ────────────────────────────────────────────────
  app.get(
    '/api/products',
    requireAuth,
    requirePermission('view_inventory'),
    (req: AuthenticatedRequest, res: Response) => {
      const q = sanitizeString(req.query.q, 100).toLowerCase();
      const category = sanitizeString(req.query.category, 80);
      const categoryId = Number(req.query.category_id);
      const status = sanitizeString(req.query.status, 30);

      let sql = `
        SELECT p.*, COALESCE(c.name, p.category) as category
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE 1=1
      `;
      const params: Array<string | number> = [];

      if (q) {
        sql +=
          ' AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(p.barcode) LIKE ? OR LOWER(p.location) LIKE ? OR LOWER(COALESCE(c.name, p.category)) LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
      }
      if (Number.isInteger(categoryId) && categoryId > 0) {
        sql += ' AND p.category_id = ?';
        params.push(categoryId);
      } else if (category && category !== 'ALL') {
        sql += ' AND COALESCE(c.name, p.category) = ?';
        params.push(category);
      }
      if (status === 'LOW') {
        sql += ' AND p.stock_current > 0 AND p.stock_current <= p.stock_min';
      } else if (status === 'OUT') {
        sql += ' AND p.stock_current = 0';
      } else if (status === 'OK') {
        sql += ' AND p.stock_current > p.stock_min';
      }

      sql += ' ORDER BY p.name ASC';
      const rows = db.prepare(sql).all(...params);
      const categoryList = db
        .prepare(
          `SELECT c.*, COUNT(p.id) as product_count
           FROM categories c
           LEFT JOIN products p ON p.category_id = c.id
           GROUP BY c.id
           ORDER BY c.name ASC`
        )
        .all() as Array<{ id: number; name: string; active: number }>;

      res.json({
        products: rows,
        categories: categoryList.filter((c) => c.active === 1).map((c) => c.name),
        categoryList,
      });
    }
  );

  app.get(
    '/api/products/barcode/:code',
    requireAuth,
    requirePermission('view_inventory'),
    (req: AuthenticatedRequest, res: Response) => {
      const code = sanitizeString(req.params.code, 80);
      if (!code) {
        res.status(400).json({ error: 'Código de barras inválido.' });
        return;
      }
      const product = db
        .prepare('SELECT * FROM products WHERE barcode = ? OR LOWER(sku) = LOWER(?) LIMIT 1')
        .get(code, code);
      if (!product) {
        res.status(404).json({ error: `No se encontró ningún producto con el código ${code}.` });
        return;
      }
      res.json({ product });
    }
  );

  app.post(
    '/api/products',
    requireAuth,
    requirePermission('manage_products'),
    (req: AuthenticatedRequest, res: Response) => {
      const sku = sanitizeString(req.body?.sku, 40).toUpperCase();
      const barcode = sanitizeString(req.body?.barcode, 60);
      const name = sanitizeString(req.body?.name, 160);
      const description = sanitizeString(req.body?.description, 400);
      const resolvedCat = resolveCategory(req.body?.category_id, req.body?.category, 'General');
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

      if (!sku || !barcode || !name) {
        res.status(400).json({ error: 'SKU, código de barras y nombre son obligatorios.' });
        return;
      }

      try {
        const result = db
          .prepare(
            `INSERT INTO products (
              sku, barcode, name, description, category_id, category, unit, location,
              stock_current, stock_min, cost_previous, cost_current, margin_percent, price_current
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            sku,
            barcode,
            name,
            description,
            resolvedCat.category_id,
            resolvedCat.category,
            unit,
            location,
            stockCurrent,
            stockMin,
            costCurrent,
            costCurrent,
            marginPercent,
            priceCurrent
          );

        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(result.lastInsertRowid));
        res.status(201).json({ product });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE')) {
          res.status(409).json({ error: 'El SKU o código de barras ya está registrado en otro producto.' });
          return;
        }
        res.status(500).json({ error: 'No se pudo guardar el producto.' });
      }
    }
  );

  app.put(
    '/api/products/:id',
    requireAuth,
    requirePermission('manage_products'),
    (req: AuthenticatedRequest, res: Response) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Producto no encontrado.' });
        return;
      }

      const sku = sanitizeString(req.body?.sku, 40).toUpperCase() || String(existing.sku);
      const barcode = sanitizeString(req.body?.barcode, 60) || String(existing.barcode);
      const name = sanitizeString(req.body?.name, 160) || String(existing.name);
      const description =
        req.body?.description !== undefined
          ? sanitizeString(req.body.description, 400)
          : String(existing.description || '');
      const resolvedCat = resolveCategory(
        req.body?.category_id ?? existing.category_id,
        req.body?.category ?? existing.category,
        String(existing.category || 'General')
      );
      const unit = sanitizeString(req.body?.unit, 30) || String(existing.unit);
      const location = sanitizeString(req.body?.location, 80) || String(existing.location);
      const stockCurrent =
        req.authUser!.role_slug === 'admin' && req.body?.stock_current !== undefined
          ? Math.max(0, Math.floor(toNumber(req.body.stock_current, Number(existing.stock_current))))
          : Number(existing.stock_current);
      const stockMin = Math.max(0, Math.floor(toNumber(req.body?.stock_min, Number(existing.stock_min))));
      const marginPercent = Math.max(0, roundMoney(toNumber(req.body?.margin_percent, Number(existing.margin_percent))));
      const costCurrent = Math.max(0, roundMoney(toNumber(req.body?.cost_current, Number(existing.cost_current))));
      const priceCurrent = Math.max(0, roundMoney(toNumber(req.body?.price_current, Number(existing.price_current))));

      try {
        db.prepare(
          `UPDATE products SET
            sku = ?, barcode = ?, name = ?, description = ?, category_id = ?, category = ?, unit = ?, location = ?,
            stock_current = ?, stock_min = ?, cost_current = ?, margin_percent = ?, price_current = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          sku,
          barcode,
          name,
          description,
          resolvedCat.category_id,
          resolvedCat.category,
          unit,
          location,
          stockCurrent,
          stockMin,
          costCurrent,
          marginPercent,
          priceCurrent,
          id
        );
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        res.json({ product });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE')) {
          res.status(409).json({ error: 'El SKU o código de barras ya pertenece a otro producto.' });
          return;
        }
        res.status(500).json({ error: 'Error al actualizar el producto.' });
      }
    }
  );

  app.delete('/api/products/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id, name FROM products WHERE id = ?').get(id) as
      | { id: number; name: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Producto no encontrado.' });
      return;
    }

    const movCount = (db.prepare('SELECT COUNT(*) as c FROM movements WHERE product_id = ?').get(id) as { c: number }).c;
    const ordCount = (db.prepare('SELECT COUNT(*) as c FROM order_items WHERE product_id = ?').get(id) as { c: number }).c;
    if (movCount > 0 || ordCount > 0) {
      res.status(409).json({
        error: `No se puede eliminar "${existing.name}" porque tiene ${movCount} movimiento(s) y ${ordCount} línea(s) de pedido asociadas.`,
      });
      return;
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ── MOVIMIENTOS: INGRESOS (CON ANÁLISIS DE COSTO Y NUEVO PRECIO) Y SALIDAS ─
  app.get(
    '/api/movements',
    requireAuth,
    requirePermission('view_inventory'),
    (req: AuthenticatedRequest, res: Response) => {
      const type = sanitizeString(req.query.type, 20).toUpperCase();
      const q = sanitizeString(req.query.q, 100).toLowerCase();
      const month = sanitizeString(req.query.month, 2);
      const year = sanitizeString(req.query.year, 4);

      let sql = `
        SELECT m.*, p.sku, p.barcode, p.name as product_name, p.unit, p.category,
               u.name as operator_name, r.name as operator_role
        FROM movements m
        JOIN products p ON p.id = m.product_id
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE 1=1
      `;
      const params: Array<string | number> = [];

      if (type === 'INGRESO' || type === 'SALIDA') {
        sql += ' AND m.type = ?';
        params.push(type);
      }
      if (year) {
        sql += " AND strftime('%Y', m.created_at) = ?";
        params.push(year);
      }
      if (month) {
        sql += " AND strftime('%m', m.created_at) = ?";
        params.push(month.padStart(2, '0'));
      }
      if (q) {
        sql +=
          ' AND (LOWER(m.folio) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(p.barcode) LIKE ? OR LOWER(m.responsible_name) LIKE ? OR LOWER(m.reason_detail) LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
      }

      sql += ' ORDER BY m.created_at DESC, m.id DESC LIMIT 200';
      const movements = db.prepare(sql).all(...params);
      res.json({ movements });
    }
  );

  app.post(
    '/api/movements/entry',
    requireAuth,
    requirePermission('register_entry'),
    (req: AuthenticatedRequest, res: Response) => {
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
        res.status(400).json({ error: 'Selecciona un producto, una cantidad mayor a 0 y un costo de ingreso válido.' });
        return;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
          | {
              id: number;
              stock_current: number;
              cost_current: number;
              margin_percent: number;
              price_current: number;
            }
          | undefined;

        if (!product) {
          db.exec('ROLLBACK');
          res.status(404).json({ error: 'Producto no encontrado.' });
          return;
        }

        const oldStock = product.stock_current;
        const oldCost = product.cost_current;
        const oldPrice = product.price_current;
        const newStock = oldStock + quantity;

        // Weighted Average Cost: (oldStock * oldCost + quantity * costEntry) / newStock
        const weightedCost =
          oldStock > 0
            ? roundMoney((oldStock * oldCost + quantity * costEntry) / newStock)
            : roundMoney(costEntry);

        const activeMargin = marginOverride !== null && marginOverride >= 0 ? marginOverride : product.margin_percent;
        const newPrice =
          customNewPrice !== null && customNewPrice >= 0
            ? customNewPrice
            : roundMoney(weightedCost * (1 + activeMargin / 100));

        const resultingMargin =
          weightedCost > 0 ? roundMoney(((newPrice - weightedCost) / weightedCost) * 100) : activeMargin;

        const folio = nextFolio('ING');
        const totalValue = roundMoney(quantity * costEntry);

        db.prepare(
          `UPDATE products
           SET stock_current = ?, cost_previous = ?, cost_current = ?, margin_percent = ?, price_current = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(newStock, oldCost, weightedCost, resultingMargin, newPrice, productId);

        const movRes = db
          .prepare(
            `INSERT INTO movements (
              folio, type, product_id, quantity, cost_previous, cost_entry, cost_resulting,
              price_previous, price_resulting, total_value, responsible_name, responsible_area,
              reason_detail, user_id
            ) VALUES (?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            folio,
            productId,
            quantity,
            oldCost,
            costEntry,
            weightedCost,
            oldPrice,
            newPrice,
            totalValue,
            responsibleName,
            responsibleArea,
            reasonDetail,
            req.authUser!.id
          );

        db.exec('COMMIT');

        const movement = db
          .prepare(
            `SELECT m.*, p.sku, p.barcode, p.name as product_name, p.unit
             FROM movements m JOIN products p ON p.id = m.product_id WHERE m.id = ?`
          )
          .get(Number(movRes.lastInsertRowid));
        const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
        res.status(201).json({ movement, product: updatedProduct });
      } catch (err) {
        db.exec('ROLLBACK');
        console.error('Entry movement error:', err);
        res.status(500).json({ error: 'No se pudo registrar el ingreso.' });
      }
    }
  );

  app.post(
    '/api/movements/exit',
    requireAuth,
    requirePermission('register_exit'),
    (req: AuthenticatedRequest, res: Response) => {
      const productId = Number(req.body?.product_id);
      const quantity = Math.floor(toNumber(req.body?.quantity, 0));
      const responsibleName = sanitizeString(req.body?.responsible_name, 120);
      const responsibleArea = sanitizeString(req.body?.responsible_area, 120);
      const reasonDetail = sanitizeString(req.body?.reason_detail, 400);

      if (!productId || quantity <= 0) {
        res.status(400).json({ error: 'Selecciona un producto y una cantidad válida mayor a 0.' });
        return;
      }
      if (!responsibleName || !reasonDetail) {
        res.status(400).json({ error: 'Debes especificar el responsable y el detalle de la salida.' });
        return;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
          | {
              id: number;
              name: string;
              stock_current: number;
              cost_current: number;
              price_current: number;
            }
          | undefined;

        if (!product) {
          db.exec('ROLLBACK');
          res.status(404).json({ error: 'Producto no encontrado.' });
          return;
        }
        if (product.stock_current < quantity) {
          db.exec('ROLLBACK');
          res.status(400).json({
            error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock_current}.`,
          });
          return;
        }

        const newStock = product.stock_current - quantity;
        const folio = nextFolio('SAL');
        const totalValue = roundMoney(quantity * product.cost_current);

        db.prepare("UPDATE products SET stock_current = ?, updated_at = datetime('now') WHERE id = ?").run(
          newStock,
          productId
        );

        const movRes = db
          .prepare(
            `INSERT INTO movements (
              folio, type, product_id, quantity, cost_previous, cost_entry, cost_resulting,
              price_previous, price_resulting, total_value, responsible_name, responsible_area,
              reason_detail, user_id
            ) VALUES (?, 'SALIDA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            folio,
            productId,
            quantity,
            product.cost_current,
            product.cost_current,
            product.cost_current,
            product.price_current,
            product.price_current,
            totalValue,
            responsibleName,
            responsibleArea || 'Operaciones',
            reasonDetail,
            req.authUser!.id
          );

        db.exec('COMMIT');

        const movement = db
          .prepare(
            `SELECT m.*, p.sku, p.barcode, p.name as product_name, p.unit, u.name as operator_name
             FROM movements m
             JOIN products p ON p.id = m.product_id
             LEFT JOIN users u ON u.id = m.user_id
             WHERE m.id = ?`
          )
          .get(Number(movRes.lastInsertRowid));
        res.status(201).json({ movement });
      } catch (err) {
        db.exec('ROLLBACK');
        console.error('Exit movement error:', err);
        res.status(500).json({ error: 'No se pudo registrar la salida.' });
      }
    }
  );

  // Admin CRUD: Editar y Eliminar movimientos
  app.put('/api/movements/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM movements WHERE id = ?').get(id) as
      | {
          id: number;
          folio: string;
          responsible_name: string;
          responsible_area: string;
          reason_detail: string;
          created_at: string;
        }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Movimiento no encontrado.' });
      return;
    }

    const folio = sanitizeString(req.body?.folio, 40).toUpperCase() || existing.folio;
    const responsibleName =
      req.body?.responsible_name !== undefined
        ? sanitizeString(req.body.responsible_name, 120)
        : existing.responsible_name;
    const responsibleArea =
      req.body?.responsible_area !== undefined
        ? sanitizeString(req.body.responsible_area, 120)
        : existing.responsible_area;
    const reasonDetail =
      req.body?.reason_detail !== undefined ? sanitizeString(req.body.reason_detail, 400) : existing.reason_detail;

    try {
      db.prepare(
        `UPDATE movements
         SET folio = ?, responsible_name = ?, responsible_area = ?, reason_detail = ?
         WHERE id = ?`
      ).run(folio, responsibleName, responsibleArea, reasonDetail, id);
      const updated = db
        .prepare(
          `SELECT m.*, p.sku, p.barcode, p.name as product_name, p.unit, u.name as operator_name
           FROM movements m
           JOIN products p ON p.id = m.product_id
           LEFT JOIN users u ON u.id = m.user_id
           WHERE m.id = ?`
        )
        .get(id);
      res.json({ movement: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        res.status(409).json({ error: 'El folio ingresado ya pertenece a otro movimiento.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo actualizar el movimiento.' });
    }
  });

  app.delete('/api/movements/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    db.exec('BEGIN IMMEDIATE');
    try {
      const mov = db.prepare('SELECT * FROM movements WHERE id = ?').get(id) as
        | { id: number; type: 'INGRESO' | 'SALIDA'; product_id: number; quantity: number }
        | undefined;
      if (!mov) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Movimiento no encontrado.' });
        return;
      }

      const prod = db.prepare('SELECT id, stock_current FROM products WHERE id = ?').get(mov.product_id) as
        | { id: number; stock_current: number }
        | undefined;

      if (prod) {
        const delta = mov.type === 'INGRESO' ? -mov.quantity : mov.quantity;
        const nextStock = prod.stock_current + delta;
        if (nextStock < 0) {
          db.exec('ROLLBACK');
          res.status(409).json({
            error: `No se puede eliminar este ingreso porque el stock actual (${prod.stock_current}) quedaría negativo al revertir ${mov.quantity} unidades.`,
          });
          return;
        }
        db.prepare("UPDATE products SET stock_current = ?, updated_at = datetime('now') WHERE id = ?").run(
          nextStock,
          prod.id
        );
      }

      db.prepare('DELETE FROM movements WHERE id = ?').run(id);
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'No se pudo eliminar el movimiento.' });
    }
  });

  // ── PEDIDOS DE ALMACÉN Y AUTORIZACIONES ───────────────────────────────────
  app.get('/api/orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const canSeeAll =
      req.authUser!.permissions.approve_orders || req.authUser!.permissions.register_exit;

    const orders = db
      .prepare(
        canSeeAll
          ? 'SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 100'
          : 'SELECT * FROM orders WHERE requester_id = ? ORDER BY created_at DESC, id DESC LIMIT 100'
      )
      .all(...(canSeeAll ? [] : [req.authUser!.id])) as Array<Record<string, unknown>>;

    const itemStmt = db.prepare(`
      SELECT oi.*, p.sku, p.barcode, p.name as product_name, p.unit, p.stock_current, p.cost_current
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `);

    const enriched = orders.map((o) => ({
      ...o,
      items: itemStmt.all(Number(o.id)),
    }));

    res.json({ orders: enriched });
  });

  app.post(
    '/api/orders',
    requireAuth,
    requirePermission('request_order'),
    (req: AuthenticatedRequest, res: Response) => {
      const department = sanitizeString(req.body?.department, 120) || req.authUser!.department;
      const priority = req.body?.priority === 'Urgente' ? 'Urgente' : 'Normal';
      const notes = sanitizeString(req.body?.notes, 400);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (items.length === 0) {
        res.status(400).json({ error: 'Agrega al menos un producto al pedido.' });
        return;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const folio = nextFolio('PED');
        const orderRes = db
          .prepare(
            `INSERT INTO orders (folio, requester_id, requester_name, department, priority, status, notes)
             VALUES (?, ?, ?, ?, ?, 'Pendiente', ?)`
          )
          .run(folio, req.authUser!.id, req.authUser!.name, department, priority, notes);

        const orderId = Number(orderRes.lastInsertRowid);
        const insertItem = db.prepare(
          'INSERT INTO order_items (order_id, product_id, quantity_requested, quantity_approved) VALUES (?, ?, ?, 0)'
        );

        let validCount = 0;
        for (const item of items) {
          const pid = Number(item?.product_id);
          const qty = Math.floor(toNumber(item?.quantity, 0));
          if (!pid || qty <= 0) continue;
          const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(pid);
          if (!exists) continue;
          insertItem.run(orderId, pid, qty);
          validCount++;
        }

        if (validCount === 0) {
          db.exec('ROLLBACK');
          res.status(400).json({ error: 'Los artículos del pedido no son válidos.' });
          return;
        }

        db.exec('COMMIT');
        res.status(201).json({ id: orderId, folio });
      } catch (err) {
        db.exec('ROLLBACK');
        console.error('Create order error:', err);
        res.status(500).json({ error: 'No se pudo crear la solicitud de pedido.' });
      }
    }
  );

  app.post(
    '/api/orders/:id/review',
    requireAuth,
    requirePermission('approve_orders'),
    (req: AuthenticatedRequest, res: Response) => {
      const orderId = Number(req.params.id);
      const decision = req.body?.decision === 'Aprobado' ? 'Aprobado' : 'Rechazado';
      const reviewNotes = sanitizeString(req.body?.review_notes, 300);

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
        | { id: number; status: string }
        | undefined;
      if (!order) {
        res.status(404).json({ error: 'Pedido no encontrado.' });
        return;
      }
      if (order.status !== 'Pendiente') {
        res.status(400).json({ error: 'Solo se pueden revisar pedidos en estado Pendiente.' });
        return;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `UPDATE orders
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?
           WHERE id = ?`
        ).run(decision, req.authUser!.name, reviewNotes, orderId);

        if (decision === 'Aprobado') {
          db.prepare('UPDATE order_items SET quantity_approved = quantity_requested WHERE order_id = ?').run(orderId);
        }
        db.exec('COMMIT');
        res.json({ ok: true, status: decision });
      } catch {
        db.exec('ROLLBACK');
        res.status(500).json({ error: 'No se pudo actualizar la autorización del pedido.' });
      }
    }
  );

  app.post(
    '/api/orders/:id/dispatch',
    requireAuth,
    requirePermission('register_exit'),
    (req: AuthenticatedRequest, res: Response) => {
      const orderId = Number(req.params.id);
      const responsibleOverride = sanitizeString(req.body?.responsible_name, 120);

      db.exec('BEGIN IMMEDIATE');
      try {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
          | {
              id: number;
              folio: string;
              requester_name: string;
              department: string;
              status: string;
              notes: string;
              reviewed_by: string | null;
            }
          | undefined;

        if (!order) {
          db.exec('ROLLBACK');
          res.status(404).json({ error: 'Pedido no encontrado.' });
          return;
        }
        if (order.status !== 'Aprobado') {
          db.exec('ROLLBACK');
          res.status(400).json({ error: 'El pedido debe estar Autorizado antes de despachar la salida.' });
          return;
        }

        const items = db
          .prepare(
            `SELECT oi.*, p.name as product_name, p.stock_current, p.cost_current, p.price_current
             FROM order_items oi JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ?`
          )
          .all(orderId) as Array<{
          product_id: number;
          quantity_requested: number;
          quantity_approved: number;
          product_name: string;
          stock_current: number;
          cost_current: number;
          price_current: number;
        }>;

        const createdMovements: Array<Record<string, unknown>> = [];

        for (const item of items) {
          const qty = item.quantity_approved > 0 ? item.quantity_approved : item.quantity_requested;
          if (item.stock_current < qty) {
            db.exec('ROLLBACK');
            res.status(400).json({
              error: `Stock insuficiente para "${item.product_name}". Disponible: ${item.stock_current}, requerido: ${qty}.`,
            });
            return;
          }

          db.prepare("UPDATE products SET stock_current = stock_current - ?, updated_at = datetime('now') WHERE id = ?").run(
            qty,
            item.product_id
          );

          const folio = nextFolio('SAL');
          const totalValue = roundMoney(qty * item.cost_current);
          const detail = `Despacho de pedido autorizado ${order.folio}${order.notes ? ` — ${order.notes}` : ''}`;

          const movRes = db
            .prepare(
              `INSERT INTO movements (
                folio, type, product_id, quantity, cost_previous, cost_entry, cost_resulting,
                price_previous, price_resulting, total_value, responsible_name, responsible_area,
                reason_detail, order_id, user_id
              ) VALUES (?, 'SALIDA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              folio,
              item.product_id,
              qty,
              item.cost_current,
              item.cost_current,
              item.cost_current,
              item.price_current,
              item.price_current,
              totalValue,
              responsibleOverride || order.requester_name,
              order.department,
              detail,
              orderId,
              req.authUser!.id
            );

          const mov = db
            .prepare(
              `SELECT m.*, p.sku, p.barcode, p.name as product_name, p.unit, u.name as operator_name
               FROM movements m
               JOIN products p ON p.id = m.product_id
               LEFT JOIN users u ON u.id = m.user_id
               WHERE m.id = ?`
            )
            .get(Number(movRes.lastInsertRowid)) as Record<string, unknown>;
          createdMovements.push(mov);
        }

        db.prepare(
          "UPDATE orders SET status = 'Despachado', dispatched_by = ?, dispatched_at = datetime('now') WHERE id = ?"
        ).run(req.authUser!.name, orderId);

        db.exec('COMMIT');
        res.json({ ok: true, movements: createdMovements });
      } catch (err) {
        db.exec('ROLLBACK');
        console.error('Dispatch order error:', err);
        res.status(500).json({ error: 'No se pudo despachar el pedido.' });
      }
    }
  );

  // Admin CRUD: Editar y Eliminar pedidos
  app.put('/api/orders/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const orderId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      | {
          id: number;
          department: string;
          priority: 'Normal' | 'Urgente';
          status: 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Despachado';
          notes: string;
          review_notes: string | null;
        }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    const department = sanitizeString(req.body?.department, 120) || existing.department;
    const priority = req.body?.priority === 'Urgente' ? 'Urgente' : req.body?.priority === 'Normal' ? 'Normal' : existing.priority;
    const validStatuses = new Set(['Pendiente', 'Aprobado', 'Rechazado', 'Despachado']);
    const status = validStatuses.has(String(req.body?.status)) ? String(req.body.status) : existing.status;
    const notes = req.body?.notes !== undefined ? sanitizeString(req.body.notes, 400) : existing.notes;
    const reviewNotes =
      req.body?.review_notes !== undefined
        ? sanitizeString(req.body.review_notes, 300)
        : existing.review_notes || '';

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `UPDATE orders SET department = ?, priority = ?, status = ?, notes = ?, review_notes = ? WHERE id = ?`
      ).run(department, priority, status, notes, reviewNotes, orderId);

      if (Array.isArray(req.body?.items) && req.body.items.length > 0) {
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
        const ins = db.prepare(
          'INSERT INTO order_items (order_id, product_id, quantity_requested, quantity_approved) VALUES (?, ?, ?, ?)'
        );
        for (const item of req.body.items) {
          const pid = Number(item?.product_id);
          const qtyReq = Math.floor(toNumber(item?.quantity_requested ?? item?.quantity, 0));
          const qtyApp = Math.max(0, Math.floor(toNumber(item?.quantity_approved, status === 'Aprobado' || status === 'Despachado' ? qtyReq : 0)));
          if (!pid || qtyReq <= 0) continue;
          ins.run(orderId, pid, qtyReq, qtyApp);
        }
      }

      db.exec('COMMIT');
      res.json({ ok: true });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
    }
  });

  app.delete('/api/orders/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const orderId = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
    if (!existing) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE movements SET order_id = NULL WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'No se pudo eliminar el pedido.' });
    }
  });

  // ── REPORTES MENSUALES, ANUALES, POR USUARIO Y POR CATEGORÍA ──────────────
  app.get(
    '/api/reports/summary',
    requireAuth,
    requirePermission('view_reports'),
    (req: AuthenticatedRequest, res: Response) => {
      const mode = req.query.mode === 'annual' ? 'annual' : 'monthly';
      const year = sanitizeString(req.query.year, 4) || String(new Date().getFullYear());
      const month = (sanitizeString(req.query.month, 2) || String(new Date().getMonth() + 1)).padStart(2, '0');
      const ym = `${year}-${month}`;

      const rawUserId = Number(req.query.user_id);
      const userId = Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : null;

      const rawCategoryId = Number(req.query.category_id);
      const categoryId = Number.isInteger(rawCategoryId) && rawCategoryId > 0 ? rawCategoryId : null;

      const dateFilter =
        mode === 'annual'
          ? "strftime('%Y', m.created_at) = ?"
          : "strftime('%Y-%m', m.created_at) = ?";
      const dateParam = mode === 'annual' ? year : ym;

      const movConditions: string[] = [dateFilter];
      const movParams: Array<string | number> = [dateParam];

      if (userId !== null) {
        movConditions.push('m.user_id = ?');
        movParams.push(userId);
      }
      if (categoryId !== null) {
        movConditions.push('p.category_id = ?');
        movParams.push(categoryId);
      }
      const movWhere = movConditions.join(' AND ');

      const totals = db
        .prepare(
          `SELECT
            COUNT(*) as total_movements,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN 1 ELSE 0 END), 0) as ingreso_count,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN 1 ELSE 0 END), 0) as salida_count,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.quantity ELSE 0 END), 0) as ingreso_units,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.quantity ELSE 0 END), 0) as salida_units,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.total_value ELSE 0 END), 0) as ingreso_value,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.total_value ELSE 0 END), 0) as salida_value
           FROM movements m
           JOIN products p ON p.id = m.product_id
           WHERE ${movWhere}`
        )
        .get(...movParams) as Record<string, number>;

      const periodExpr = mode === 'annual' ? "strftime('%m', m.created_at)" : "strftime('%Y-%m-%d', m.created_at)";
      const breakdown = db
        .prepare(
          `SELECT
            ${periodExpr} as period_key,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN 1 ELSE 0 END), 0) as ingreso_count,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN 1 ELSE 0 END), 0) as salida_count,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.quantity ELSE 0 END), 0) as ingreso_units,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.quantity ELSE 0 END), 0) as salida_units,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.total_value ELSE 0 END), 0) as ingreso_value,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.total_value ELSE 0 END), 0) as salida_value
           FROM movements m
           JOIN products p ON p.id = m.product_id
           WHERE ${movWhere}
           GROUP BY period_key
           ORDER BY period_key ASC`
        )
        .all(...movParams);

      // Products filtered by category if selected; movement sub-join filtered by date + user_id
      const prodMovJoinConds: string[] = ['m.product_id = p.id', dateFilter];
      const prodMovJoinParams: Array<string | number> = [dateParam];
      if (userId !== null) {
        prodMovJoinConds.push('m.user_id = ?');
        prodMovJoinParams.push(userId);
      }

      const prodWhere = categoryId !== null ? 'WHERE p.category_id = ?' : '';
      const prodWhereParams = categoryId !== null ? [categoryId] : [];

      const topProducts = db
        .prepare(
          `SELECT
            p.id, p.sku, p.barcode, p.name, p.category_id, COALESCE(c.name, p.category) as category,
            p.unit, p.stock_current, p.stock_min, p.cost_previous, p.cost_current, p.price_current,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.quantity ELSE 0 END), 0) as total_in,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.quantity ELSE 0 END), 0) as total_out,
            COALESCE(SUM(m.total_value), 0) as total_value
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN movements m ON ${prodMovJoinConds.join(' AND ')}
           ${prodWhere}
           GROUP BY p.id
           ORDER BY (total_in + total_out) DESC, p.name ASC`
        )
        .all(...prodMovJoinParams, ...prodWhereParams);

      // Category summary report
      const catFilterSql = categoryId !== null ? 'WHERE c.id = ?' : '';
      const catFilterParams = categoryId !== null ? [categoryId] : [];
      const categoryReport = db
        .prepare(
          `SELECT
            c.id, c.code, c.name,
            COUNT(DISTINCT p.id) as product_count,
            (SELECT COALESCE(SUM(p2.stock_current), 0) FROM products p2 WHERE p2.category_id = c.id) as stock_units,
            (SELECT COALESCE(SUM(p2.stock_current * p2.cost_current), 0) FROM products p2 WHERE p2.category_id = c.id) as inventory_cost_value,
            (SELECT COALESCE(SUM(p2.stock_current * p2.price_current), 0) FROM products p2 WHERE p2.category_id = c.id) as inventory_sale_value,
            COUNT(m.id) as total_movements,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.quantity ELSE 0 END), 0) as ingreso_units,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.quantity ELSE 0 END), 0) as salida_units,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.total_value ELSE 0 END), 0) as ingreso_value,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.total_value ELSE 0 END), 0) as salida_value
           FROM categories c
           LEFT JOIN products p ON p.category_id = c.id
           LEFT JOIN movements m ON ${prodMovJoinConds.join(' AND ')}
           ${catFilterSql}
           GROUP BY c.id
           ORDER BY (ingreso_value + salida_value) DESC, c.name ASC`
        )
        .all(...prodMovJoinParams, ...catFilterParams);

      // User activity report (respecting period & category filter)
      const userMovJoinConds: string[] = ['m.user_id = u.id', dateFilter];
      const userMovJoinParams: Array<string | number> = [dateParam];
      if (categoryId !== null) {
        userMovJoinConds.push('m.product_id IN (SELECT id FROM products WHERE category_id = ?)');
        userMovJoinParams.push(categoryId);
      }

      const userWhereSql = userId !== null ? 'WHERE u.id = ?' : '';
      const userWhereParams = userId !== null ? [userId] : [];

      const userReport = db
        .prepare(
          `SELECT
            u.id, u.name, u.email, u.department, r.name as role_name, r.slug as role_slug,
            COUNT(m.id) as movement_count,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN 1 ELSE 0 END), 0) as ingreso_count,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN 1 ELSE 0 END), 0) as salida_count,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.quantity ELSE 0 END), 0) as ingreso_units,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.quantity ELSE 0 END), 0) as salida_units,
            COALESCE(SUM(m.quantity), 0) as total_units,
            COALESCE(SUM(CASE WHEN m.type = 'INGRESO' THEN m.total_value ELSE 0 END), 0) as ingreso_value,
            COALESCE(SUM(CASE WHEN m.type = 'SALIDA' THEN m.total_value ELSE 0 END), 0) as salida_value,
            COALESCE(SUM(m.total_value), 0) as total_value,
            (SELECT COUNT(*) FROM orders o WHERE o.requester_id = u.id) as orders_requested
           FROM users u
           JOIN roles r ON r.id = u.role_id
           LEFT JOIN movements m ON ${userMovJoinConds.join(' AND ')}
           ${userWhereSql}
           GROUP BY u.id
           ORDER BY movement_count DESC, u.name ASC`
        )
        .all(...userMovJoinParams, ...userWhereParams);

      // Detailed movements for active period + user + category filters
      const movementDetails = db
        .prepare(
          `SELECT
            m.id, m.folio, m.type, m.product_id, m.quantity, m.cost_previous, m.cost_entry,
            m.cost_resulting, m.price_previous, m.price_resulting, m.total_value,
            m.responsible_name, m.responsible_area, m.reason_detail, m.user_id, m.created_at,
            p.sku, p.barcode, p.name as product_name, p.unit, p.category_id,
            COALESCE(c.name, p.category) as category,
            u.name as operator_name, r.name as operator_role
           FROM movements m
           JOIN products p ON p.id = m.product_id
           LEFT JOIN categories c ON c.id = p.category_id
           LEFT JOIN users u ON u.id = m.user_id
           LEFT JOIN roles r ON r.id = u.role_id
           WHERE ${movWhere}
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 200`
        )
        .all(...movParams);

      const filterUsers = db
        .prepare(
          `SELECT u.id, u.name, u.department, r.name as role_name
           FROM users u JOIN roles r ON r.id = u.role_id
           ORDER BY u.name ASC`
        )
        .all();

      const filterCategories = db
        .prepare('SELECT id, code, name FROM categories ORDER BY name ASC')
        .all();

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
        filterUsers,
        filterCategories,
      });
    }
  );

  // ── USUARIOS, ROLES Y PERMISOS CONFIGURABLES ──────────────────────────────
  app.get(
    '/api/users',
    requireAuth,
    requirePermission('manage_users'),
    (_req: AuthenticatedRequest, res: Response) => {
      const users = db
        .prepare(
          `SELECT u.id, u.name, u.email, u.role_id, u.department, u.active, u.created_at,
                  r.slug as role_slug, r.name as role_name
           FROM users u
           JOIN roles r ON r.id = u.role_id
           ORDER BY u.id ASC`
        )
        .all();
      res.json({ users });
    }
  );

  app.post(
    '/api/users',
    requireAuth,
    requirePermission('manage_users'),
    (req: AuthenticatedRequest, res: Response) => {
      const name = sanitizeString(req.body?.name, 120);
      const email = sanitizeString(req.body?.email, 160).toLowerCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const roleId = Number(req.body?.role_id);
      const department = sanitizeString(req.body?.department, 120) || 'Operaciones';

      if (!name || !email || !email.includes('@') || password.length < 6 || !roleId) {
        res.status(400).json({
          error: 'Completa nombre, correo válido, rol y una contraseña de al menos 6 caracteres.',
        });
        return;
      }

      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId);
      if (!role) {
        res.status(400).json({ error: 'Rol inválido.' });
        return;
      }

      try {
        const result = db
          .prepare(
            'INSERT INTO users (name, email, password_hash, role_id, department, active) VALUES (?, ?, ?, ?, ?, 1)'
          )
          .run(name, email, hashPassword(password), roleId, department);

        const created = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.role_id, u.department, u.active, u.created_at,
                    r.slug as role_slug, r.name as role_name
             FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
          )
          .get(Number(result.lastInsertRowid));
        res.status(201).json({ user: created });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE')) {
          res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
          return;
        }
        res.status(500).json({ error: 'No se pudo crear el usuario.' });
      }
    }
  );

  app.put(
    '/api/users/:id',
    requireAuth,
    requirePermission('manage_users'),
    (req: AuthenticatedRequest, res: Response) => {
      const targetId = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as
        | { id: number; role_id: number; name: string; email: string; department: string; active: number }
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }

      const name = sanitizeString(req.body?.name, 120) || existing.name;
      const email =
        req.body?.email !== undefined
          ? sanitizeString(req.body.email, 160).toLowerCase()
          : existing.email;
      const department = sanitizeString(req.body?.department, 120) || existing.department;
      const roleId = req.body?.role_id ? Number(req.body.role_id) : existing.role_id;
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
      const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
        return;
      }

      if (targetId === req.authUser!.id && active === 0) {
        res.status(400).json({ error: 'No puedes desactivar tu propia cuenta en sesión.' });
        return;
      }

      if (newPassword && newPassword.length < 6) {
        res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        return;
      }

      try {
        if (newPassword) {
          db.prepare(
            'UPDATE users SET name = ?, email = ?, department = ?, role_id = ?, active = ?, password_hash = ? WHERE id = ?'
          ).run(name, email, department, roleId, active, hashPassword(newPassword), targetId);
        } else {
          db.prepare('UPDATE users SET name = ?, email = ?, department = ?, role_id = ?, active = ? WHERE id = ?').run(
            name,
            email,
            department,
            roleId,
            active,
            targetId
          );
        }

        const updated = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.role_id, u.department, u.active, u.created_at,
                    r.slug as role_slug, r.name as role_name
             FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
          )
          .get(targetId);
        res.json({ user: updated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE')) {
          res.status(409).json({ error: 'Ya existe otro usuario con ese correo electrónico.' });
          return;
        }
        res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
      }
    }
  );

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const targetId = Number(req.params.id);
    if (targetId === req.authUser!.id) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta en sesión.' });
      return;
    }

    const target = db
      .prepare(
        `SELECT u.id, u.name, r.slug as role_slug
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ?`
      )
      .get(targetId) as { id: number; name: string; role_slug: string } | undefined;

    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    if (target.role_slug === 'admin') {
      const adminCount = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'admin' AND u.active = 1`
          )
          .get() as { c: number }
      ).c;
      if (adminCount <= 1) {
        res.status(409).json({ error: 'Debe existir al menos un Administrador activo en el sistema.' });
        return;
      }
    }

    const ordCount = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE requester_id = ?').get(targetId) as { c: number }).c;
    const movCount = (db.prepare('SELECT COUNT(*) as c FROM movements WHERE user_id = ?').get(targetId) as { c: number }).c;
    if (ordCount > 0 || movCount > 0) {
      res.status(409).json({
        error: `No se puede eliminar a "${target.name}" porque tiene ${movCount} movimiento(s) y ${ordCount} pedido(s) registrados. Puedes desactivarlo desde Editar.`,
      });
      return;
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    res.json({ ok: true });
  });

  app.get(
    '/api/roles',
    requireAuth,
    requirePermission('manage_users'),
    (_req: AuthenticatedRequest, res: Response) => {
      const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as Array<{
        id: number;
        slug: string;
        name: string;
        description: string;
        is_system: number;
      }>;
      const permStmt = db.prepare('SELECT permission_key, allowed FROM role_permissions WHERE role_id = ?');

      const enriched = roles.map((role) => {
        const rows = permStmt.all(role.id) as Array<{ permission_key: PermissionKey; allowed: number }>;
        const permissions: Record<string, boolean> = {};
        for (const r of rows) {
          permissions[r.permission_key] = r.allowed === 1;
        }
        return { ...role, permissions };
      });

      res.json({ roles: enriched, catalog: ALL_PERMISSIONS });
    }
  );

  app.post('/api/roles', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
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

    db.exec('BEGIN IMMEDIATE');
    try {
      const insertRes = db
        .prepare('INSERT INTO roles (slug, name, description, is_system) VALUES (?, ?, ?, 0)')
        .run(slug, name, description);
      const roleId = Number(insertRes.lastInsertRowid);
      const insPerm = db.prepare(
        'INSERT INTO role_permissions (role_id, permission_key, allowed) VALUES (?, ?, ?)'
      );
      for (const perm of ALL_PERMISSIONS) {
        insPerm.run(roleId, perm.key, incomingPerms[perm.key] ? 1 : 0);
      }
      db.exec('COMMIT');
      res.status(201).json({ id: roleId, slug, name, description, is_system: 0 });
    } catch (err) {
      db.exec('ROLLBACK');
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        res.status(409).json({ error: 'Ya existe un rol con ese identificador (slug).' });
        return;
      }
      res.status(500).json({ error: 'No se pudo crear el rol.' });
    }
  });

  app.put('/api/roles/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const roleId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as
      | { id: number; slug: string; name: string; description: string; is_system: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Rol no encontrado.' });
      return;
    }

    const name = sanitizeString(req.body?.name, 80) || existing.name;
    const description =
      req.body?.description !== undefined ? sanitizeString(req.body.description, 260) : existing.description;
    const slug =
      existing.is_system === 1
        ? existing.slug
        : sanitizeString(req.body?.slug, 40)
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_') || existing.slug;

    try {
      db.prepare('UPDATE roles SET slug = ?, name = ?, description = ? WHERE id = ?').run(
        slug,
        name,
        description,
        roleId
      );
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE')) {
        res.status(409).json({ error: 'El identificador (slug) ya está en uso.' });
        return;
      }
      res.status(500).json({ error: 'No se pudo actualizar el rol.' });
    }
  });

  app.delete('/api/roles/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const roleId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as
      | { id: number; name: string; is_system: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Rol no encontrado.' });
      return;
    }
    if (existing.is_system === 1) {
      res.status(409).json({ error: `El rol base "${existing.name}" es del sistema y no se puede eliminar.` });
      return;
    }

    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE role_id = ?').get(roleId) as { c: number }).c;
    if (userCount > 0) {
      res.status(409).json({
        error: `No se puede eliminar "${existing.name}" porque tiene ${userCount} usuario(s) asignado(s).`,
      });
      return;
    }

    db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
    res.json({ ok: true });
  });

  app.put(
    '/api/roles/:id/permissions',
    requireAuth,
    requirePermission('manage_users'),
    (req: AuthenticatedRequest, res: Response) => {
      const roleId = Number(req.params.id);
      const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as
        | { id: number; slug: string; name: string }
        | undefined;
      if (!role) {
        res.status(404).json({ error: 'Rol no encontrado.' });
        return;
      }

      const incoming = req.body?.permissions;
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ error: 'Formato de permisos inválido.' });
        return;
      }

      const validKeys = new Set<string>(ALL_PERMISSIONS.map((p) => p.key));
      const upsert = db.prepare(
        `INSERT INTO role_permissions (role_id, permission_key, allowed)
         VALUES (?, ?, ?)
         ON CONFLICT(role_id, permission_key) DO UPDATE SET allowed = excluded.allowed`
      );

      db.exec('BEGIN IMMEDIATE');
      try {
        for (const [key, val] of Object.entries(incoming as Record<string, unknown>)) {
          if (!validKeys.has(key)) continue;
          // Prevent admin from locking themselves out of user/role management
          const allowed = role.slug === 'admin' && key === 'manage_users' ? 1 : val ? 1 : 0;
          upsert.run(roleId, key, allowed);
        }
        db.exec('COMMIT');
        res.json({ ok: true });
      } catch {
        db.exec('ROLLBACK');
        res.status(500).json({ error: 'No se pudieron guardar los permisos.' });
      }
    }
  );
}
