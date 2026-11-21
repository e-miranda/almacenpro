import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  FileText,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime } from '../lib/api';
import type { AuthUser, DashboardData, Movement, Product } from '../types';

interface DashboardViewProps {
  user: AuthUser;
  onQuickEntry: (product: Product) => void;
  onQuickOrder: (product: Product) => void;
  onOpenExitPdf: (movement: Movement) => void;
  onNavigate: (tab: 'inventory' | 'movements' | 'orders' | 'reports') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  onQuickEntry,
  onQuickOrder,
  onOpenExitPdf,
  onNavigate,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando monitoreo en tiempo real.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  useEffect(() => {
    if (!autoSync) return;
    const id = setInterval(() => loadDashboard(true), 12000);
    return () => clearInterval(id);
  }, [autoSync, loadDashboard]);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-6 text-sm text-red-800 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const maxChartVal = Math.max(
    1,
    ...data.monthlySeries.map((m) => Math.max(m.ingreso_val, m.salida_val))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 text-balance">
            Panel de Control e Inventario en Tiempo Real
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {user.name} · {user.role_name} · Actualizado {formatDateTime(data.serverTime)}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              autoSync
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {autoSync ? 'Sincronización Automática: Activa' : 'Sincronización Manual'}
          </button>
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Valoración Total (Costo)</span>
            <TrendingUp className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {formatCurrency(data.kpis.inventory_cost_value)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Valor venta estimado: {formatCurrency(data.kpis.inventory_sale_value)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Existencias Activas</span>
            <Boxes className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {data.kpis.total_units.toLocaleString('es-BO')}{' '}
            <span className="text-sm font-sans font-normal text-slate-500 dark:text-slate-400">unid.</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {data.kpis.total_products} productos registrados en catálogo
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Alertas de Stock</span>
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {data.kpis.low_stock_count + data.kpis.out_of_stock_count}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            <span className="text-red-700 dark:text-red-400 font-medium">
              {data.kpis.out_of_stock_count} agotados
            </span>
            <span className="mx-1.5">·</span>
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              {data.kpis.low_stock_count} stock bajo
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Pedidos y Flujo del Mes</span>
            <ClipboardList className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {data.kpis.pending_orders}{' '}
            <span className="text-sm font-sans font-normal text-slate-500 dark:text-slate-400">pendientes</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {data.kpis.approved_to_dispatch} por despachar · {data.kpis.entries_count + data.kpis.exits_count} mov. mes
          </p>
        </div>
      </div>

      {/* Main Split: Chart + Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Flujo Mensual de Valor en Bs. (Año en Curso)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparativa de ingresos vs. salidas autorizadas
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-700 dark:bg-blue-500" /> Ingresos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 dark:bg-slate-600" /> Salidas
              </span>
            </div>
          </div>

          <div className="flex-1 flex items-end gap-3 sm:gap-5 pt-6 pb-2 min-h-[220px] overflow-x-auto">
            {data.monthlySeries.length === 0 ? (
              <div className="w-full text-center text-sm text-slate-500 dark:text-slate-400 py-12">
                Aún no hay movimientos registrados este año.
              </div>
            ) : (
              data.monthlySeries.map((item) => {
                const inPct = Math.max(4, Math.round((item.ingreso_val / maxChartVal) * 100));
                const outPct = Math.max(4, Math.round((item.salida_val / maxChartVal) * 100));
                return (
                  <div key={item.ym} className="flex-1 min-w-[54px] flex flex-col items-center gap-2">
                    <div className="w-full h-40 flex items-end justify-center gap-1.5">
                      <div
                        className="w-4 sm:w-5 bg-blue-700 dark:bg-blue-500 rounded-t-sm transition-all"
                        style={{ height: `${inPct}%` }}
                        title={`Ingresos ${item.ym}: ${formatCurrency(item.ingreso_val)} (${item.ingreso_qty} u.)`}
                      />
                      <div
                        className="w-4 sm:w-5 bg-slate-400 dark:bg-slate-600 rounded-t-sm transition-all"
                        style={{ height: `${outPct}%` }}
                        title={`Salidas ${item.ym}: ${formatCurrency(item.salida_val)} (${item.salida_qty} u.)`}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                        {item.ym}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        +{item.ingreso_qty} / -{item.salida_qty}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Reposición Prioritaria
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ítems por debajo o en su stock mínimo
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap"
            >
              Ver catálogo
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1 flex-1">
            {data.alerts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                Todos los productos están por encima de su nivel mínimo.
              </p>
            ) : (
              data.alerts.map((prod) => {
                const isOut = prod.stock_current === 0;
                return (
                  <div key={prod.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {prod.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {prod.sku} · Stock:{' '}
                        <strong className={isOut ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}>
                          {prod.stock_current}
                        </strong>{' '}
                        / Mín {prod.stock_min} {prod.unit}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {user.permissions.register_entry ? (
                        <button
                          type="button"
                          onClick={() => onQuickEntry(prod)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 text-xs font-medium whitespace-nowrap transition-colors"
                        >
                          + Ingreso
                        </button>
                      ) : user.permissions.request_order ? (
                        <button
                          type="button"
                          onClick={() => onQuickOrder(prod)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium whitespace-nowrap transition-colors"
                        >
                          Solicitar
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Movements Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Últimos Movimientos Registrados
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Trazabilidad automática de stock, costos y responsables
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('movements')}
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap"
          >
            Ver historial completo
          </button>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Folio / Fecha</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Producto</th>
                <th className="py-3 px-4 text-right">Cantidad</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4">Responsable / Detalle</th>
                <th className="py-3 px-4 text-right">Reporte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {data.recentMovements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {m.folio}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(m.created_at)}</p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {m.type === 'INGRESO' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <ArrowDownLeft className="w-3.5 h-3.5" /> Ingreso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Salida
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">{m.sku}</p>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {m.type === 'INGRESO' ? '+' : '-'}{m.quantity} {m.unit}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatCurrency(m.total_value)}
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-200 truncate">
                      {m.responsible_name || 'Almacén'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.reason_detail}</p>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {m.type === 'SALIDA' ? (
                      <button
                        type="button"
                        onClick={() => onOpenExitPdf(m)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" /> PDF
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {data.recentMovements.map((m) => (
            <div key={m.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {m.folio}
                </span>
                <span
                  className={`text-xs font-medium ${
                    m.type === 'INGRESO' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {m.type === 'INGRESO' ? 'Ingreso' : 'Salida'} · {m.type === 'INGRESO' ? '+' : '-'}{m.quantity} {m.unit}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Responsable: {m.responsible_name} · {formatCurrency(m.total_value)}
              </p>
              {m.type === 'SALIDA' && (
                <button
                  type="button"
                  onClick={() => onOpenExitPdf(m)}
                  className="min-h-[40px] w-full mt-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> Ver / Exportar PDF de Salida
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
