import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isSystem: integer('is_system').notNull().default(1),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    allowed: integer('allowed').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })]
);

export const sectors = pgTable('sectors', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const personnel = pgTable('personnel', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  position: text('position').notNull().default('Operador'),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  sectorId: integer('sector_id')
    .notNull()
    .references(() => sectors.id, { onDelete: 'restrict' }),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  roleId: integer('role_id')
    .notNull()
    .references(() => roles.id),
  sectorId: integer('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  department: text('department').notNull().default('Operaciones'),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  barcode: text('barcode').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  category: text('category').notNull(),
  unit: text('unit').notNull().default('Pza'),
  location: text('location').notNull().default('Pasillo A'),
  stockCurrent: integer('stock_current').notNull().default(0),
  stockMin: integer('stock_min').notNull().default(5),
  costPrevious: doublePrecision('cost_previous').notNull().default(0),
  costCurrent: doublePrecision('cost_current').notNull().default(0),
  marginPercent: doublePrecision('margin_percent').notNull().default(30),
  priceCurrent: doublePrecision('price_current').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  folio: text('folio').notNull().unique(),
  requesterId: integer('requester_id')
    .notNull()
    .references(() => users.id),
  requesterName: text('requester_name').notNull(),
  personnelId: integer('personnel_id').references(() => personnel.id, { onDelete: 'set null' }),
  sectorId: integer('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  department: text('department').notNull(),
  priority: text('priority').notNull().default('Normal'),
  status: text('status').notNull().default('Pendiente'),
  notes: text('notes').notNull().default(''),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: false }),
  reviewNotes: text('review_notes'),
  dispatchedBy: text('dispatched_by'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: false }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantityRequested: integer('quantity_requested').notNull(),
  quantityApproved: integer('quantity_approved').notNull().default(0),
});

export const exitBatches = pgTable('exit_batches', {
  id: serial('id').primaryKey(),
  folio: text('folio').notNull().unique(),
  personnelId: integer('personnel_id').references(() => personnel.id, { onDelete: 'set null' }),
  sectorId: integer('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  responsibleName: text('responsible_name').notNull().default(''),
  responsibleArea: text('responsible_area').notNull().default(''),
  reasonDetail: text('reason_detail').notNull().default(''),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  totalValue: doublePrecision('total_value').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

export const movements = pgTable('movements', {
  id: serial('id').primaryKey(),
  folio: text('folio').notNull(),
  type: text('type').notNull(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull(),
  costPrevious: doublePrecision('cost_previous').notNull().default(0),
  costEntry: doublePrecision('cost_entry').notNull().default(0),
  costResulting: doublePrecision('cost_resulting').notNull().default(0),
  pricePrevious: doublePrecision('price_previous').notNull().default(0),
  priceResulting: doublePrecision('price_resulting').notNull().default(0),
  totalValue: doublePrecision('total_value').notNull().default(0),
  personnelId: integer('personnel_id').references(() => personnel.id, { onDelete: 'set null' }),
  sectorId: integer('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  responsibleName: text('responsible_name').notNull().default(''),
  responsibleArea: text('responsible_area').notNull().default(''),
  reasonDetail: text('reason_detail').notNull().default(''),
  exitBatchId: integer('exit_batch_id').references(() => exitBatches.id, { onDelete: 'set null' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
});

// Drizzle Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(users),
}));

export const sectorsRelations = relations(sectors, ({ many }) => ({
  personnel: many(personnel),
  users: many(users),
}));

export const personnelRelations = relations(personnel, ({ one }) => ({
  sector: one(sectors, {
    fields: [personnel.sectorId],
    references: [sectors.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  sector: one(sectors, {
    fields: [users.sectorId],
    references: [sectors.id],
  }),
  orders: many(orders),
  movements: many(movements),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  categoryRef: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  movements: many(movements),
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  requester: one(users, {
    fields: [orders.requesterId],
    references: [users.id],
  }),
  personnel: one(personnel, {
    fields: [orders.personnelId],
    references: [personnel.id],
  }),
  sector: one(sectors, {
    fields: [orders.sectorId],
    references: [sectors.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const exitBatchesRelations = relations(exitBatches, ({ one, many }) => ({
  personnel: one(personnel, {
    fields: [exitBatches.personnelId],
    references: [personnel.id],
  }),
  sector: one(sectors, {
    fields: [exitBatches.sectorId],
    references: [sectors.id],
  }),
  user: one(users, {
    fields: [exitBatches.userId],
    references: [users.id],
  }),
  items: many(movements),
}));

export const movementsRelations = relations(movements, ({ one }) => ({
  product: one(products, {
    fields: [movements.productId],
    references: [products.id],
  }),
  exitBatch: one(exitBatches, {
    fields: [movements.exitBatchId],
    references: [exitBatches.id],
  }),
  personnel: one(personnel, {
    fields: [movements.personnelId],
    references: [personnel.id],
  }),
  sector: one(sectors, {
    fields: [movements.sectorId],
    references: [sectors.id],
  }),
  user: one(users, {
    fields: [movements.userId],
    references: [users.id],
  }),
}));
