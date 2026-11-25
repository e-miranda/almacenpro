import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  Download,
  FileSpreadsheet,
  FolderTree,
  Users,
  X,
} from 'lucide-react';
import { MONTHS_ES, apiFetch, formatCurrency, formatDateTime } from '../lib/api';
import {
  downloadExpensesReportPdf,
  downloadIncomeReportPdf,
  downloadPeriodReportPdf,
} from '../lib/pdf';
import type { Movement, ReportSummary } from '../types';

type ReportTab = 'general' | 'ingresos' | 'egresos' | 'users' | 'categories' | 'movements';

export const ReportsView: React.FC = () => {
  const now = new Date();
  const [mode, setMode] = useState<'monthly' | 'annual'>('monthly');
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1).padStart(2, '0'));
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<ReportTab>('general');

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode, year, month });
      if (selectedUserId !== 'ALL') params.set('user_id', selectedUserId);
      if (selectedCategoryId !== 'ALL') params.set('category_id', selectedCategoryId);
      const res = await apiFetch<ReportSummary>(`/api/reports/summary?${params.toString()}`);
      setSummary(res);
    } finally {
      setLoading(false);
    }
  }, [mode, year, month, selectedUserId, selectedCategoryId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportCsv = () => {
    if (!summary) return;
    let rows: string[][] = [];
    let prefix = `Reporte_${mode}`;

    if (activeTab === 'users') {
      prefix = `Reporte_Usuarios_${mode}`;
      rows = [
        [
          'Usuario',
          'Correo',
          'Rol',
          'Area',
          'Movimientos',
          'Ingresos',
          'Salidas',
          'Unidades Ingreso',
          'Unidades Salida',
          'Pedidos Solicitados',
          'Valor Operado (Bs.)',
        ],
        ...summary.userReport.map((u) => [
          `"${u.name.replace(/"/g, '""')}"`,
          u.email,
          u.role_name,
          `"${u.department.replace(/"/g, '""')}"`,
          String(u.movement_count),
          String(u.ingreso_count),
          String(u.salida_count),
          String(u.ingreso_units),
          String(u.salida_units),
          String(u.orders_requested),
          String(u.total_value),
        ]),
      ];
    } else if (activeTab === 'categories') {
      prefix = `Reporte_Categorias_${mode}`;
      rows = [
        [
          'Codigo',
          'Categoria',
          'Productos',
          'Stock Total',
          'Valor Inventario Costo (Bs.)',
          'Valor Inventario Venta (Bs.)',
          'Entradas Periodo',
          'Salidas Periodo',
          'Valor Ingresos (Bs.)',
          'Valor Salidas (Bs.)',
        ],
        ...summary.categoryReport.map((c) => [
          c.code,
          `"${c.name.replace(/"/g, '""')}"`,
          String(c.product_count),
          String(c.stock_units),
          String(c.inventory_cost_value),
          String(c.inventory_sale_value),
          String(c.ingreso_units),
          String(c.salida_units),
          String(c.ingreso_value),
          String(c.salida_value),
        ]),
      ];
    } else if (activeTab === 'ingresos' || activeTab === 'egresos') {
      const isIncome = activeTab === 'ingresos';
      const list: Movement[] = isIncome
        ? (summary.ingresoDetails ?? summary.movementDetails.filter((m) => m.type === 'INGRESO'))
        : (summary.egresoDetails ?? summary.movementDetails.filter((m) => m.type === 'SALIDA'));
      prefix = isIncome ? `Reporte_Ingresos_${mode}` : `Reporte_Egresos_Salidas_${mode}`;
      rows = [
        ['Centro de salud Pumas Andinos', isIncome ? 'Reporte de Ingresos' : 'Reporte de Egresos (Salidas)'],
        [
          'Folio',
          'Fecha',
          'Tipo',
          'SKU',
          'Producto',
          'Categoria',
          'Cantidad',
          'Unidad',
          'Costo Unitario (Bs.)',
          'Operador',
          isIncome ? 'Recibido / Proveedor' : 'Responsable / Destino',
          'Sector / Area',
          'Detalle / Motivo',
          'Valor Total (Bs.)',
        ],
        ...list.map((m) => [
          m.folio,
          m.created_at,
          m.type,
          m.sku,
          `"${m.product_name.replace(/"/g, '""')}"`,
          `"${(m.category || '').replace(/"/g, '""')}"`,
          String(m.quantity),
          m.unit,
          String(m.cost_resulting),
          `"${(m.operator_name || 'Sistema').replace(/"/g, '""')}"`,
          `"${m.responsible_name.replace(/"/g, '""')}"`,
          `"${(m.sector_name || m.responsible_area).replace(/"/g, '""')}"`,
          `"${m.reason_detail.replace(/"/g, '""')}"`,
          String(m.total_value),
        ]),
      ];
    } else if (activeTab === 'movements') {
      prefix = `Reporte_Movimientos_${mode}`;
      rows = [
        [
          'Folio',
          'Fecha',
          'Tipo',
          'SKU',
          'Producto',
          'Categoria',
          'Cantidad',
          'Operador',
          'Responsable',
          'Area',
          'Detalle',
          'Valor Total (Bs.)',
        ],
        ...summary.movementDetails.map((m) => [
          m.folio,
          m.created_at,
          m.type,
          m.sku,
          `"${m.product_name.replace(/"/g, '""')}"`,
          `"${(m.category || '').replace(/"/g, '""')}"`,
          String(m.quantity),
          `"${(m.operator_name || 'Sistema').replace(/"/g, '""')}"`,
          `"${m.responsible_name.replace(/"/g, '""')}"`,
          `"${m.responsible_area.replace(/"/g, '""')}"`,
          `"${m.reason_detail.replace(/"/g, '""')}"`,
          String(m.total_value),
        ]),
      ];
    } else {
      rows = [
        [
          'SKU',
          'Producto',
          'Categoria',
          'Stock Actual',
          'Stock Minimo',
          'Costo Anterior (Bs.)',
          'Costo Promedio (Bs.)',
          'Precio Actual (Bs.)',
          'Entradas Periodo',
          'Salidas Periodo',
        ],
        ...summary.topProducts.map((p) => [
          p.sku,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.category.replace(/"/g, '""')}"`,
          String(p.stock_current),
          String(p.stock_min),
          String(p.cost_previous),
          String(p.cost_current),
          String(p.price_current),
          String(p.total_in),
          String(p.total_out),
        ]),
      ];
    }

    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}_${year}${mode === 'monthly' ? `-${month}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxBar = summary
    ? Math.max(1, ...summary.breakdown.map((b) => Math.max(b.ingreso_value, b.salida_value)))
    : 1;

  const hasActiveFilter = selectedUserId !== 'ALL' || selectedCategoryId !== 'ALL';

  const reportTabs: Array<{
    key: ReportTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: 'general', label: 'Resumen General', icon: BarChart3 },
    { key: 'ingresos', label: 'Reporte de Ingresos', icon: ArrowDownLeft },
    { key: 'egresos', label: 'Reporte de Egresos (Salidas)', icon: ArrowUpRight },
    { key: 'users', label: 'Por Usuario', icon: Users },
    { key: 'categories', label: 'Por Categoría', icon: FolderTree },
    { key: 'movements', label: 'Movimientos y Stock', icon: ArrowLeftRight },
  ];

  const ingresoRows = summary
    ? (summary.ingresoDetails ?? summary.movementDetails.filter((m) => m.type === 'INGRESO'))
    : [];
  const egresoRows = summary
    ? (summary.egresoDetails ?? summary.movementDetails.filter((m) => m.type === 'SALIDA'))
    : [];

  const handleDownloadPrimaryPdf = () => {
    if (!summary) return;
    if (activeTab === 'ingresos') {
      downloadIncomeReportPdf(summary);
    } else if (activeTab === 'egresos') {
      downloadExpensesReportPdf(summary);
    } else {
      downloadPeriodReportPdf(summary);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
            Centro de salud Pumas Andinos
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 text-balance">
            Reportes Principales, Ingresos y Egresos (Salidas)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Centro de salud Pumas Andinos · Control de ingresos, salidas, desempeño por usuario y stock en Bolivianos (Bs.)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!summary}
            className="min-h-[42px] px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPrimaryPdf}
            disabled={!summary}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>
              {activeTab === 'ingresos'
                ? 'Descargar PDF Ingresos'
                : activeTab === 'egresos'
                  ? 'Descargar PDF Egresos'
                  : 'Descargar Reporte PDF'}
            </span>
          </button>
        </div>
      </div>

      {/* Period, User & Category Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('monthly')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'monthly'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Reporte Mensual
            </button>
            <button
              type="button"
              onClick={() => setMode('annual')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'annual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Reporte Anual
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 hidden sm:block" />
            {mode === 'monthly' && (
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {MONTHS_ES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {['2025', '2026', '2027'].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Filtrar por Usuario / Operador
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Todos los usuarios</option>
              {summary?.filterUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} ({u.role_name})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-5">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Filtrar por Categoría
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Todas las categorías</option>
              {summary?.filterCategories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 flex items-end">
            <button
              type="button"
              disabled={!hasActiveFilter}
              onClick={() => {
                setSelectedUserId('ALL');
                setSelectedCategoryId('ALL');
              }}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5 flex flex-wrap gap-1.5">
        {reportTabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-blue-700 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {loading || !summary ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Calculando métricas del período...
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Movimientos</p>
              <p className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {summary.totals.total_movements}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {summary.totals.ingreso_count} ingresos · {summary.totals.salida_count} salidas
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Valor Ingresado</p>
              <p className="mt-1 text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatCurrency(summary.totals.ingreso_value)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {summary.totals.ingreso_units} unidades recibidas
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Valor Despachado (Salidas)</p>
              <p className="mt-1 text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                {formatCurrency(summary.totals.salida_value)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {summary.totals.salida_units} unidades entregadas
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Balance Neto del Período</p>
              <p className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {formatCurrency(summary.totals.ingreso_value - summary.totals.salida_value)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                Diferencia unidades:{' '}
                {summary.totals.ingreso_units - summary.totals.salida_units >= 0 ? '+' : ''}
                {summary.totals.ingreso_units - summary.totals.salida_units}
              </p>
            </div>
          </div>

          {/* Breakdown Chart (General tab) */}
          {activeTab === 'general' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {mode === 'annual' ? `Desglose Mensual ${year}` : `Desglose Diario (${month}/${year})`}
              </h3>
              {summary.breakdown.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  No se registraron movimientos para los filtros seleccionados.
                </p>
              ) : (
                <div className="flex items-end gap-3 overflow-x-auto pb-2 min-h-[190px]">
                  {summary.breakdown.map((b) => {
                    const inH = Math.max(5, Math.round((b.ingreso_value / maxBar) * 100));
                    const outH = Math.max(5, Math.round((b.salida_value / maxBar) * 100));
                    const label =
                      mode === 'annual'
                        ? MONTHS_ES.find((m) => m.value === b.period_key)?.label.slice(0, 3) || b.period_key
                        : b.period_key.slice(5);
                    return (
                      <div key={b.period_key} className="flex-1 min-w-[54px] flex flex-col items-center gap-1.5">
                        <div className="w-full h-36 flex items-end justify-center gap-1.5">
                          <div
                            className="w-4 bg-blue-700 dark:bg-blue-500 rounded-t-sm"
                            style={{ height: `${inH}%` }}
                            title={`Ingresos: ${formatCurrency(b.ingreso_value)}`}
                          />
                          <div
                            className="w-4 bg-slate-400 dark:bg-slate-600 rounded-t-sm"
                            style={{ height: `${outH}%` }}
                            title={`Salidas: ${formatCurrency(b.salida_value)}`}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Dedicated Income Report (Reporte de Ingresos) */}
          {activeTab === 'ingresos' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Centro de salud Pumas Andinos
                  </p>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Reporte de Ingresos de Almacén ({ingresoRows.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total ingresado: {summary.totals.ingreso_units} unidades · Valor:{' '}
                    {formatCurrency(summary.totals.ingreso_value)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadIncomeReportPdf(summary)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF de Ingresos</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Folio / Fecha</th>
                      <th className="py-3 px-4">Producto / SKU</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4 text-right">Cantidad</th>
                      <th className="py-3 px-4 text-right">Costo Unit.</th>
                      <th className="py-3 px-4">Operador / Detalle</th>
                      <th className="py-3 px-4 text-right">Total Ingreso (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {ingresoRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          No hay ingresos registrados para los filtros seleccionados en este período.
                        </td>
                      </tr>
                    ) : (
                      ingresoRows.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <p className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                              {m.folio}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatDateTime(m.created_at)}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{m.sku}</p>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                            {m.category || 'General'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                            +{m.quantity} {m.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {formatCurrency(m.cost_resulting)}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {m.operator_name || 'Sistema'} · {m.responsible_area || 'Almacén'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {m.reason_detail}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                            {formatCurrency(m.total_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dedicated Expenses / Exits Report (Reporte de Egresos / Salidas) */}
          {activeTab === 'egresos' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Centro de salud Pumas Andinos
                  </p>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Reporte de Egresos / Salidas de Almacén ({egresoRows.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total despachado: {summary.totals.salida_units} unidades · Valor:{' '}
                    {formatCurrency(summary.totals.salida_value)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadExpensesReportPdf(summary)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF de Egresos</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Folio / Fecha</th>
                      <th className="py-3 px-4">Producto / SKU</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4 text-right">Cantidad</th>
                      <th className="py-3 px-4 text-right">Costo Unit.</th>
                      <th className="py-3 px-4">Responsable / Sector</th>
                      <th className="py-3 px-4">Motivo de Salida</th>
                      <th className="py-3 px-4 text-right">Total Egreso (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {egresoRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">
                          No hay egresos (salidas) registrados para los filtros seleccionados en este período.
                        </td>
                      </tr>
                    ) : (
                      egresoRows.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <p className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                              {m.folio}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatDateTime(m.created_at)}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{m.sku}</p>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                            {m.category || 'General'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums whitespace-nowrap">
                            -{m.quantity} {m.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {formatCurrency(m.cost_resulting)}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {m.responsible_name || 'No especificado'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {m.sector_name || m.responsible_area}
                            </p>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                              {m.reason_detail || 'Salida autorizada'}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                            {formatCurrency(m.total_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Category Report Section */}
          {(activeTab === 'general' || activeTab === 'categories') && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Reporte por Categoría e Inventario Valorizado (Bs.)
                  </h3>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Haz clic en una categoría para filtrar
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4 text-right">Productos</th>
                      <th className="py-3 px-4 text-right">Stock Actual</th>
                      <th className="py-3 px-4 text-right">Valor Inv. (Costo)</th>
                      <th className="py-3 px-4 text-right">Valor Inv. (Venta)</th>
                      <th className="py-3 px-4 text-right">Entradas Período</th>
                      <th className="py-3 px-4 text-right">Salidas Período</th>
                      <th className="py-3 px-4 text-right">Valor Movido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {summary.categoryReport.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          No hay categorías registradas.
                        </td>
                      </tr>
                    ) : (
                      summary.categoryReport.map((cat) => {
                        const isSelected = selectedCategoryId === String(cat.id);
                        return (
                          <tr
                            key={cat.id}
                            onClick={() =>
                              setSelectedCategoryId(isSelected ? 'ALL' : String(cat.id))
                            }
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50/80 dark:bg-blue-950/40'
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{cat.name}</p>
                              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{cat.code}</p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{cat.product_count}</td>
                            <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                              {cat.stock_units}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatCurrency(cat.inventory_cost_value)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-blue-800 dark:text-blue-400 font-semibold tabular-nums">
                              {formatCurrency(cat.inventory_sale_value)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                              +{cat.ingreso_units}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                              -{cat.salida_units}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                              {formatCurrency(cat.ingreso_value + cat.salida_value)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User Report Section */}
          {(activeTab === 'general' || activeTab === 'users') && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Reporte por Usuario y Cantidad de Movimientos
                  </h3>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Haz clic en un usuario para ver su detalle
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Usuario / Rol</th>
                      <th className="py-3 px-4 text-right">Movimientos</th>
                      <th className="py-3 px-4 text-right">Ingresos (Cant / Und)</th>
                      <th className="py-3 px-4 text-right">Salidas (Cant / Und)</th>
                      <th className="py-3 px-4 text-right">Pedidos</th>
                      <th className="py-3 px-4 text-right">Valor Ingresos</th>
                      <th className="py-3 px-4 text-right">Valor Salidas</th>
                      <th className="py-3 px-4 text-right">Total Operado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {summary.userReport.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          Sin actividad de usuarios registrada.
                        </td>
                      </tr>
                    ) : (
                      summary.userReport.map((u) => {
                        const isSelected = selectedUserId === String(u.id);
                        return (
                          <tr
                            key={u.id}
                            onClick={() =>
                              setSelectedUserId(isSelected ? 'ALL' : String(u.id))
                            }
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50/80 dark:bg-blue-950/40'
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {u.role_name} · {u.department}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                              {u.movement_count}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                              {u.ingreso_count} ({u.ingreso_units} u.)
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                              {u.salida_count} ({u.salida_units} u.)
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                              {u.orders_requested}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
                              {formatCurrency(u.ingreso_value)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                              {formatCurrency(u.salida_value)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                              {formatCurrency(u.total_value)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed Movements Table (shown in Por Usuario, Movimientos y Stock, or when filter active) */}
          {(activeTab === 'users' || activeTab === 'movements' || hasActiveFilter) && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Detalle de Movimientos Operados ({summary.movementDetails.length})
                  </h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Folio / Fecha</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Producto / Categoría</th>
                      <th className="py-3 px-4 text-right">Cantidad</th>
                      <th className="py-3 px-4">Operador</th>
                      <th className="py-3 px-4">Responsable / Detalle</th>
                      <th className="py-3 px-4 text-right">Total (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {summary.movementDetails.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          No existen movimientos para el usuario o categoría seleccionados en este período.
                        </td>
                      </tr>
                    ) : (
                      summary.movementDetails.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {m.folio}
                            </p>
                            <p className="text-[11px] text-slate-400">{formatDateTime(m.created_at)}</p>
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            <span
                              className={
                                m.type === 'INGRESO'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }
                            >
                              {m.type}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {m.category || 'General'} · {m.sku}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                            {m.quantity} {m.unit}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                            {m.operator_name || 'Sistema'}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {m.responsible_name} · {m.responsible_area}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {m.reason_detail}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                            {formatCurrency(m.total_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock & Costs Table (General, Por Categoría, Movimientos y Stock) */}
          {(activeTab === 'general' || activeTab === 'categories' || activeTab === 'movements') && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Niveles de Stock Actualizados Automáticamente y Costos (Bs.)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">SKU / Producto</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4 text-right">Stock Actual</th>
                      <th className="py-3 px-4 text-right">Stock Mín.</th>
                      <th className="py-3 px-4 text-right">Entradas Período</th>
                      <th className="py-3 px-4 text-right">Salidas Período</th>
                      <th className="py-3 px-4 text-right">Costo Ant. / Prom.</th>
                      <th className="py-3 px-4 text-right">Precio Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {summary.topProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{p.sku}</p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                          {p.category}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          <span
                            className={
                              p.stock_current === 0
                                ? 'text-red-700 dark:text-red-400'
                                : p.stock_current <= p.stock_min
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
                            }
                          >
                            {p.stock_current} {p.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {p.stock_min}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                          +{p.total_in}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                          -{p.total_out}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                          {formatCurrency(p.cost_previous)} →{' '}
                          <strong className="text-slate-900 dark:text-slate-100">
                            {formatCurrency(p.cost_current)}
                          </strong>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-blue-800 dark:text-blue-400 tabular-nums">
                          {formatCurrency(p.price_current)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
