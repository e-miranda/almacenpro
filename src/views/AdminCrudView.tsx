import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  Check,
  ClipboardList,
  Database,
  Download,
  Edit3,
  FileCode2,
  FolderTree,
  MapPin,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { apiDownload, apiFetch, formatCurrency } from '../lib/api';
import type {
  AuthUser,
  Category,
  Movement,
  PermissionCatalogItem,
  Personnel,
  Product,
  RoleConfig,
  Sector,
  SystemUser,
  WarehouseOrder,
} from '../types';

type CrudTableKey =
  | 'sectors'
  | 'personnel'
  | 'categories'
  | 'products'
  | 'users'
  | 'roles'
  | 'orders'
  | 'movements';

interface AdminCrudViewProps {
  user: AuthUser;
  onDataChanged: () => void;
}

export const AdminCrudView: React.FC<AdminCrudViewProps> = ({ user, onDataChanged }) => {
  const [activeTable, setActiveTable] = useState<CrudTableKey>('sectors');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // All table datasets
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [permCatalog, setPermCatalog] = useState<PermissionCatalogItem[]>([]);
  const [orders, setOrders] = useState<WarehouseOrder[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'sql' | 'json' | null>(null);

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<{
    table: CrudTableKey;
    id: number;
    label: string;
    hint?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form states per table
  const [sectorForm, setSectorForm] = useState<{
    id?: number;
    code: string;
    name: string;
    description: string;
    active: boolean;
  }>({ code: '', name: '', description: '', active: true });

  const [personnelForm, setPersonnelForm] = useState<{
    id?: number;
    code: string;
    name: string;
    position: string;
    email: string;
    phone: string;
    sector_id: number;
    active: boolean;
  }>({
    code: '',
    name: '',
    position: 'Operador',
    email: '',
    phone: '',
    sector_id: 0,
    active: true,
  });

  const [catForm, setCatForm] = useState<{
    id?: number;
    code: string;
    name: string;
    description: string;
    active: boolean;
  }>({ code: '', name: '', description: '', active: true });

  const [prodForm, setProdForm] = useState<{
    id?: number;
    sku: string;
    barcode: string;
    name: string;
    description: string;
    category_id: number;
    unit: string;
    location: string;
    stock_current: number;
    stock_min: number;
    cost_current: number;
    margin_percent: number;
    price_current: number;
  }>({
    sku: '',
    barcode: '',
    name: '',
    description: '',
    category_id: 0,
    unit: 'Pza',
    location: 'Pasillo A · Rack 01',
    stock_current: 0,
    stock_min: 5,
    cost_current: 0,
    margin_percent: 30,
    price_current: 0,
  });

  const [userForm, setUserForm] = useState<{
    id?: number;
    name: string;
    username: string;
    email: string;
    password: string;
    role_id: number;
    sector_id: number;
    department: string;
    active: boolean;
  }>({
    name: '',
    username: '',
    email: '',
    password: '',
    role_id: 0,
    sector_id: 0,
    department: 'Operaciones',
    active: true,
  });

  const [roleForm, setRoleForm] = useState<{
    id?: number;
    slug: string;
    name: string;
    description: string;
    is_system: number;
    permissions: Record<string, boolean>;
  }>({
    slug: '',
    name: '',
    description: '',
    is_system: 0,
    permissions: {},
  });

  const [orderForm, setOrderForm] = useState<{
    id?: number;
    personnel_id: number;
    sector_id: number;
    department: string;
    priority: 'Normal' | 'Urgente';
    status: 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Despachado';
    notes: string;
    review_notes: string;
    items: Array<{ product_id: number; quantity: number }>;
  }>({
    personnel_id: 0,
    sector_id: 0,
    department: 'Operaciones',
    priority: 'Normal',
    status: 'Pendiente',
    notes: '',
    review_notes: '',
    items: [],
  });

  const [movForm, setMovForm] = useState<{
    id?: number;
    folio: string;
    type: 'INGRESO' | 'SALIDA';
    product_id: number;
    quantity: number;
    cost_entry: number;
    items: Array<{ product_id: number; quantity: number }>;
    personnel_id: number;
    sector_id: number;
    responsible_name: string;
    responsible_area: string;
    reason_detail: string;
  }>({
    folio: '',
    type: 'INGRESO',
    product_id: 0,
    quantity: 1,
    cost_entry: 0,
    items: [],
    personnel_id: 0,
    sector_id: 0,
    responsible_name: '',
    responsible_area: '',
    reason_detail: '',
  });

  const loadAllTables = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [secRes, perRes, catRes, prodRes, userRes, roleRes, ordRes, movRes] = await Promise.all([
        apiFetch<{ sectors: Sector[] }>('/api/sectors'),
        apiFetch<{ personnel: Personnel[] }>('/api/personnel'),
        apiFetch<{ categories: Category[] }>('/api/categories'),
        apiFetch<{ products: Product[] }>('/api/products'),
        apiFetch<{ users: SystemUser[] }>('/api/users'),
        apiFetch<{ roles: RoleConfig[]; catalog: PermissionCatalogItem[] }>('/api/roles'),
        apiFetch<{ orders: WarehouseOrder[] }>('/api/orders'),
        apiFetch<{ movements: Movement[] }>('/api/movements'),
      ]);
      setSectors(secRes.sectors);
      setPersonnelList(perRes.personnel);
      setCategories(catRes.categories);
      setProducts(prodRes.products);
      setUsers(userRes.users);
      setRoles(roleRes.roles);
      setPermCatalog(roleRes.catalog);
      setOrders(ordRes.orders);
      setMovements(movRes.movements);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las tablas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllTables();
  }, [loadAllTables]);

  const tableTabs: Array<{
    key: CrudTableKey;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: 'sectors', label: 'Sectores', count: sectors.length, icon: MapPin },
    { key: 'personnel', label: 'Personal', count: personnelList.length, icon: UserCheck },
    { key: 'categories', label: 'Categorías', count: categories.length, icon: FolderTree },
    { key: 'products', label: 'Productos', count: products.length, icon: Boxes },
    { key: 'users', label: 'Usuarios', count: users.length, icon: Users },
    { key: 'roles', label: 'Roles', count: roles.length, icon: Shield },
    { key: 'orders', label: 'Pedidos', count: orders.length, icon: ClipboardList },
    { key: 'movements', label: 'Movimientos', count: movements.length, icon: ArrowLeftRight },
  ];

  const q = search.trim().toLowerCase();

  const filteredSectors = useMemo(
    () =>
      sectors.filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      ),
    [sectors, q]
  );

  const filteredPersonnel = useMemo(
    () =>
      personnelList.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q) ||
          p.sector_name.toLowerCase().includes(q)
      ),
    [personnelList, q]
  );

  const filteredCategories = useMemo(
    () =>
      categories.filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      ),
    [categories, q]
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      ),
    [products, q]
  );

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role_name.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q)
      ),
    [users, q]
  );

  const filteredRoles = useMemo(
    () =>
      roles.filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      ),
    [roles, q]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          !q ||
          o.folio.toLowerCase().includes(q) ||
          o.requester_name.toLowerCase().includes(q) ||
          o.department.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q)
      ),
    [orders, q]
  );

  const filteredMovements = useMemo(
    () =>
      movements.filter(
        (m) =>
          !q ||
          m.folio.toLowerCase().includes(q) ||
          m.product_name.toLowerCase().includes(q) ||
          m.responsible_name.toLowerCase().includes(q) ||
          m.reason_detail.toLowerCase().includes(q)
      ),
    [movements, q]
  );

  const openCreateModal = () => {
    setFormError('');
    setFeedback('');
    if (activeTable === 'sectors') {
      setSectorForm({ code: '', name: '', description: '', active: true });
    } else if (activeTable === 'personnel') {
      setPersonnelForm({
        code: '',
        name: '',
        position: 'Técnico / Operador',
        email: '',
        phone: '',
        sector_id: sectors[0]?.id || 0,
        active: true,
      });
    } else if (activeTable === 'categories') {
      setCatForm({ code: '', name: '', description: '', active: true });
    } else if (activeTable === 'products') {
      setProdForm({
        sku: '',
        barcode: '',
        name: '',
        description: '',
        category_id: categories[0]?.id || 0,
        unit: 'Pza',
        location: 'Pasillo A · Rack 01',
        stock_current: 0,
        stock_min: 5,
        cost_current: 0,
        margin_percent: 30,
        price_current: 0,
      });
    } else if (activeTable === 'users') {
      setUserForm({
        name: '',
        username: '',
        email: '',
        password: '',
        role_id: roles[1]?.id || roles[0]?.id || 0,
        sector_id: sectors[0]?.id || 0,
        department: sectors[0]?.name || 'Operaciones',
        active: true,
      });
    } else if (activeTable === 'roles') {
      const defaults: Record<string, boolean> = {};
      for (const p of permCatalog) {
        defaults[p.key] = p.key === 'view_dashboard' || p.key === 'view_inventory';
      }
      setRoleForm({ slug: '', name: '', description: '', is_system: 0, permissions: defaults });
    } else if (activeTable === 'orders') {
      setOrderForm({
        personnel_id: personnelList[0]?.id || 0,
        sector_id: personnelList[0]?.sector_id || sectors[0]?.id || 0,
        department: personnelList[0]?.sector_name || sectors[0]?.name || 'Operaciones',
        priority: 'Normal',
        status: 'Pendiente',
        notes: '',
        review_notes: '',
        items: products[0] ? [{ product_id: products[0].id, quantity: 1 }] : [],
      });
    } else if (activeTable === 'movements') {
      const firstProd = products[0];
      const firstPer = personnelList[0];
      setMovForm({
        folio: '',
        type: 'INGRESO',
        product_id: firstProd?.id || 0,
        quantity: 1,
        cost_entry: firstProd?.cost_current ?? 0,
        items: firstProd ? [{ product_id: firstProd.id, quantity: 1 }] : [],
        personnel_id: firstPer?.id || 0,
        sector_id: firstPer?.sector_id || sectors[0]?.id || 0,
        responsible_name: firstPer?.name || user.name,
        responsible_area: firstPer?.sector_name || sectors[0]?.name || 'Almacén',
        reason_detail: '',
      });
    }
    setModalMode('create');
  };

  const openEditSector = (s: Sector) => {
    setFormError('');
    setSectorForm({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description,
      active: s.active === 1,
    });
    setModalMode('edit');
  };

  const openEditPersonnel = (p: Personnel) => {
    setFormError('');
    setPersonnelForm({
      id: p.id,
      code: p.code,
      name: p.name,
      position: p.position,
      email: p.email,
      phone: p.phone,
      sector_id: p.sector_id,
      active: p.active === 1,
    });
    setModalMode('edit');
  };

  const openEditCategory = (c: Category) => {
    setFormError('');
    setCatForm({
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      active: c.active === 1,
    });
    setModalMode('edit');
  };

  const openEditProduct = (p: Product) => {
    setFormError('');
    const matchedCatId =
      p.category_id ||
      categories.find((c) => c.name.toLowerCase() === p.category.toLowerCase())?.id ||
      categories[0]?.id ||
      0;
    setProdForm({
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      description: p.description,
      category_id: matchedCatId,
      unit: p.unit,
      location: p.location,
      stock_current: p.stock_current,
      stock_min: p.stock_min,
      cost_current: p.cost_current,
      margin_percent: p.margin_percent,
      price_current: p.price_current,
    });
    setModalMode('edit');
  };

  const openEditUser = (u: SystemUser) => {
    setFormError('');
    setUserForm({
      id: u.id,
      name: u.name,
      username: u.username || '',
      email: u.email,
      password: '',
      role_id: u.role_id,
      sector_id: u.sector_id || 0,
      department: u.department,
      active: u.active === 1,
    });
    setModalMode('edit');
  };

  const openEditRole = (r: RoleConfig) => {
    setFormError('');
    setRoleForm({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      is_system: r.is_system ?? 0,
      permissions: { ...r.permissions },
    });
    setModalMode('edit');
  };

  const openEditOrder = (o: WarehouseOrder) => {
    setFormError('');
    setOrderForm({
      id: o.id,
      personnel_id: o.personnel_id || 0,
      sector_id: o.sector_id || 0,
      department: o.department,
      priority: o.priority,
      status: o.status,
      notes: o.notes || '',
      review_notes: o.review_notes || '',
      items: o.items.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity_requested,
      })),
    });
    setModalMode('edit');
  };

  const openEditMovement = (m: Movement) => {
    setFormError('');
    setMovForm({
      id: m.id,
      folio: m.folio,
      type: m.type,
      product_id: m.product_id,
      quantity: m.quantity,
      cost_entry: m.cost_entry,
      items: [{ product_id: m.product_id, quantity: m.quantity }],
      personnel_id: m.personnel_id || 0,
      sector_id: m.sector_id || 0,
      responsible_name: m.responsible_name,
      responsible_area: m.responsible_area,
      reason_detail: m.reason_detail,
    });
    setModalMode('edit');
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFeedback('');
    setSaving(true);
    try {
      if (activeTable === 'sectors') {
        const body = {
          code: sectorForm.code,
          name: sectorForm.name,
          description: sectorForm.description,
          active: sectorForm.active ? 1 : 0,
        };
        if (modalMode === 'edit' && sectorForm.id) {
          await apiFetch(`/api/sectors/${sectorForm.id}`, { method: 'PUT', body: JSON.stringify(body) });
          setFeedback('Sector actualizado correctamente.');
        } else {
          await apiFetch('/api/sectors', { method: 'POST', body: JSON.stringify(body) });
          setFeedback('Sector creado correctamente.');
        }
      } else if (activeTable === 'personnel') {
        const body = {
          code: personnelForm.code,
          name: personnelForm.name,
          position: personnelForm.position,
          email: personnelForm.email,
          phone: personnelForm.phone,
          sector_id: personnelForm.sector_id,
          active: personnelForm.active ? 1 : 0,
        };
        if (modalMode === 'edit' && personnelForm.id) {
          await apiFetch(`/api/personnel/${personnelForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          });
          setFeedback('Personal actualizado correctamente.');
        } else {
          await apiFetch('/api/personnel', { method: 'POST', body: JSON.stringify(body) });
          setFeedback('Personal registrado correctamente.');
        }
      } else if (activeTable === 'categories') {
        const body = {
          code: catForm.code,
          name: catForm.name,
          description: catForm.description,
          active: catForm.active ? 1 : 0,
        };
        if (modalMode === 'edit' && catForm.id) {
          await apiFetch(`/api/categories/${catForm.id}`, { method: 'PUT', body: JSON.stringify(body) });
          setFeedback('Categoría actualizada correctamente.');
        } else {
          await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(body) });
          setFeedback('Categoría creada correctamente.');
        }
      } else if (activeTable === 'products') {
        const catObj = categories.find((c) => c.id === prodForm.category_id);
        const body = {
          ...prodForm,
          category: catObj?.name || 'General',
        };
        if (modalMode === 'edit' && prodForm.id) {
          await apiFetch(`/api/products/${prodForm.id}`, { method: 'PUT', body: JSON.stringify(body) });
          setFeedback('Producto actualizado correctamente.');
        } else {
          await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(body) });
          setFeedback('Producto registrado correctamente.');
        }
      } else if (activeTable === 'users') {
        const body: Record<string, unknown> = {
          name: userForm.name,
          username: userForm.username,
          email: userForm.email,
          role_id: userForm.role_id,
          sector_id: userForm.sector_id > 0 ? userForm.sector_id : null,
          department: userForm.department,
          active: userForm.active ? 1 : 0,
        };
        if (userForm.password.trim()) {
          body.password = userForm.password;
        }
        if (modalMode === 'edit' && userForm.id) {
          await apiFetch(`/api/users/${userForm.id}`, { method: 'PUT', body: JSON.stringify(body) });
          setFeedback('Usuario actualizado correctamente.');
        } else {
          await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) });
          setFeedback('Usuario registrado correctamente.');
        }
      } else if (activeTable === 'roles') {
        if (modalMode === 'edit' && roleForm.id) {
          await apiFetch(`/api/roles/${roleForm.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              slug: roleForm.slug,
              name: roleForm.name,
              description: roleForm.description,
            }),
          });
          await apiFetch(`/api/roles/${roleForm.id}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({ permissions: roleForm.permissions }),
          });
          setFeedback('Rol y permisos actualizados correctamente.');
        } else {
          await apiFetch('/api/roles', {
            method: 'POST',
            body: JSON.stringify({
              slug: roleForm.slug,
              name: roleForm.name,
              description: roleForm.description,
              permissions: roleForm.permissions,
            }),
          });
          setFeedback('Nuevo rol creado correctamente.');
        }
      } else if (activeTable === 'orders') {
        if (modalMode === 'edit' && orderForm.id) {
          await apiFetch(`/api/orders/${orderForm.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              department: orderForm.department,
              priority: orderForm.priority,
              status: orderForm.status,
              notes: orderForm.notes,
              review_notes: orderForm.review_notes,
              items: orderForm.items,
            }),
          });
          setFeedback('Pedido actualizado correctamente.');
        } else {
          await apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
              personnel_id: orderForm.personnel_id > 0 ? orderForm.personnel_id : null,
              sector_id: orderForm.sector_id > 0 ? orderForm.sector_id : null,
              department: orderForm.department,
              priority: orderForm.priority,
              notes: orderForm.notes,
              items: orderForm.items,
            }),
          });
          setFeedback('Pedido creado correctamente.');
        }
      } else if (activeTable === 'movements') {
        if (modalMode === 'edit' && movForm.id) {
          await apiFetch(`/api/movements/${movForm.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              folio: movForm.folio,
              responsible_name: movForm.responsible_name,
              responsible_area: movForm.responsible_area,
              reason_detail: movForm.reason_detail,
            }),
          });
          setFeedback('Movimiento actualizado correctamente.');
        } else if (movForm.type === 'INGRESO') {
          await apiFetch('/api/movements/entry', {
            method: 'POST',
            body: JSON.stringify({
              product_id: movForm.product_id,
              quantity: movForm.quantity,
              cost_entry: movForm.cost_entry,
              responsible_name: movForm.responsible_name,
              responsible_area: movForm.responsible_area,
              reason_detail: movForm.reason_detail,
            }),
          });
          setFeedback('Ingreso registrado correctamente.');
        } else {
          await apiFetch('/api/movements/exit', {
            method: 'POST',
            body: JSON.stringify({
              items: movForm.items,
              personnel_id: movForm.personnel_id > 0 ? movForm.personnel_id : null,
              sector_id: movForm.sector_id > 0 ? movForm.sector_id : null,
              responsible_name: movForm.responsible_name,
              responsible_area: movForm.responsible_area,
              reason_detail: movForm.reason_detail,
            }),
          });
          setFeedback('Salida multi-producto registrada correctamente.');
        }
      }

      setModalMode(null);
      await loadAllTables();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    setFeedback('');
    try {
      const endpointMap: Record<CrudTableKey, string> = {
        sectors: `/api/sectors/${deleteTarget.id}`,
        personnel: `/api/personnel/${deleteTarget.id}`,
        categories: `/api/categories/${deleteTarget.id}`,
        products: `/api/products/${deleteTarget.id}`,
        users: `/api/users/${deleteTarget.id}`,
        roles: `/api/roles/${deleteTarget.id}`,
        orders: `/api/orders/${deleteTarget.id}`,
        movements: `/api/movements/${deleteTarget.id}`,
      };
      await apiFetch(endpointMap[deleteTarget.table], { method: 'DELETE' });
      setFeedback(`Registro "${deleteTarget.label}" eliminado correctamente.`);
      setDeleteTarget(null);
      await loadAllTables();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el registro.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleExportDatabase = async (format: 'sql' | 'json') => {
    setError('');
    setFeedback('');
    setExportingFormat(format);
    try {
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = await apiDownload(
        `/api/admin/export-database?format=${format}`,
        `almacenpro_estructura_y_datos_${dateStamp}.${format}`
      );
      setFeedback(`Estructura y datos exportados correctamente (${filename}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar la base de datos.');
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              Gestión CRUD de Tablas del Sistema
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Panel exclusivo de Administrador para administrar sectores, personal, categorías, productos, usuarios, roles, pedidos y movimientos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={() => handleExportDatabase('sql')}
            title="Descargar estructura DDL y datos completos PostgreSQL (.sql)"
            className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <FileCode2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <span>{exportingFormat === 'sql' ? 'Exportando...' : 'Exportar BD (.sql)'}</span>
          </button>

          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={() => handleExportDatabase('json')}
            title="Descargar estructura y datos completos (.json)"
            className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>{exportingFormat === 'json' ? 'Exportando...' : 'Exportar JSON'}</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Registro</span>
          </button>
        </div>
      </div>

      {/* Table Switcher Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 flex flex-wrap gap-1.5">
        {tableTabs.map((t) => {
          const Icon = t.icon;
          const active = activeTable === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveTable(t.key);
                setSearch('');
                setError('');
              }}
              className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-700 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
              <span
                className={`text-xs font-mono tabular-nums ${
                  active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                ({t.count})
              </span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-xs font-medium text-emerald-900 dark:text-emerald-200">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-xs font-medium text-red-800 dark:text-red-300">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Filtrar registros en ${tableTabs.find((t) => t.key === activeTable)?.label}...`}
            className="w-full min-h-[42px] pl-10 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Limpiar filtro"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando registros...
          </div>
        ) : (
          <>
            {/* 0A. SECTORES */}
            {activeTable === 'sectors' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Sector</th>
                        <th className="py-3 px-4">Descripción</th>
                        <th className="py-3 px-4 text-right">Personal Asignado</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredSectors.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                            {s.code}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            {s.name}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-sm truncate">
                            {s.description || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                            {s.personnel_count ?? 0}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span
                              className={
                                s.active === 1
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {s.active === 1 ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditSector(s)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar sector"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'sectors',
                                    id: s.id,
                                    label: s.name,
                                    hint: 'Solo se puede eliminar si no tiene personal asignado.',
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Eliminar sector"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSectors.map((s) => (
                    <div key={s.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{s.code}</p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {s.personnel_count ?? 0} persona(s) · {s.description || 'Sin descripción'}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {s.active === 1 ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openEditSector(s)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              table: 'sectors',
                              id: s.id,
                              label: s.name,
                              hint: 'Solo se puede eliminar si no tiene personal asignado.',
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 0B. PERSONAL */}
            {activeTable === 'personnel' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Nombre y Cargo</th>
                        <th className="py-3 px-4">Sector al que pertenece</th>
                        <th className="py-3 px-4">Contacto</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredPersonnel.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                            {p.code}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{p.position}</p>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-blue-700 dark:text-blue-400">
                            {p.sector_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                            <p>{p.email || '—'}</p>
                            <p className="font-mono">{p.phone || ''}</p>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span
                              className={
                                p.active === 1
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {p.active === 1 ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditPersonnel(p)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar personal"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'personnel',
                                    id: p.id,
                                    label: `${p.name} (${p.sector_name})`,
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Eliminar personal"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPersonnel.map((p) => (
                    <div key={p.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {p.code} · {p.sector_name}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{p.position}</p>
                        </div>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {p.active === 1 ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openEditPersonnel(p)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              table: 'personnel',
                              id: p.id,
                              label: `${p.name} (${p.sector_name})`,
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 1. CATEGORÍAS */}
            {activeTable === 'categories' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Nombre</th>
                        <th className="py-3 px-4">Descripción</th>
                        <th className="py-3 px-4 text-right">Productos</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredCategories.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">{c.code}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{c.name}</td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-sm truncate">
                            {c.description || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                            {c.product_count ?? 0}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span
                              className={
                                c.active === 1
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {c.active === 1 ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditCategory(c)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar categoría"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'categories',
                                    id: c.id,
                                    label: c.name,
                                    hint: 'Solo se puede eliminar si no tiene productos asignados.',
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Eliminar categoría"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCategories.map((c) => (
                    <div key={c.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{c.code}</p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {c.description || 'Sin descripción'} · {c.product_count ?? 0} producto(s)
                          </p>
                        </div>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {c.active === 1 ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openEditCategory(c)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              table: 'categories',
                              id: c.id,
                              label: c.name,
                              hint: 'Solo se puede eliminar si no tiene productos asignados.',
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 2. PRODUCTOS */}
            {activeTable === 'products' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">SKU</th>
                        <th className="py-3 px-4">Producto</th>
                        <th className="py-3 px-4">Categoría</th>
                        <th className="py-3 px-4 text-right">Stock</th>
                        <th className="py-3 px-4 text-right">Costo (Bs.)</th>
                        <th className="py-3 px-4 text-right">Precio (Bs.)</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                            <p className="font-semibold">{p.sku}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{p.location}</p>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{p.category}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                            {p.stock_current} {p.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {formatCurrency(p.cost_current)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                            {formatCurrency(p.price_current)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditProduct(p)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar producto"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'products',
                                    id: p.id,
                                    label: `${p.sku} — ${p.name}`,
                                    hint: 'Si tiene movimientos o pedidos vinculados, deberás eliminarlos primero.',
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Eliminar producto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.map((p) => (
                    <div key={p.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {p.sku} · {p.category}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {p.stock_current} {p.unit}
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-400">{formatCurrency(p.price_current)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditProduct(p)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              table: 'products',
                              id: p.id,
                              label: `${p.sku} — ${p.name}`,
                              hint: 'Si tiene movimientos o pedidos vinculados, deberás eliminarlos primero.',
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 3. USUARIOS */}
            {activeTable === 'users' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">ID</th>
                        <th className="py-3 px-4">Nombre / Usuario</th>
                        <th className="py-3 px-4">Correo</th>
                        <th className="py-3 px-4">Rol</th>
                        <th className="py-3 px-4">Sector</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-xs text-slate-500">#{u.id}</td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</p>
                            {u.username && (
                              <p className="text-xs font-mono text-blue-700 dark:text-blue-400">
                                @{u.username}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{u.email}</td>
                          <td className="py-3 px-4 text-xs font-medium text-blue-700 dark:text-blue-400">
                            {u.role_name}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{u.department}</td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span
                              className={
                                u.active === 1
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {u.active === 1 ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditUser(u)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar usuario"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={u.id === user.id}
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'users',
                                    id: u.id,
                                    label: `${u.name} (${u.email})`,
                                    hint: 'Los usuarios con historial de movimientos o pedidos deben desactivarse desde Editar.',
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-30"
                                title="Eliminar usuario"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => (
                    <div key={u.id} className="p-4 space-y-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{u.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {u.email} · {u.role_name} · {u.active === 1 ? 'Activo' : 'Inactivo'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditUser(u)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          disabled={u.id === user.id}
                          onClick={() =>
                            setDeleteTarget({
                              table: 'users',
                              id: u.id,
                              label: `${u.name} (${u.email})`,
                              hint: 'Los usuarios con historial deben desactivarse desde Editar.',
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 4. ROLES */}
            {activeTable === 'roles' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Slug</th>
                        <th className="py-3 px-4">Nombre del Rol</th>
                        <th className="py-3 px-4">Descripción</th>
                        <th className="py-3 px-4 text-right">Permisos Activos</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredRoles.map((r) => {
                        const activePerms = Object.values(r.permissions).filter(Boolean).length;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                              {r.slug}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                              {r.name}
                              {r.is_system === 1 && (
                                <span className="ml-2 text-[11px] font-normal text-slate-400">(Sistema)</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-md">
                              {r.description || '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold">
                              {activePerms} / {permCatalog.length}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditRole(r)}
                                  className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Editar rol"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={r.is_system === 1}
                                  onClick={() =>
                                    setDeleteTarget({
                                      table: 'roles',
                                      id: r.id,
                                      label: r.name,
                                      hint: 'Solo se pueden eliminar roles personalizados sin usuarios asignados.',
                                    })
                                  }
                                  className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-30"
                                  title="Eliminar rol"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRoles.map((r) => (
                    <div key={r.id} className="p-4 space-y-2">
                      <div>
                        <p className="text-xs font-mono text-slate-500">{r.slug}</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditRole(r)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          disabled={r.is_system === 1}
                          onClick={() =>
                            setDeleteTarget({
                              table: 'roles',
                              id: r.id,
                              label: r.name,
                              hint: 'Solo roles personalizados sin usuarios.',
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 5. PEDIDOS */}
            {activeTable === 'orders' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Folio</th>
                        <th className="py-3 px-4">Personal / Sector</th>
                        <th className="py-3 px-4">Ítems</th>
                        <th className="py-3 px-4">Prioridad</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {o.folio}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {o.personnel_name || o.requester_name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {o.sector_name || o.department}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                            {o.items.map((it) => `${it.product_name} (${it.quantity_requested})`).join(', ')}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span
                              className={
                                o.priority === 'Urgente'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }
                            >
                              {o.priority}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-blue-700 dark:text-blue-400">
                            {o.status}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditOrder(o)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar pedido"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'orders',
                                    id: o.id,
                                    label: `${o.folio} (${o.requester_name})`,
                                    hint: 'Se eliminarán también los ítems solicitados de este pedido.',
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Eliminar pedido"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOrders.map((o) => (
                    <div key={o.id} className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
                            {o.folio} · {o.status}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {o.personnel_name || o.requester_name} ({o.sector_name || o.department})
                          </p>
                        </div>
                        <span className="text-xs font-medium text-slate-500">{o.priority}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditOrder(o)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              table: 'orders',
                              id: o.id,
                              label: `${o.folio} (${o.requester_name})`,
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 6. MOVIMIENTOS */}
            {activeTable === 'movements' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Folio / Tipo</th>
                        <th className="py-3 px-4">Producto</th>
                        <th className="py-3 px-4 text-right">Cantidad</th>
                        <th className="py-3 px-4 text-right">Valor Total (Bs.)</th>
                        <th className="py-3 px-4">Personal / Sector</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {filteredMovements.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {m.folio}
                            </p>
                            <p
                              className={`text-[11px] font-semibold ${
                                m.type === 'INGRESO'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {m.type}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                            <p className="text-xs font-mono text-slate-400">{m.sku}</p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                            {m.quantity} {m.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                            {formatCurrency(m.total_value)}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {m.responsible_name} · {m.sector_name || m.responsible_area}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.reason_detail}</p>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditMovement(m)}
                                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Editar movimiento"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    table: 'movements',
                                    id: m.id,
                                    label: `${m.folio} (${m.type} ${m.quantity} ${m.unit})`,
                                    hint: 'Al eliminar el movimiento, se revertirá automáticamente su impacto en el stock actual del producto.',
                                  })
                                }
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Eliminar movimiento"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMovements.map((m) => (
                    <div key={m.id} className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
                            {m.folio} · {m.type}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {m.product_name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {m.responsible_name} · {m.sector_name || m.responsible_area}
                          </p>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <p className="text-sm font-bold">
                            {m.quantity} {m.unit}
                          </p>
                          <p className="text-xs text-slate-500">{formatCurrency(m.total_value)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditMovement(m)}
                          className="flex-1 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              table: 'movements',
                              id: m.id,
                              label: `${m.folio} (${m.type})`,
                              hint: 'Revertirá su impacto en el stock actual.',
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-400 flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {modalMode === 'create' ? 'Crear registro en' : 'Editar registro en'}{' '}
                {tableTabs.find((t) => t.key === activeTable)?.label}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-3.5 overflow-y-auto">
              {/* SECTORES FORM */}
              {activeTable === 'sectors' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Código (opcional)
                      </label>
                      <input
                        type="text"
                        value={sectorForm.code}
                        onChange={(e) => setSectorForm({ ...sectorForm, code: e.target.value.toUpperCase() })}
                        placeholder="SEC-AUTO"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre del Sector *
                      </label>
                      <input
                        type="text"
                        required
                        value={sectorForm.name}
                        onChange={(e) => setSectorForm({ ...sectorForm, name: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Descripción
                    </label>
                    <textarea
                      rows={2}
                      value={sectorForm.description}
                      onChange={(e) => setSectorForm({ ...sectorForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={sectorForm.active}
                      onChange={(e) => setSectorForm({ ...sectorForm, active: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Sector activo para salidas y solicitudes
                  </label>
                </>
              )}

              {/* PERSONAL FORM */}
              {activeTable === 'personnel' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Código (opcional)
                      </label>
                      <input
                        type="text"
                        value={personnelForm.code}
                        onChange={(e) =>
                          setPersonnelForm({ ...personnelForm, code: e.target.value.toUpperCase() })
                        }
                        placeholder="PER-AUTO"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Sector al que pertenece *
                      </label>
                      <select
                        required
                        value={personnelForm.sector_id}
                        onChange={(e) =>
                          setPersonnelForm({ ...personnelForm, sector_id: Number(e.target.value) })
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={personnelForm.name}
                        onChange={(e) => setPersonnelForm({ ...personnelForm, name: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Cargo / Puesto
                      </label>
                      <input
                        type="text"
                        value={personnelForm.position}
                        onChange={(e) => setPersonnelForm({ ...personnelForm, position: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Correo
                      </label>
                      <input
                        type="email"
                        value={personnelForm.email}
                        onChange={(e) => setPersonnelForm({ ...personnelForm, email: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="text"
                        value={personnelForm.phone}
                        onChange={(e) => setPersonnelForm({ ...personnelForm, phone: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={personnelForm.active}
                      onChange={(e) => setPersonnelForm({ ...personnelForm, active: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Trabajador activo
                  </label>
                </>
              )}

              {/* CATEGORÍAS FORM */}
              {activeTable === 'categories' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Código (opcional)
                      </label>
                      <input
                        type="text"
                        value={catForm.code}
                        onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })}
                        placeholder="CAT-AUTO"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        required
                        value={catForm.name}
                        onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Descripción
                    </label>
                    <textarea
                      rows={2}
                      value={catForm.description}
                      onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={catForm.active}
                      onChange={(e) => setCatForm({ ...catForm, active: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Categoría activa para nuevos productos
                  </label>
                </>
              )}

              {/* PRODUCTOS FORM */}
              {activeTable === 'products' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        SKU *
                      </label>
                      <input
                        type="text"
                        required
                        value={prodForm.sku}
                        onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value.toUpperCase() })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre del producto *
                      </label>
                      <input
                        type="text"
                        required
                        value={prodForm.name}
                        onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Categoría *
                      </label>
                      <select
                        value={prodForm.category_id}
                        onChange={(e) => setProdForm({ ...prodForm, category_id: Number(e.target.value) })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Unidad
                      </label>
                      <input
                        type="text"
                        value={prodForm.unit}
                        onChange={(e) => setProdForm({ ...prodForm, unit: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Ubicación
                      </label>
                      <input
                        type="text"
                        value={prodForm.location}
                        onChange={(e) => setProdForm({ ...prodForm, location: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Stock
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={prodForm.stock_current}
                        onChange={(e) => setProdForm({ ...prodForm, stock_current: Number(e.target.value) })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Mínimo
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={prodForm.stock_min}
                        onChange={(e) => setProdForm({ ...prodForm, stock_min: Number(e.target.value) })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Costo (Bs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={prodForm.cost_current}
                        onChange={(e) => {
                          const c = Number(e.target.value);
                          setProdForm({
                            ...prodForm,
                            cost_current: c,
                            price_current: Number((c * (1 + prodForm.margin_percent / 100)).toFixed(2)),
                          });
                        }}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Precio (Bs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={prodForm.price_current}
                        onChange={(e) => setProdForm({ ...prodForm, price_current: Number(e.target.value) })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* USUARIOS FORM */}
              {activeTable === 'users' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nombre completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={userForm.name}
                      onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                      className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Usuario (acceso clásico)
                      </label>
                      <input
                        type="text"
                        value={userForm.username}
                        onChange={(e) =>
                          setUserForm({ ...userForm, username: e.target.value.toLowerCase() })
                        }
                        placeholder="jperez"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {modalMode === 'edit' ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                      </label>
                      <input
                        type="password"
                        minLength={6}
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder={
                          modalMode === 'edit'
                            ? 'Dejar vacío para conservar'
                            : 'Mín. 6 caracteres'
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Correo electrónico *
                    </label>
                    <input
                      type="email"
                      required
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Rol *
                      </label>
                      <select
                        value={userForm.role_id}
                        onChange={(e) => setUserForm({ ...userForm, role_id: Number(e.target.value) })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Sector
                      </label>
                      <select
                        value={userForm.sector_id}
                        onChange={(e) => {
                          const sid = Number(e.target.value);
                          const sec = sectors.find((s) => s.id === sid);
                          setUserForm({
                            ...userForm,
                            sector_id: sid,
                            department: sec ? sec.name : userForm.department,
                          });
                        }}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value={0}>Otro ({userForm.department})</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={userForm.active}
                      onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Cuenta activa
                  </label>
                </>
              )}

              {/* ROLES FORM */}
              {activeTable === 'roles' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Identificador (slug) *
                      </label>
                      <input
                        type="text"
                        required
                        disabled={roleForm.is_system === 1}
                        value={roleForm.slug}
                        onChange={(e) => setRoleForm({ ...roleForm, slug: e.target.value.toLowerCase() })}
                        placeholder="supervisor_turno"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre del Rol *
                      </label>
                      <input
                        type="text"
                        required
                        value={roleForm.name}
                        onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Descripción
                    </label>
                    <textarea
                      rows={2}
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Permisos del Rol</p>
                    <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                      {permCatalog.map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={Boolean(roleForm.permissions[perm.key])}
                            disabled={roleForm.slug === 'admin' && perm.key === 'manage_users'}
                            onChange={(e) =>
                              setRoleForm({
                                ...roleForm,
                                permissions: { ...roleForm.permissions, [perm.key]: e.target.checked },
                              })
                            }
                            className="w-4 h-4 rounded"
                          />
                          <span>{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* PEDIDOS FORM (Multi-Producto + Personal + Sector) */}
              {activeTable === 'orders' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {modalMode === 'create' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Personal solicitante
                        </label>
                        <select
                          value={orderForm.personnel_id}
                          onChange={(e) => {
                            const pid = Number(e.target.value);
                            const per = personnelList.find((x) => x.id === pid);
                            setOrderForm({
                              ...orderForm,
                              personnel_id: pid,
                              sector_id: per ? per.sector_id : orderForm.sector_id,
                              department: per ? per.sector_name : orderForm.department,
                            });
                          }}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value={0}>Usuario actual ({user.name})</option>
                          {personnelList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sector_name})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Sector / Área *
                      </label>
                      <select
                        value={orderForm.sector_id}
                        onChange={(e) => {
                          const sid = Number(e.target.value);
                          const sec = sectors.find((s) => s.id === sid);
                          setOrderForm({
                            ...orderForm,
                            sector_id: sid,
                            department: sec ? sec.name : orderForm.department,
                          });
                        }}
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value={0}>{orderForm.department}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Prioridad
                      </label>
                      <select
                        value={orderForm.priority}
                        onChange={(e) =>
                          setOrderForm({ ...orderForm, priority: e.target.value as 'Normal' | 'Urgente' })
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="Normal">Normal</option>
                        <option value="Urgente">Urgente</option>
                      </select>
                    </div>
                  </div>

                  {modalMode === 'edit' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Estado del pedido
                      </label>
                      <select
                        value={orderForm.status}
                        onChange={(e) =>
                          setOrderForm({
                            ...orderForm,
                            status: e.target.value as 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Despachado',
                          })
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Aprobado">Aprobado</option>
                        <option value="Rechazado">Rechazado</option>
                        <option value="Despachado">Despachado</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Productos del pedido *
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setOrderForm({
                            ...orderForm,
                            items: [
                              ...orderForm.items,
                              { product_id: products[0]?.id || 0, quantity: 1 },
                            ],
                          })
                        }
                        className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar producto
                      </button>
                    </div>
                    {orderForm.items.map((line, idx) => (
                      <div key={idx} className="flex gap-2">
                        <select
                          value={line.product_id}
                          onChange={(e) => {
                            const next = [...orderForm.items];
                            next[idx].product_id = Number(e.target.value);
                            setOrderForm({ ...orderForm, items: next });
                          }}
                          className="flex-1 min-h-[40px] px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const next = [...orderForm.items];
                            next[idx].quantity = Math.max(1, Number(e.target.value));
                            setOrderForm({ ...orderForm, items: next });
                          }}
                          className="w-20 min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        {orderForm.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setOrderForm({
                                ...orderForm,
                                items: orderForm.items.filter((_, i) => i !== idx),
                              })
                            }
                            className="p-2 text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Notas del pedido
                    </label>
                    <textarea
                      rows={2}
                      value={orderForm.notes}
                      onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </>
              )}

              {/* MOVIMIENTOS FORM */}
              {activeTable === 'movements' && (
                <>
                  {modalMode === 'create' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Tipo *
                          </label>
                          <select
                            value={movForm.type}
                            onChange={(e) =>
                              setMovForm({ ...movForm, type: e.target.value as 'INGRESO' | 'SALIDA' })
                            }
                            className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            <option value="INGRESO">INGRESO</option>
                            <option value="SALIDA">SALIDA (Multi-producto)</option>
                          </select>
                        </div>
                        {movForm.type === 'INGRESO' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Cantidad *
                            </label>
                            <input
                              type="number"
                              min={1}
                              required
                              value={movForm.quantity}
                              onChange={(e) => setMovForm({ ...movForm, quantity: Number(e.target.value) })}
                              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                        )}
                      </div>

                      {movForm.type === 'INGRESO' ? (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Producto *
                            </label>
                            <select
                              value={movForm.product_id}
                              onChange={(e) => {
                                const pid = Number(e.target.value);
                                const prod = products.find((p) => p.id === pid);
                                setMovForm({
                                  ...movForm,
                                  product_id: pid,
                                  cost_entry: prod?.cost_current ?? 0,
                                });
                              }}
                              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku} — {p.name} (Stock: {p.stock_current})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Costo Unitario de Ingreso (Bs.) *
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              required
                              value={movForm.cost_entry}
                              onChange={(e) => setMovForm({ ...movForm, cost_entry: Number(e.target.value) })}
                              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Personal *
                              </label>
                              <select
                                value={movForm.personnel_id}
                                onChange={(e) => {
                                  const pid = Number(e.target.value);
                                  const per = personnelList.find((x) => x.id === pid);
                                  setMovForm({
                                    ...movForm,
                                    personnel_id: pid,
                                    sector_id: per ? per.sector_id : movForm.sector_id,
                                    responsible_name: per ? per.name : '',
                                    responsible_area: per ? per.sector_name : movForm.responsible_area,
                                  });
                                }}
                                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              >
                                {personnelList.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.sector_name})
                                  </option>
                                ))}
                                <option value={0}>Otro responsable</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Sector *
                              </label>
                              <select
                                value={movForm.sector_id}
                                onChange={(e) => {
                                  const sid = Number(e.target.value);
                                  const sec = sectors.find((s) => s.id === sid);
                                  setMovForm({
                                    ...movForm,
                                    sector_id: sid,
                                    responsible_area: sec ? sec.name : movForm.responsible_area,
                                  });
                                }}
                                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              >
                                {sectors.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                Productos en salida *
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  setMovForm({
                                    ...movForm,
                                    items: [
                                      ...movForm.items,
                                      { product_id: products[0]?.id || 0, quantity: 1 },
                                    ],
                                  })
                                }
                                className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" /> Agregar producto
                              </button>
                            </div>
                            {movForm.items.map((line, idx) => (
                              <div key={idx} className="flex gap-2">
                                <select
                                  value={line.product_id}
                                  onChange={(e) => {
                                    const next = [...movForm.items];
                                    next[idx].product_id = Number(e.target.value);
                                    setMovForm({ ...movForm, items: next });
                                  }}
                                  className="flex-1 min-h-[40px] px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                                >
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.sku} — {p.name} (Stock: {p.stock_current})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  required
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const next = [...movForm.items];
                                    next[idx].quantity = Math.max(1, Number(e.target.value));
                                    setMovForm({ ...movForm, items: next });
                                  }}
                                  className="w-20 min-h-[40px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                                />
                                {movForm.items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMovForm({
                                        ...movForm,
                                        items: movForm.items.filter((_, i) => i !== idx),
                                      })
                                    }
                                    className="p-2 text-red-600 dark:text-red-400"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Folio *
                      </label>
                      <input
                        type="text"
                        required
                        value={movForm.folio}
                        onChange={(e) => setMovForm({ ...movForm, folio: e.target.value.toUpperCase() })}
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  )}

                  {(modalMode === 'edit' || movForm.type === 'INGRESO' || movForm.personnel_id === 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Responsable *
                        </label>
                        <input
                          type="text"
                          required
                          value={movForm.responsible_name}
                          onChange={(e) => setMovForm({ ...movForm, responsible_name: e.target.value })}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Sector / Proveedor
                        </label>
                        <input
                          type="text"
                          value={movForm.responsible_area}
                          onChange={(e) => setMovForm({ ...movForm, responsible_area: e.target.value })}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Detalle / Motivo *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={movForm.reason_detail}
                      onChange={(e) => setMovForm({ ...movForm, reason_detail: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </>
              )}

              {formError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Confirmar eliminación
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  ¿Deseas eliminar <strong>{deleteTarget.label}</strong>?
                </p>
                {deleteTarget.hint && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{deleteTarget.hint}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
