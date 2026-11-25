import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  ClipboardPlus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { apiFetch, formatCurrency } from '../lib/api';
import type { AuthUser, Product } from '../types';

interface QuickStockSearchModalProps {
  open: boolean;
  user: AuthUser;
  products: Product[];
  onClose: () => void;
  onQuickEntry?: (product: Product) => void;
  onQuickExit?: (product: Product) => void;
  onQuickOrder?: (product: Product) => void;
  onViewInInventory?: (query: string) => void;
  onSelectProduct?: (product: Product) => void;
}

export const QuickStockSearchModal: React.FC<QuickStockSearchModalProps> = ({
  open,
  user,
  products,
  onClose,
  onQuickEntry,
  onQuickExit,
  onQuickOrder,
  onViewInInventory,
  onSelectProduct,
}) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OK' | 'LOW' | 'OUT'>('ALL');
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const [syncing, setSyncing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLiveProducts(products);
  }, [products]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 40);

    let active = true;
    setSyncing(true);
    apiFetch<{ products: Product[] }>('/api/products')
      .then((res) => {
        if (active && Array.isArray(res.products)) {
          setLiveProducts(res.products);
        }
      })
      .catch(() => {
        // fallback to already loaded products
      })
      .finally(() => {
        if (active) setSyncing(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const refreshNow = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch<{ products: Product[] }>('/api/products');
      setLiveProducts(res.products);
    } catch {
      // ignore transient error
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liveProducts.filter((p) => {
      if (statusFilter === 'OUT' && p.stock_current !== 0) return false;
      if (statusFilter === 'LOW' && !(p.stock_current > 0 && p.stock_current <= p.stock_min)) {
        return false;
      }
      if (statusFilter === 'OK' && p.stock_current <= p.stock_min) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    });
  }, [liveProducts, query, statusFilter]);

  const totalMatchingUnits = useMemo(
    () => filtered.reduce((acc, p) => acc + p.stock_current, 0),
    [filtered]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda en tiempo real de productos y existencias"
    >
      <div className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Búsqueda en Tiempo Real y Existencias
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consulta inmediata de productos y cantidad disponible en almacén
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={refreshNow}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
              title="Actualizar existencias desde el servidor"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar buscador"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Search Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe nombre del producto, SKU, categoría o ubicación..."
              className="w-full min-h-[46px] pl-10 pr-20 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 px-2 py-1 rounded"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
              {[
                { key: 'ALL', label: 'Todos' },
                { key: 'OK', label: 'Disponible' },
                { key: 'LOW', label: 'Stock Bajo' },
                { key: 'OUT', label: 'Agotado' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key as typeof statusFilter)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === opt.key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              <strong>{filtered.length}</strong> producto(s) · Existencia acumulada:{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {totalMatchingUnits.toLocaleString('es-BO')}
              </strong>{' '}
              uds.
            </p>
          </div>
        </div>

        {/* Live Results */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <div className="py-12 px-5 text-center space-y-2">
              <Boxes className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No se encontraron productos para "{query}"
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Prueba buscando por otro término, SKU o categoría.
              </p>
            </div>
          ) : (
            filtered.map((p) => {
              const isOut = p.stock_current === 0;
              const isLow = p.stock_current > 0 && p.stock_current <= p.stock_min;

              return (
                <div
                  key={p.id}
                  className="px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
                        {p.sku}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{p.category}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{p.location}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Costo: {formatCurrency(p.cost_current)} · Mínimo: {p.stock_min} {p.unit}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Existencia actual
                      </p>
                      <p
                        className={`text-lg font-bold font-mono tabular-nums ${
                          isOut
                            ? 'text-red-700 dark:text-red-400'
                            : isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {p.stock_current} <span className="text-xs font-sans font-medium">{p.unit}</span>
                      </p>
                      <p
                        className={`text-[11px] font-medium ${
                          isOut
                            ? 'text-red-700 dark:text-red-400'
                            : isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {isOut ? 'Agotado' : isLow ? 'Stock Bajo' : 'Disponible'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onSelectProduct && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProduct(p);
                            onClose();
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Seleccionar</span>
                        </button>
                      )}

                      {!onSelectProduct && user.permissions.register_entry && onQuickEntry && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onQuickEntry(p);
                          }}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-1"
                          title="Registrar ingreso"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>Ingreso</span>
                        </button>
                      )}

                      {!onSelectProduct &&
                        user.permissions.register_exit &&
                        p.stock_current > 0 &&
                        onQuickExit && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onQuickExit(p);
                            }}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1"
                            title="Registrar salida"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Salida</span>
                          </button>
                        )}

                      {!onSelectProduct && user.permissions.request_order && onQuickOrder && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onQuickOrder(p);
                          }}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1"
                          title="Solicitar pedido"
                        >
                          <ClipboardPlus className="w-3.5 h-3.5" />
                          <span>Pedir</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {onViewInInventory && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Atajo rápido: <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800">Ctrl</kbd> +{' '}
              <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800">K</kbd>
            </span>
            <button
              type="button"
              onClick={() => {
                onViewInInventory(query);
                onClose();
              }}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
            >
              Ver en catálogo de inventario →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
