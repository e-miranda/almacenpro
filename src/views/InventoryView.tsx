import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  FolderPlus,
  PackagePlus,
  ScanLine,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatCurrency } from '../lib/api';
import type { AuthUser, Category, Product } from '../types';
import { BarcodeVisual } from '../components/BarcodeVisual';

interface InventoryViewProps {
  user: AuthUser;
  externalSearch: string;
  onExternalSearchChange: (val: string) => void;
  onOpenScanner: () => void;
  onStartEntry: (product: Product) => void;
  onStartExit: (product: Product) => void;
  onStartOrder: (product: Product) => void;
  refreshSignal: number;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  user,
  externalSearch,
  onExternalSearchChange,
  onOpenScanner,
  onStartEntry,
  onStartExit,
  onStartOrder,
  refreshSignal,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [category, setCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OK' | 'LOW' | 'OUT'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [quickCatOpen, setQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (externalSearch.trim()) params.set('q', externalSearch.trim());
      if (category !== 'ALL') params.set('category', category);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await apiFetch<{
        products: Product[];
        categories: string[];
        categoryList?: Category[];
      }>(`/api/products?${params.toString()}`);
      setProducts(res.products);
      setCategories(res.categories);
      if (res.categoryList) setCategoryList(res.categoryList);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }, [externalSearch, category, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 140);
    return () => clearTimeout(timer);
  }, [loadProducts, refreshSignal]);

  const openNewModal = () => {
    setFormError('');
    setQuickCatOpen(false);
    setQuickCatName('');
    const firstActiveCat = categoryList.find((c) => c.active === 1) || categoryList[0];
    setEditingProduct({
      sku: '',
      barcode: `7501000${Math.floor(100000 + Math.random() * 899999)}`,
      name: '',
      description: '',
      category_id: firstActiveCat?.id,
      category: firstActiveCat?.name || categories[0] || 'Herramientas Eléctricas',
      unit: 'Pza',
      location: 'Pasillo A · Rack 01',
      stock_current: 0,
      stock_min: 5,
      cost_current: 0,
      margin_percent: 30,
      price_current: 0,
    });
  };

  const handleQuickCreateCategory = async () => {
    const trimmed = quickCatName.trim();
    if (!trimmed || !editingProduct) return;
    setCreatingCat(true);
    setFormError('');
    try {
      const res = await apiFetch<{ category: Category }>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      setCategoryList((prev) => [...prev, res.category].sort((a, b) => a.name.localeCompare(b.name)));
      setCategories((prev) => Array.from(new Set([...prev, res.category.name])).sort());
      setEditingProduct({
        ...editingProduct,
        category_id: res.category.id,
        category: res.category.name,
      });
      setQuickCatName('');
      setQuickCatOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear la categoría.');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setFormError('');
    setSaving(true);
    try {
      if (editingProduct.id) {
        await apiFetch(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(editingProduct),
        });
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(editingProduct),
        });
      }
      setEditingProduct(null);
      loadProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const renderStockBadge = (p: Product) => {
    if (p.stock_current === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
          <XCircle className="w-3.5 h-3.5" /> Agotado
        </span>
      );
    }
    if (p.stock_current <= p.stock_min) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5" /> Stock Bajo
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Disponible
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Catálogo e Inventario
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Búsqueda instantánea por código de barras, SKU o nombre · Precios en Bolivianos (Bs.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenScanner}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <ScanLine className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <span>Escanear Código</span>
          </button>
          {user.permissions.manage_products && (
            <button
              type="button"
              onClick={openNewModal}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Nuevo Producto</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={externalSearch}
              onChange={(e) => onExternalSearchChange(e.target.value)}
              placeholder="Buscar por nombre, código de barras, SKU o ubicación..."
              className="w-full min-h-[44px] pl-10 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {externalSearch && (
              <button
                type="button"
                onClick={() => onExternalSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {(
              [
                { id: 'ALL', label: 'Todos' },
                { id: 'OK', label: 'Normal' },
                { id: 'LOW', label: 'Bajo' },
                { id: 'OUT', label: 'Agotado' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-4 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Buscando en inventario...
          </div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No se encontraron productos
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Intenta con otro código de barras, nombre o limpia los filtros activos.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Producto / Ubicación</th>
                    <th className="py-3 px-4">Código de Barras / SKU</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Stock</th>
                    <th className="py-3 px-4 text-right">Costo Ant. / Prom.</th>
                    <th className="py-3 px-4 text-right">Precio Actual</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {p.category} · {p.location}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <BarcodeVisual code={p.barcode} height={24} />
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          SKU: {p.sku}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">{renderStockBadge(p)}</td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {p.stock_current}{' '}
                          <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">
                            {p.unit}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">Mín: {p.stock_min}</p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {formatCurrency(p.cost_current)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Ant: {formatCurrency(p.cost_previous)}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <p className="font-semibold text-blue-800 dark:text-blue-400">
                          {formatCurrency(p.price_current)}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Margen {p.margin_percent.toFixed(0)}%
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {user.permissions.register_entry && (
                            <button
                              type="button"
                              onClick={() => onStartEntry(p)}
                              className="px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium transition-colors"
                            >
                              + Ingreso
                            </button>
                          )}
                          {user.permissions.register_exit && p.stock_current > 0 && (
                            <button
                              type="button"
                              onClick={() => onStartExit(p)}
                              className="px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-medium transition-colors"
                            >
                              Salida
                            </button>
                          )}
                          {user.permissions.request_order && (
                            <button
                              type="button"
                              onClick={() => onStartOrder(p)}
                              className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors"
                            >
                              Pedir
                            </button>
                          )}
                          {user.permissions.manage_products && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormError('');
                                setEditingProduct(p);
                              }}
                              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-label={`Editar ${p.name}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Touch Cards */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => (
                <div key={p.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {p.category} · {p.location}
                      </p>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {p.name}
                      </h4>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        SKU: {p.sku} · Código: {p.barcode}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {renderStockBadge(p)}
                      <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                        {p.stock_current} <span className="text-xs font-sans font-normal">{p.unit}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 dark:bg-slate-800/70 rounded-lg p-2.5 border border-slate-100 dark:border-slate-700 font-mono tabular-nums">
                    <div>
                      <span className="block text-[11px] font-sans text-slate-500 dark:text-slate-400">
                        Costo Ant.
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(p.cost_previous)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-sans text-slate-500 dark:text-slate-400">
                        Costo Prom.
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(p.cost_current)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[11px] font-sans text-slate-500 dark:text-slate-400">
                        Precio
                      </span>
                      <span className="font-bold text-blue-800 dark:text-blue-400">
                        {formatCurrency(p.price_current)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {user.permissions.register_entry && (
                      <button
                        type="button"
                        onClick={() => onStartEntry(p)}
                        className="flex-1 min-h-[44px] px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold"
                      >
                        + Ingreso
                      </button>
                    )}
                    {user.permissions.register_exit && p.stock_current > 0 && (
                      <button
                        type="button"
                        onClick={() => onStartExit(p)}
                        className="flex-1 min-h-[44px] px-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-semibold"
                      >
                        Salida
                      </button>
                    )}
                    {user.permissions.request_order && (
                      <button
                        type="button"
                        onClick={() => onStartOrder(p)}
                        className="flex-1 min-h-[44px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                      >
                        Solicitar Pedido
                      </button>
                    )}
                    {user.permissions.manage_products && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('');
                          setEditingProduct(p);
                        }}
                        className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center"
                        aria-label={`Editar ${p.name}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingProduct.id ? 'Editar Producto' : 'Registrar Nuevo Producto'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Código de Barras *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.barcode || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del producto *
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Categoría *
                    </label>
                    <button
                      type="button"
                      onClick={() => setQuickCatOpen((v) => !v)}
                      className="text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      <FolderPlus className="w-3 h-3" />
                      {quickCatOpen ? 'Cerrar' : 'Nueva'}
                    </button>
                  </div>
                  {quickCatOpen ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={quickCatName}
                        onChange={(e) => setQuickCatName(e.target.value)}
                        placeholder="Nombre categoría"
                        className="w-full min-h-[42px] px-2.5 py-2 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      <button
                        type="button"
                        disabled={creatingCat || !quickCatName.trim()}
                        onClick={handleQuickCreateCategory}
                        className="min-h-[42px] px-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shrink-0 disabled:opacity-50"
                      >
                        {creatingCat ? '...' : 'Crear'}
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editingProduct.category_id ?? ''}
                      onChange={(e) => {
                        const cid = Number(e.target.value);
                        const found = categoryList.find((c) => c.id === cid);
                        setEditingProduct({
                          ...editingProduct,
                          category_id: cid || undefined,
                          category: found?.name || editingProduct.category || '',
                        });
                      }}
                      className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      {categoryList.length === 0 && (
                        <option value="">{editingProduct.category || 'General'}</option>
                      )}
                      {categoryList
                        .filter((c) => c.active === 1 || c.id === editingProduct.category_id)
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={editingProduct.unit || 'Pza'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ubicación
                  </label>
                  <input
                    type="text"
                    value={editingProduct.location || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, location: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {!editingProduct.id && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Stock Inicial
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingProduct.stock_current ?? 0}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, stock_current: Number(e.target.value) })
                      }
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Stock Mín.
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingProduct.stock_min ?? 5}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, stock_min: Number(e.target.value) })
                    }
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
                    value={editingProduct.cost_current ?? 0}
                    onChange={(e) => {
                      const c = Number(e.target.value);
                      const m = editingProduct.margin_percent ?? 30;
                      setEditingProduct({
                        ...editingProduct,
                        cost_current: c,
                        price_current: Number((c * (1 + m / 100)).toFixed(2)),
                      });
                    }}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Margen (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={editingProduct.margin_percent ?? 30}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      const c = editingProduct.cost_current ?? 0;
                      setEditingProduct({
                        ...editingProduct,
                        margin_percent: m,
                        price_current: Number((c * (1 + m / 100)).toFixed(2)),
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
                    value={editingProduct.price_current ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, price_current: Number(e.target.value) })
                    }
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium"
                >
                  {saving ? 'Guardando...' : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
