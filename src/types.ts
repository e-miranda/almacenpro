export type PermissionKey =
  | 'view_dashboard'
  | 'view_inventory'
  | 'manage_products'
  | 'register_entry'
  | 'register_exit'
  | 'request_order'
  | 'approve_orders'
  | 'view_reports'
  | 'manage_users';

export interface AuthUser {
  id: number;
  uid?: string | null;
  username?: string | null;
  has_password?: boolean;
  name: string;
  email: string;
  role_id: number;
  role_slug: 'admin' | 'almacenista' | 'usuario' | string;
  role_name: string;
  sector_id?: number | null;
  department: string;
  permissions: Record<PermissionKey, boolean>;
}

export interface AuthSystemStatus {
  needsSetup: boolean;
  hasEnvPasscode: boolean;
  allowRegistration: boolean;
  sectors: Array<{ id: number; name: string }>;
}

export interface Sector {
  id: number;
  code: string;
  name: string;
  description: string;
  active: number;
  created_at: string;
  personnel_count?: number;
}

export interface Personnel {
  id: number;
  code: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  sector_id: number;
  sector_name: string;
  sector_code?: string;
  active: number;
  created_at: string;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  description: string;
  active: number;
  created_at: string;
  product_count?: number;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category_id?: number | null;
  category: string;
  unit: string;
  location: string;
  stock_current: number;
  stock_min: number;
  cost_previous: number;
  cost_current: number;
  margin_percent: number;
  price_current: number;
  updated_at: string;
  created_at: string;
}

export interface ExitBatch {
  id: number;
  folio: string;
  personnel_id?: number | null;
  sector_id?: number | null;
  responsible_name: string;
  responsible_area: string;
  reason_detail: string;
  total_value: number;
  created_at: string;
}

export interface Movement {
  id: number;
  folio: string;
  type: 'INGRESO' | 'SALIDA';
  product_id: number;
  quantity: number;
  cost_previous: number;
  cost_entry: number;
  cost_resulting: number;
  price_previous: number;
  price_resulting: number;
  total_value: number;
  personnel_id?: number | null;
  sector_id?: number | null;
  responsible_name: string;
  responsible_area: string;
  reason_detail: string;
  exit_batch_id?: number | null;
  order_id: number | null;
  user_id: number | null;
  created_at: string;
  sku: string;
  barcode: string;
  product_name: string;
  unit: string;
  category?: string;
  operator_name?: string;
  operator_role?: string;
  personnel_name?: string;
  sector_name?: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity_requested: number;
  quantity_approved: number;
  sku: string;
  barcode: string;
  product_name: string;
  unit: string;
  stock_current: number;
  cost_current: number;
}

export interface WarehouseOrder {
  id: number;
  folio: string;
  requester_id: number;
  requester_name: string;
  personnel_id?: number | null;
  sector_id?: number | null;
  personnel_name?: string;
  sector_name?: string;
  department: string;
  priority: 'Normal' | 'Urgente';
  status: 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Despachado';
  notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  dispatched_by: string | null;
  dispatched_at: string | null;
  created_at: string;
  items: OrderItem[];
}

export interface DashboardData {
  kpis: {
    total_products: number;
    total_units: number;
    inventory_cost_value: number;
    inventory_sale_value: number;
    out_of_stock_count: number;
    low_stock_count: number;
    entries_count: number;
    exits_count: number;
    entries_value: number;
    exits_value: number;
    pending_orders: number;
    approved_to_dispatch: number;
  };
  alerts: Product[];
  recentMovements: Movement[];
  monthlySeries: Array<{
    ym: string;
    ingreso_qty: number;
    salida_qty: number;
    ingreso_val: number;
    salida_val: number;
  }>;
  serverTime: string;
}

export interface ReportSummary {
  mode: 'monthly' | 'annual';
  year: string;
  month: string;
  user_id?: number | null;
  category_id?: number | null;
  totals: {
    total_movements: number;
    ingreso_count: number;
    salida_count: number;
    ingreso_units: number;
    salida_units: number;
    ingreso_value: number;
    salida_value: number;
  };
  breakdown: Array<{
    period_key: string;
    ingreso_count: number;
    salida_count: number;
    ingreso_units: number;
    salida_units: number;
    ingreso_value: number;
    salida_value: number;
  }>;
  categoryReport: Array<{
    id: number;
    code: string;
    name: string;
    product_count: number;
    stock_units: number;
    inventory_cost_value: number;
    inventory_sale_value: number;
    total_movements: number;
    ingreso_units: number;
    salida_units: number;
    ingreso_value: number;
    salida_value: number;
  }>;
  topProducts: Array<
    Product & {
      total_in: number;
      total_out: number;
      total_value: number;
    }
  >;
  userReport: Array<{
    id: number;
    name: string;
    email: string;
    department: string;
    role_name: string;
    role_slug: string;
    movement_count: number;
    ingreso_count: number;
    salida_count: number;
    ingreso_units: number;
    salida_units: number;
    total_units: number;
    ingreso_value: number;
    salida_value: number;
    total_value: number;
    orders_requested: number;
  }>;
  movementDetails: Movement[];
  ingresoDetails?: Movement[];
  egresoDetails?: Movement[];
  filterUsers: Array<{ id: number; name: string; department: string; role_name: string }>;
  filterCategories: Array<{ id: number; code: string; name: string }>;
}

export interface RoleConfig {
  id: number;
  slug: string;
  name: string;
  description: string;
  is_system?: number;
  permissions: Record<string, boolean>;
}

export interface PermissionCatalogItem {
  key: PermissionKey;
  label: string;
  group: string;
}

export interface SystemUser {
  id: number;
  uid?: string | null;
  username?: string | null;
  has_password?: boolean;
  name: string;
  email: string;
  role_id: number;
  sector_id?: number | null;
  department: string;
  active: number;
  created_at: string;
  role_slug: string;
  role_name: string;
}
