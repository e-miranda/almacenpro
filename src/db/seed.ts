import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  exitBatches,
  movements,
  personnel,
  products,
  rolePermissions,
  roles,
  sectors,
} from './schema.ts';

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

let seedPromise: Promise<void> | null = null;
let seededDone = false;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (seededDone) return;
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

async function runSeed(): Promise<void> {
  try {
    // 1. Roles & Permissions
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length === 0) {
      const [adminRole] = await db
        .insert(roles)
        .values({
          slug: 'admin',
          name: 'Administrador',
          description:
            'Control total del sistema, autorización de pedidos, análisis de costos, reportes y CRUD completo.',
          isSystem: 1,
        })
        .onConflictDoNothing()
        .returning();

      const [almacenistaRole] = await db
        .insert(roles)
        .values({
          slug: 'almacenista',
          name: 'Almacenista',
          description:
            'Privilegios operativos: consulta de stock, ingresos con análisis de costo, salidas multiproducto y despacho.',
          isSystem: 1,
        })
        .onConflictDoNothing()
        .returning();

      const [usuarioRole] = await db
        .insert(roles)
        .values({
          slug: 'usuario',
          name: 'Usuario Solicitante',
          description:
            'Privilegios restringidos de consulta de stock en tiempo real y solicitud de pedidos de almacén.',
          isSystem: 1,
        })
        .onConflictDoNothing()
        .returning();

      const adminId =
        adminRole?.id ??
        (await db.select().from(roles).where(eq(roles.slug, 'admin')))[0]?.id;
      const almacenistaId =
        almacenistaRole?.id ??
        (await db.select().from(roles).where(eq(roles.slug, 'almacenista')))[0]?.id;
      const usuarioId =
        usuarioRole?.id ??
        (await db.select().from(roles).where(eq(roles.slug, 'usuario')))[0]?.id;

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

      const permValues: Array<{ roleId: number; permissionKey: string; allowed: number }> = [];
      for (const perm of ALL_PERMISSIONS) {
        if (adminId) {
          permValues.push({ roleId: adminId, permissionKey: perm.key, allowed: 1 });
        }
        if (almacenistaId) {
          permValues.push({
            roleId: almacenistaId,
            permissionKey: perm.key,
            allowed: almacenistaPerms.has(perm.key) ? 1 : 0,
          });
        }
        if (usuarioId) {
          permValues.push({
            roleId: usuarioId,
            permissionKey: perm.key,
            allowed: usuarioPerms.has(perm.key) ? 1 : 0,
          });
        }
      }
      if (permValues.length > 0) {
        await db.insert(rolePermissions).values(permValues).onConflictDoNothing();
      }
    }

    // 2. Sectors & Personnel
    const [{ totalSectors }] = await db.select({ totalSectors: count() }).from(sectors);
    if (Number(totalSectors) === 0) {
      const sectorSeed = [
        {
          code: 'SEC-MANT',
          name: 'Mantenimiento Planta',
          description: 'Mantenimiento preventivo y correctivo de maquinaria e infraestructura.',
        },
        {
          code: 'SEC-PROD',
          name: 'Producción Línea 1 y 2',
          description: 'Líneas principales de manufactura, prensas y ensamblaje.',
        },
        {
          code: 'SEC-LOG',
          name: 'Logística y Despachos',
          description: 'Embalaje, almacén central, carga y distribución.',
        },
        {
          code: 'SEC-SOLD',
          name: 'Taller de Soldadura y Corte',
          description: 'Fabricación metálica, soldadura y corte de lámina.',
        },
        {
          code: 'SEC-ELEC',
          name: 'Instalaciones Eléctricas',
          description: 'Subestación, tableros de control, cableado e iluminación.',
        },
        {
          code: 'SEC-ADM',
          name: 'Administración y Compras',
          description: 'Gestión administrativa, adquisiciones y control operativo.',
        },
      ];

      await db.insert(sectors).values(sectorSeed).onConflictDoNothing();
      const allSectors = await db.select().from(sectors);
      const secByCode = new Map(allSectors.map((s) => [s.code, s.id]));

      const personnelSeed = [
        {
          code: 'PER-001',
          name: 'Carlos Méndez',
          position: 'Jefe de Cuadrilla Eléctrica',
          email: 'carlos.mendez@empresa.bo',
          phone: '71200401',
          sectorId: secByCode.get('SEC-ELEC') ?? allSectors[0].id,
        },
        {
          code: 'PER-002',
          name: 'Laura Paredes',
          position: 'Supervisora de Producción',
          email: 'laura.paredes@empresa.bo',
          phone: '71200402',
          sectorId: secByCode.get('SEC-PROD') ?? allSectors[0].id,
        },
        {
          code: 'PER-003',
          name: 'Jorge Villalobos',
          position: 'Maestro Soldador',
          email: 'jorge.villalobos@empresa.bo',
          phone: '71200403',
          sectorId: secByCode.get('SEC-SOLD') ?? allSectors[0].id,
        },
        {
          code: 'PER-004',
          name: 'Roberto Aguilar',
          position: 'Operador de Corte y Lámina',
          email: 'roberto.aguilar@empresa.bo',
          phone: '71200404',
          sectorId: secByCode.get('SEC-SOLD') ?? allSectors[0].id,
        },
        {
          code: 'PER-005',
          name: 'Andrea Domínguez',
          position: 'Coordinadora de Despachos',
          email: 'andrea.dominguez@empresa.bo',
          phone: '71200405',
          sectorId: secByCode.get('SEC-LOG') ?? allSectors[0].id,
        },
        {
          code: 'PER-006',
          name: 'Miguel Ángel Torrez',
          position: 'Técnico de Mantenimiento',
          email: 'miguel.torrez@empresa.bo',
          phone: '71200406',
          sectorId: secByCode.get('SEC-MANT') ?? allSectors[0].id,
        },
        {
          code: 'PER-007',
          name: 'Sofía Navarro',
          position: 'Planificadora de Mantenimiento',
          email: 'sofia.navarro@empresa.bo',
          phone: '71200407',
          sectorId: secByCode.get('SEC-MANT') ?? allSectors[0].id,
        },
        {
          code: 'PER-008',
          name: 'Marcos Beltrán',
          position: 'Encargado de Almacén',
          email: 'marcos.beltran@empresa.bo',
          phone: '71200408',
          sectorId: secByCode.get('SEC-LOG') ?? allSectors[0].id,
        },
      ];
      await db.insert(personnel).values(personnelSeed).onConflictDoNothing();
    }

    // 3. Categories
    const [{ totalCats }] = await db.select({ totalCats: count() }).from(categories);
    if (Number(totalCats) === 0) {
      await db
        .insert(categories)
        .values([
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
        ])
        .onConflictDoNothing();
    }

    // 4. Products & Historical Movements
    const [{ totalProds }] = await db.select({ totalProds: count() }).from(products);
    if (Number(totalProds) === 0) {
      const allCats = await db.select().from(categories);
      const catByName = new Map(allCats.map((c) => [c.name, c.id]));

      const productsSeed = [
        {
          sku: 'FER-001',
          barcode: '7501000100014',
          name: 'Taladro Percutor Industrial 850W',
          description:
            'Taladro percutor de velocidad variable con mandril metálico 13mm para uso continuo.',
          categoryId: catByName.get('Herramientas Eléctricas') ?? null,
          category: 'Herramientas Eléctricas',
          unit: 'Pza',
          location: 'Pasillo A · Rack 01',
          stockCurrent: 14,
          stockMin: 5,
          costPrevious: 118.0,
          costCurrent: 124.5,
          marginPercent: 32,
          priceCurrent: 164.34,
        },
        {
          sku: 'EPP-002',
          barcode: '7501000100021',
          name: 'Casco de Seguridad Dieléctrico Tipo I',
          description:
            'Casco industrial polietileno de alta densidad con suspensión de 6 puntos y ajuste ratchet.',
          categoryId: catByName.get('Seguridad EPP') ?? null,
          category: 'Seguridad EPP',
          unit: 'Pza',
          location: 'Pasillo B · Rack 04',
          stockCurrent: 42,
          stockMin: 15,
          costPrevious: 14.2,
          costCurrent: 15.0,
          marginPercent: 35,
          priceCurrent: 20.25,
        },
        {
          sku: 'EPP-003',
          barcode: '7501000100038',
          name: 'Guantes Anticorte Nivel 5 Nitrilo',
          description:
            'Par de guantes recubiertos en nitrilo arenoso para manipulación de lámina y vidrio.',
          categoryId: catByName.get('Seguridad EPP') ?? null,
          category: 'Seguridad EPP',
          unit: 'Par',
          location: 'Pasillo B · Rack 05',
          stockCurrent: 6,
          stockMin: 20,
          costPrevious: 6.4,
          costCurrent: 7.1,
          marginPercent: 30,
          priceCurrent: 9.23,
        },
        {
          sku: 'ELE-004',
          barcode: '7501000100045',
          name: 'Cable THHN Calibre 12 AWG (Rollo 100m)',
          description:
            'Conductor de cobre electrolítico con aislamiento termoplástico resistente a humedad.',
          categoryId: catByName.get('Material Eléctrico') ?? null,
          category: 'Material Eléctrico',
          unit: 'Rollo',
          location: 'Pasillo C · Rack 02',
          stockCurrent: 19,
          stockMin: 8,
          costPrevious: 52.0,
          costCurrent: 56.4,
          marginPercent: 28,
          priceCurrent: 72.19,
        },
        {
          sku: 'LUB-005',
          barcode: '7501000100052',
          name: 'Aceite Hidráulico ISO VG 46 (Cubeta 19L)',
          description:
            'Fluido hidráulico antidesgaste de alto índice de viscosidad para maquinaria pesada.',
          categoryId: catByName.get('Lubricantes y Químicos') ?? null,
          category: 'Lubricantes y Químicos',
          unit: 'Cubeta',
          location: 'Zona D · Estiba 02',
          stockCurrent: 4,
          stockMin: 6,
          costPrevious: 78.5,
          costCurrent: 84.0,
          marginPercent: 25,
          priceCurrent: 105.0,
        },
        {
          sku: 'EMP-006',
          barcode: '7501000100069',
          name: 'Película Stretch Film Calibre 80 (Caja x4)',
          description: 'Rollo de película estirable manual 18 pulgadas x 1500 pies para paletizado.',
          categoryId: catByName.get('Logística y Empaque') ?? null,
          category: 'Logística y Empaque',
          unit: 'Caja',
          location: 'Pasillo E · Rack 01',
          stockCurrent: 28,
          stockMin: 10,
          costPrevious: 41.0,
          costCurrent: 39.5,
          marginPercent: 30,
          priceCurrent: 51.35,
        },
        {
          sku: 'FER-007',
          barcode: '7501000100076',
          name: 'Disco de Corte Metal 4-1/2" (Paquete x25)',
          description:
            'Discos abrasivos ultrafinos de óxido de aluminio para acero inoxidable y carbono.',
          categoryId: catByName.get('Herramientas y Consumibles') ?? null,
          category: 'Herramientas y Consumibles',
          unit: 'Paq',
          location: 'Pasillo A · Rack 03',
          stockCurrent: 0,
          stockMin: 8,
          costPrevious: 22.0,
          costCurrent: 23.8,
          marginPercent: 35,
          priceCurrent: 32.13,
        },
        {
          sku: 'ELE-008',
          barcode: '7501000100083',
          name: 'Luminaria LED High Bay 150W 5000K',
          description:
            'Campana industrial LED IP65 con disipador de aluminio fundido y driver regulable.',
          categoryId: catByName.get('Material Eléctrico') ?? null,
          category: 'Material Eléctrico',
          unit: 'Pza',
          location: 'Pasillo C · Rack 06',
          stockCurrent: 11,
          stockMin: 4,
          costPrevious: 64.0,
          costCurrent: 61.5,
          marginPercent: 34,
          priceCurrent: 82.41,
        },
        {
          sku: 'EPP-009',
          barcode: '7501000100090',
          name: 'Lentes de Seguridad Antiempañante UV',
          description:
            'Policarbonato transparente con recubrimiento antirrayaduras y patillas ajustables.',
          categoryId: catByName.get('Seguridad EPP') ?? null,
          category: 'Seguridad EPP',
          unit: 'Pza',
          location: 'Pasillo B · Rack 02',
          stockCurrent: 54,
          stockMin: 20,
          costPrevious: 4.1,
          costCurrent: 4.35,
          marginPercent: 40,
          priceCurrent: 6.09,
        },
        {
          sku: 'EMP-010',
          barcode: '7501000100106',
          name: 'Cinta Adhesiva de Empaque 48mm x 150m (Caja x36)',
          description: 'Cinta acrílica transparente de alta adhesión para sellado de cajas de cartón.',
          categoryId: catByName.get('Logística y Empaque') ?? null,
          category: 'Logística y Empaque',
          unit: 'Caja',
          location: 'Pasillo E · Rack 03',
          stockCurrent: 16,
          stockMin: 6,
          costPrevious: 29.0,
          costCurrent: 30.2,
          marginPercent: 30,
          priceCurrent: 39.26,
        },
      ];

      const insertedProducts = await db
        .insert(products)
        .values(productsSeed)
        .onConflictDoNothing()
        .returning();

      const allPersonnel = await db.select().from(personnel);
      const allSectors = await db.select().from(sectors);
      const personByName = new Map(allPersonnel.map((p) => [p.name, p]));
      const sectorById = new Map(allSectors.map((s) => [s.id, s]));

      const prodList =
        insertedProducts.length > 0 ? insertedProducts : await db.select().from(products);

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
          area: 'Administración y Compras',
          detail: 'Reposición trimestral herramientas eléctricas - OC-401',
          date: new Date('2026-08-14T09:30:00Z'),
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
          area: 'Instalaciones Eléctricas',
          detail: 'Dotación de cascos dieléctricos para cuadrilla de subestación',
          date: new Date('2026-08-22T14:15:00Z'),
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
          area: 'Administración y Compras',
          detail: 'Ingreso lote cableado proyecto nave B',
          date: new Date('2026-09-05T11:00:00Z'),
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
          area: 'Producción Línea 1 y 2',
          detail: 'Cambio programado de fluido hidráulico en prensas 4 y 5',
          date: new Date('2026-09-18T16:40:00Z'),
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
          area: 'Administración y Compras',
          detail: 'Compra volumen Q4 película stretch con descuento negociado',
          date: new Date('2026-10-08T10:20:00Z'),
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
          area: 'Taller de Soldadura y Corte',
          detail: 'Suministro de discos abrasivos para fabricación de estructuras',
          date: new Date('2026-10-25T08:50:00Z'),
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
          area: 'Administración y Compras',
          detail: 'Reposición parcial de guantes nivel 5 - OC-489',
          date: new Date('2026-11-03T10:15:00Z'),
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
          area: 'Taller de Soldadura y Corte',
          detail: 'Entrega quincenal EPP operadores turno matutino y vespertino',
          date: new Date('2026-11-11T13:10:00Z'),
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
          area: 'Mantenimiento Planta',
          detail: 'Refacciones LED para ampliación zona de embarques',
          date: new Date('2026-11-15T15:30:00Z'),
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
          area: 'Logística y Despachos',
          detail: 'Cajas de cinta para sellado de pedidos nacionales semana 46',
          date: new Date('2026-11-18T11:45:00Z'),
        },
      ];

      for (const m of historicalMovements) {
        const prod = prodList[m.idx];
        if (!prod) continue;
        const total = Math.round(m.qty * m.cRes * 100) / 100;
        const pRecord = personByName.get(m.resp);
        const sRecord = pRecord ? sectorById.get(pRecord.sectorId) : undefined;

        let batchId: number | null = null;
        if (m.type === 'SALIDA') {
          const [batch] = await db
            .insert(exitBatches)
            .values({
              folio: m.folio,
              personnelId: pRecord?.id ?? null,
              sectorId: sRecord?.id ?? null,
              responsibleName: m.resp,
              responsibleArea: sRecord?.name || m.area,
              reasonDetail: m.detail,
              totalValue: total,
              createdAt: m.date,
            })
            .onConflictDoNothing()
            .returning();
          batchId = batch?.id ?? null;
        }

        await db.insert(movements).values({
          folio: m.folio,
          type: m.type,
          productId: prod.id,
          quantity: m.qty,
          costPrevious: m.cPrev,
          costEntry: m.cEntry,
          costResulting: m.cRes,
          pricePrevious: m.pPrev,
          priceResulting: m.pRes,
          totalValue: total,
          personnelId: pRecord?.id ?? null,
          sectorId: sRecord?.id ?? null,
          responsibleName: m.resp,
          responsibleArea: sRecord?.name || m.area,
          reasonDetail: m.detail,
          exitBatchId: batchId,
          createdAt: m.date,
        });
      }
    }

    seededDone = true;
  } catch (error) {
    console.error('Database seed failed:', error);
    throw new Error('Error al inicializar los datos base del almacén.', { cause: error });
  }
}
