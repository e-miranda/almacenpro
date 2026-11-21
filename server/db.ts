import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.resolve(DATA_DIR, 'warehouse.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export const ALL_PERMISSIONS = [
  { key: 'view_dashboard', label: 'Ver Dashboard en Tiempo Real', group: 'Monitoreo' },
  { key: 'view_inventory', label: 'Ver Catálogo e Inventario', group: 'Inventario' },
  { key: 'manage_products', label: 'Crear y Editar Productos / Precios', group: 'Inventario' },
  { key: 'register_entry', label: 'Registrar Ingresos y Análisis de Costo', group: 'Movimientos' },
  { key: 'register_exit', label: 'Registrar y Despachar Salidas', group: 'Movimientos' },
  { key: 'request_order', label: 'Solicitar Pedidos de Almacén', group: 'Pedidos' },
  { key: 'approve_orders', label: 'Autorizar o Rechazar Pedidos', group: 'Pedidos' },
  { key: 'view_reports', label: 'Ver Reportes Mensuales, Anuales y PDF', group: 'Reportes' },
  { key: 'manage_users', label: 'Administrar Usuarios y Roles', group: 'Administración' },
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]['key'];

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (role_id, permission_key),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      role_id INTEGER NOT NULL,
      department TEXT NOT NULL DEFAULT 'Operaciones',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'Pza',
      location TEXT NOT NULL DEFAULT 'Pasillo A',
      stock_current INTEGER NOT NULL DEFAULT 0,
      stock_min INTEGER NOT NULL DEFAULT 5,
      cost_previous REAL NOT NULL DEFAULT 0,
      cost_current REAL NOT NULL DEFAULT 0,
      margin_percent REAL NOT NULL DEFAULT 30,
      price_current REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('INGRESO', 'SALIDA')),
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      cost_previous REAL NOT NULL DEFAULT 0,
      cost_entry REAL NOT NULL DEFAULT 0,
      cost_resulting REAL NOT NULL DEFAULT 0,
      price_previous REAL NOT NULL DEFAULT 0,
      price_resulting REAL NOT NULL DEFAULT 0,
      total_value REAL NOT NULL DEFAULT 0,
      responsible_name TEXT NOT NULL DEFAULT '',
      responsible_area TEXT NOT NULL DEFAULT '',
      reason_detail TEXT NOT NULL DEFAULT '',
      order_id INTEGER,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT NOT NULL UNIQUE,
      requester_id INTEGER NOT NULL,
      requester_name TEXT NOT NULL,
      department TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'Urgente')),
      status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Aprobado', 'Rechazado', 'Despachado')),
      notes TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      dispatched_by TEXT,
      dispatched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (requester_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity_requested INTEGER NOT NULL CHECK (quantity_requested > 0),
      quantity_approved INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  ensureProductCategoryColumn();
  seedRolesAndPermissions();
  seedCategories();
  seedCatalogAndHistory();
  syncProductCategoryLinks();
}

function ensureProductCategoryColumn(): void {
  const cols = db.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>;
  const hasCatId = cols.some((c) => c.name === 'category_id');
  if (!hasCatId) {
    db.exec('ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL');
  }
}

function seedCategories(): void {
  const defaultCategories = [
    {
      code: 'CAT-HERR',
      name: 'Herramientas Eléctricas',
      description: 'Equipos eléctricos portátiles y maquinaria de taller.',
    },
    {
      code: 'CAT-EPP',
      name: 'Seguridad EPP',
      description: 'Equipo de protección personal, cascos, guantes y lentes.',
    },
    {
      code: 'CAT-ELEC',
      name: 'Material Eléctrico',
      description: 'Conductores, cableado, luminarias y tableros.',
    },
    {
      code: 'CAT-LUB',
      name: 'Lubricantes y Químicos',
      description: 'Aceites hidráulicos, grasas y fluidos industriales.',
    },
    {
      code: 'CAT-EMP',
      name: 'Logística y Empaque',
      description: 'Insumos de embalaje, cintas y película stretch.',
    },
    {
      code: 'CAT-CONS',
      name: 'Herramientas y Consumibles',
      description: 'Discos abrasivos, brocas y consumibles de corte.',
    },
  ];

  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (code, name, description, active) VALUES (?, ?, ?, 1)'
  );
  for (const cat of defaultCategories) {
    insertCat.run(cat.code, cat.name, cat.description);
  }

  // Also ensure any existing product category strings are registered in categories
  const existingProductCats = db
    .prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND trim(category) != ''")
    .all() as Array<{ category: string }>;

  let seq = 100;
  for (const row of existingProductCats) {
    const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(row.category);
    if (!exists) {
      seq += 1;
      insertCat.run(`CAT-${seq}`, row.category, 'Categoría migrada desde catálogo de productos.');
    }
  }
}

function syncProductCategoryLinks(): void {
  db.exec(`
    UPDATE products
    SET category_id = (
      SELECT c.id FROM categories c WHERE LOWER(c.name) = LOWER(products.category) LIMIT 1
    )
    WHERE category_id IS NULL
  `);
}

function seedRolesAndPermissions(): void {
  const roleCount = db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number };
  if (roleCount.c > 0) return;

  const insertRole = db.prepare(
    'INSERT INTO roles (slug, name, description, is_system) VALUES (?, ?, ?, 1)'
  );
  const insertPerm = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_id, permission_key, allowed) VALUES (?, ?, ?)'
  );

  const adminId = Number(
    insertRole.run(
      'admin',
      'Administrador',
      'Control total del sistema, autorización de pedidos, análisis de costos, reportes y configuración de roles.'
    ).lastInsertRowid
  );
  const almacenistaId = Number(
    insertRole.run(
      'almacenista',
      'Almacenista',
      'Privilegios operativos restringidos: escaneo, ingresos con análisis de costo, salidas autorizadas y despacho.'
    ).lastInsertRowid
  );
  const usuarioId = Number(
    insertRole.run(
      'usuario',
      'Usuario Solicitante',
      'Privilegios restringidos de consulta de stock, escaneo y solicitud de pedidos de almacén.'
    ).lastInsertRowid
  );

  const almacenistaPerms = new Set<PermissionKey>([
    'view_dashboard',
    'view_inventory',
    'register_entry',
    'register_exit',
    'request_order',
    'view_reports',
  ]);

  const usuarioPerms = new Set<PermissionKey>([
    'view_dashboard',
    'view_inventory',
    'request_order',
  ]);

  for (const perm of ALL_PERMISSIONS) {
    insertPerm.run(adminId, perm.key, 1);
    insertPerm.run(almacenistaId, perm.key, almacenistaPerms.has(perm.key) ? 1 : 0);
    insertPerm.run(usuarioId, perm.key, usuarioPerms.has(perm.key) ? 1 : 0);
  }
}

function seedCatalogAndHistory(): void {
  const prodCount = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  if (prodCount.c > 0) return;

  const productsSeed = [
    {
      sku: 'FER-001',
      barcode: '7501000100014',
      name: 'Taladro Percutor Industrial 850W',
      description: 'Taladro percutor de velocidad variable con mandril metálico 13mm para uso continuo.',
      category: 'Herramientas Eléctricas',
      unit: 'Pza',
      location: 'Pasillo A · Rack 01',
      stock_current: 14,
      stock_min: 5,
      cost_previous: 118.0,
      cost_current: 124.5,
      margin_percent: 32,
      price_current: 164.34,
    },
    {
      sku: 'EPP-002',
      barcode: '7501000100021',
      name: 'Casco de Seguridad Dieléctrico Tipo I',
      description: 'Casco industrial polietileno de alta densidad con suspensión de 6 puntos y ajuste ratchet.',
      category: 'Seguridad EPP',
      unit: 'Pza',
      location: 'Pasillo B · Rack 04',
      stock_current: 42,
      stock_min: 15,
      cost_previous: 14.2,
      cost_current: 15.0,
      margin_percent: 35,
      price_current: 20.25,
    },
    {
      sku: 'EPP-003',
      barcode: '7501000100038',
      name: 'Guantes Anticorte Nivel 5 Nitrilo',
      description: 'Par de guantes recubiertos en nitrilo arenoso para manipulación de lámina y vidrio.',
      category: 'Seguridad EPP',
      unit: 'Par',
      location: 'Pasillo B · Rack 05',
      stock_current: 6,
      stock_min: 20,
      cost_previous: 6.4,
      cost_current: 7.1,
      margin_percent: 30,
      price_current: 9.23,
    },
    {
      sku: 'ELE-004',
      barcode: '7501000100045',
      name: 'Cable THHN Calibre 12 AWG (Rollo 100m)',
      description: 'Conductor de cobre electrolítico con aislamiento termoplástico resistente a humedad.',
      category: 'Material Eléctrico',
      unit: 'Rollo',
      location: 'Pasillo C · Rack 02',
      stock_current: 19,
      stock_min: 8,
      cost_previous: 52.0,
      cost_current: 56.4,
      margin_percent: 28,
      price_current: 72.19,
    },
    {
      sku: 'LUB-005',
      barcode: '7501000100052',
      name: 'Aceite Hidráulico ISO VG 46 (Cubeta 19L)',
      description: 'Fluido hidráulico antidesgaste de alto índice de viscosidad para maquinaria pesada.',
      category: 'Lubricantes y Químicos',
      unit: 'Cubeta',
      location: 'Zona D · Estiba 02',
      stock_current: 4,
      stock_min: 6,
      cost_previous: 78.5,
      cost_current: 84.0,
      margin_percent: 25,
      price_current: 105.0,
    },
    {
      sku: 'EMP-006',
      barcode: '7501000100069',
      name: 'Película Stretch Film Calibre 80 (Caja x4)',
      description: 'Rollo de película estirable manual 18 pulgadas x 1500 pies para paletizado.',
      category: 'Logística y Empaque',
      unit: 'Caja',
      location: 'Pasillo E · Rack 01',
      stock_current: 28,
      stock_min: 10,
      cost_previous: 41.0,
      cost_current: 39.5,
      margin_percent: 30,
      price_current: 51.35,
    },
    {
      sku: 'FER-007',
      barcode: '7501000100076',
      name: 'Disco de Corte Metal 4-1/2" (Paquete x25)',
      description: 'Discos abrasivos ultrafinos de óxido de aluminio para acero inoxidable y carbono.',
      category: 'Herramientas y Consumibles',
      unit: 'Paq',
      location: 'Pasillo A · Rack 03',
      stock_current: 0,
      stock_min: 8,
      cost_previous: 22.0,
      cost_current: 23.8,
      margin_percent: 35,
      price_current: 32.13,
    },
    {
      sku: 'ELE-008',
      barcode: '7501000100083',
      name: 'Luminaria LED High Bay 150W 5000K',
      description: 'Campana industrial LED IP65 con disipador de aluminio fundido y driver regulable.',
      category: 'Material Eléctrico',
      unit: 'Pza',
      location: 'Pasillo C · Rack 06',
      stock_current: 11,
      stock_min: 4,
      cost_previous: 64.0,
      cost_current: 61.5,
      margin_percent: 34,
      price_current: 82.41,
    },
    {
      sku: 'EPP-009',
      barcode: '7501000100090',
      name: 'Lentes de Seguridad Antiempañante UV',
      description: 'Policarbonato transparente con recubrimiento antirrayaduras y patillas ajustables.',
      category: 'Seguridad EPP',
      unit: 'Pza',
      location: 'Pasillo B · Rack 02',
      stock_current: 54,
      stock_min: 20,
      cost_previous: 4.1,
      cost_current: 4.35,
      margin_percent: 40,
      price_current: 6.09,
    },
    {
      sku: 'EMP-010',
      barcode: '7501000100106',
      name: 'Cinta Adhesiva de Empaque 48mm x 150m (Caja x36)',
      description: 'Cinta acrílica transparente de alta adhesión para sellado de cajas de cartón.',
      category: 'Logística y Empaque',
      unit: 'Caja',
      location: 'Pasillo E · Rack 03',
      stock_current: 16,
      stock_min: 6,
      cost_previous: 29.0,
      cost_current: 30.2,
      margin_percent: 30,
      price_current: 39.26,
    },
  ];

  const insertProd = db.prepare(`
    INSERT INTO products (
      sku, barcode, name, description, category, unit, location,
      stock_current, stock_min, cost_previous, cost_current, margin_percent, price_current
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const productIds: number[] = [];
  for (const p of productsSeed) {
    const res = insertProd.run(
      p.sku,
      p.barcode,
      p.name,
      p.description,
      p.category,
      p.unit,
      p.location,
      p.stock_current,
      p.stock_min,
      p.cost_previous,
      p.cost_current,
      p.margin_percent,
      p.price_current
    );
    productIds.push(Number(res.lastInsertRowid));
  }

  // Seed historical movements across 2026 so Monthly & Annual reports are immediately populated
  const historicalMovements = [
    {
      folio: 'ING-2026-0001',
      type: 'INGRESO',
      idx: 0,
      qty: 10,
      cPrev: 118.0,
      cEntry: 126.0,
      cRes: 124.5,
      pPrev: 155.76,
      pRes: 164.34,
      resp: 'Recepción Almacén Central',
      area: 'Compras',
      detail: 'Reposición trimestral herramientas eléctricas - OC-401',
      date: '2026-08-14 09:30:00',
    },
    {
      folio: 'SAL-2026-0002',
      type: 'SALIDA',
      idx: 1,
      qty: 8,
      cPrev: 15.0,
      cEntry: 15.0,
      cRes: 15.0,
      pPrev: 20.25,
      pRes: 20.25,
      resp: 'Carlos Méndez',
      area: 'Mantenimiento Planta',
      detail: 'Dotación de cascos dieléctricos para cuadrilla de subestación',
      date: '2026-08-22 14:15:00',
    },
    {
      folio: 'ING-2026-0003',
      type: 'INGRESO',
      idx: 3,
      qty: 15,
      cPrev: 52.0,
      cEntry: 58.0,
      cRes: 56.4,
      pPrev: 66.56,
      pRes: 72.19,
      resp: 'Proveedor ElectroNorte',
      area: 'Compras',
      detail: 'Ingreso lote cableado proyecto nave B',
      date: '2026-09-05 11:00:00',
    },
    {
      folio: 'SAL-2026-0004',
      type: 'SALIDA',
      idx: 4,
      qty: 5,
      cPrev: 84.0,
      cEntry: 84.0,
      cRes: 84.0,
      pPrev: 105.0,
      pRes: 105.0,
      resp: 'Laura Paredes',
      area: 'Producción Línea 2',
      detail: 'Cambio programado de fluido hidráulico en prensas 4 y 5',
      date: '2026-09-18 16:40:00',
    },
    {
      folio: 'ING-2026-0005',
      type: 'INGRESO',
      idx: 5,
      qty: 20,
      cPrev: 41.0,
      cEntry: 38.8,
      cRes: 39.5,
      pPrev: 53.3,
      pRes: 51.35,
      resp: 'Empaques del Sur',
      area: 'Logística',
      detail: 'Compra volumen Q4 película stretch con descuento negociado',
      date: '2026-10-08 10:20:00',
    },
    {
      folio: 'SAL-2026-0006',
      type: 'SALIDA',
      idx: 6,
      qty: 12,
      cPrev: 23.8,
      cEntry: 23.8,
      cRes: 23.8,
      pPrev: 32.13,
      pRes: 32.13,
      resp: 'Jorge Villalobos',
      area: 'Taller Soldadura',
      detail: 'Suministro de discos abrasivos para fabricación de estructuras',
      date: '2026-10-25 08:50:00',
    },
    {
      folio: 'ING-2026-0007',
      type: 'INGRESO',
      idx: 2,
      qty: 12,
      cPrev: 6.4,
      cEntry: 7.45,
      cRes: 7.1,
      pPrev: 8.32,
      pRes: 9.23,
      resp: 'Seguridad Industrial S.A.',
      area: 'Compras',
      detail: 'Reposición parcial de guantes nivel 5 - OC-489',
      date: '2026-11-03 10:15:00',
    },
    {
      folio: 'SAL-2026-0008',
      type: 'SALIDA',
      idx: 2,
      qty: 14,
      cPrev: 7.1,
      cEntry: 7.1,
      cRes: 7.1,
      pPrev: 9.23,
      pRes: 9.23,
      resp: 'Roberto Aguilar',
      area: 'Corte y Lámina',
      detail: 'Entrega quincenal EPP operadores turno matutino y vespertino',
      date: '2026-11-11 13:10:00',
    },
    {
      folio: 'ING-2026-0009',
      type: 'INGRESO',
      idx: 7,
      qty: 8,
      cPrev: 64.0,
      cEntry: 60.2,
      cRes: 61.5,
      pPrev: 85.76,
      pRes: 82.41,
      resp: 'Iluminación Pro',
      area: 'Mantenimiento',
      detail: 'Refacciones LED para ampliación zona de embarques',
      date: '2026-11-15 15:30:00',
    },
    {
      folio: 'SAL-2026-0010',
      type: 'SALIDA',
      idx: 9,
      qty: 6,
      cPrev: 30.2,
      cEntry: 30.2,
      cRes: 30.2,
      pPrev: 39.26,
      pRes: 39.26,
      resp: 'Andrea Domínguez',
      area: 'Despachos y Embarques',
      detail: 'Cajas de cinta para sellado de pedidos nacionales semana 46',
      date: '2026-11-18 11:45:00',
    },
  ];

  const insertMov = db.prepare(`
    INSERT INTO movements (
      folio, type, product_id, quantity, cost_previous, cost_entry, cost_resulting,
      price_previous, price_resulting, total_value, responsible_name, responsible_area,
      reason_detail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const m of historicalMovements) {
    const pid = productIds[m.idx];
    const total = Number((m.qty * m.cRes).toFixed(2));
    insertMov.run(
      m.folio,
      m.type,
      pid,
      m.qty,
      m.cPrev,
      m.cEntry,
      m.cRes,
      m.pPrev,
      m.pRes,
      total,
      m.resp,
      m.area,
      m.detail,
      m.date
    );
  }
}

export function nextFolio(prefix: 'ING' | 'SAL' | 'PED'): string {
  const year = new Date().getFullYear();
  const table = prefix === 'PED' ? 'orders' : 'movements';
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE folio LIKE ?`)
    .get(`${prefix}-${year}-%`) as { c: number };
  const seq = String((row?.c ?? 0) + 1).padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}
