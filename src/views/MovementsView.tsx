import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  ScanLine,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime } from '../lib/api';
import type { AuthUser, Movement, Product } from '../types';
import { CostAnalysisCard } from '../components/CostAnalysisCard';

interface MovementsViewProps {
  user: AuthUser;
  products: Product[];
  preselectedProduct: Product | null;
  preselectedMode: 'INGRESO' | 'SALIDA';
  onClearPreselected: () => void;
  onOpenScanner: () => void;
  onOpenExitPdf: (movement: Movement) => void;
  onStockChanged: () => void;
}

export const MovementsView: React.FC<MovementsViewProps> = ({
  user,
  products,
  preselectedProduct,
  preselectedMode,
  onClearPreselected,
  onOpenScanner,
  onOpenExitPdf,
  onStockChanged,
}) => {
  const canEntry = user.permissions.register_entry;
  const canExit = user.permissions.register_exit;

  const [formType, setFormType] = useState<'INGRESO' | 'SALIDA'>(
    preselectedMode === 'SALIDA' && canExit ? 'SALIDA' : canEntry ? 'INGRESO' : 'SALIDA'
  );
  const [selectedProductId, setSelectedProductId] = useState<number>(
    preselectedProduct?.id || products[0]?.id || 0
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [costEntry, setCostEntry] = useState<number>(preselectedProduct?.cost_current || 0);
  const [marginPercent, setMarginPercent] = useState<number>(preselectedProduct?.margin_percent || 30);
  const [customNewPrice, setCustomNewPrice] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState<string>('');
  const [responsibleArea, setResponsibleArea] = useState<string>('');
  const [reasonDetail, setReasonDetail] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'INGRESO' | 'SALIDA'>('ALL');
  const [searchQ, setSearchQ] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
      setCostEntry(preselectedProduct.cost_current);
      setMarginPercent(preselectedProduct.margin_percent);
      setCustomNewPrice('');
      if (preselectedMode === 'SALIDA' && canExit) setFormType('SALIDA');
      if (preselectedMode === 'INGRESO' && canEntry) setFormType('INGRESO');
      onClearPreselected();
    }
  }, [preselectedProduct, preselectedMode, canEntry, canExit, onClearPreselected]);

  const activeProduct = products.find((p) => p.id === selectedProductId) || products[0] || null;

  useEffect(() => {
    if (activeProduct && !preselectedProduct) {
      setCostEntry((prev) => (prev === 0 ? activeProduct.cost_current : prev));
    }
  }, [activeProduct, preselectedProduct]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== 'ALL') params.set('type', filterType);
      if (searchQ.trim()) params.set('q', searchQ.trim());
      const res = await apiFetch<{ movements: Movement[] }>(`/api/movements?${params.toString()}`);
      setMovements(res.movements);
    } finally {
      setLoadingHistory(false);
    }
  }, [filterType, searchQ]);

  useEffect(() => {
    const t = setTimeout(loadHistory, 120);
    return () => clearTimeout(t);
  }, [loadHistory]);

  const handleProductChange = (id: number) => {
    setSelectedProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setCostEntry(p.cost_current);
      setMarginPercent(p.margin_percent);
      setCustomNewPrice('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    setFeedback(null);
    setSubmitting(true);

    try {
      if (formType === 'INGRESO') {
        const res = await apiFetch<{ movement: Movement }>('/api/movements/entry', {
          method: 'POST',
          body: JSON.stringify({
            product_id: activeProduct.id,
            quantity,
            cost_entry: costEntry,
            margin_percent: marginPercent,
            new_price: customNewPrice.trim() !== '' ? Number(customNewPrice) : null,
            responsible_name: responsibleName || user.name,
            responsible_area: responsibleArea || 'Recepción Almacén',
            reason_detail: reasonDetail || 'Ingreso y actualización de costo promedio',
          }),
        });
        setFeedback({
          type: 'ok',
          text: `Ingreso ${res.movement.folio} registrado. Nuevo costo promedio: ${formatCurrency(res.movement.cost_resulting)} · Nuevo precio: ${formatCurrency(res.movement.price_resulting)}.`,
        });
      } else {
        const res = await apiFetch<{ movement: Movement }>('/api/movements/exit', {
          method: 'POST',
          body: JSON.stringify({
            product_id: activeProduct.id,
            quantity,
            responsible_name: responsibleName,
            responsible_area: responsibleArea || 'Operaciones',
            reason_detail: reasonDetail,
          }),
        });
        setFeedback({
          type: 'ok',
          text: `Salida ${res.movement.folio} registrada a nombre de ${res.movement.responsible_name}.`,
        });
        onOpenExitPdf(res.movement);
      }

      setQuantity(1);
      setReasonDetail('');
      setCustomNewPrice('');
      onStockChanged();
      loadHistory();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo procesar el movimiento.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Ingresos, Salidas y Análisis de Costos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Evalúa costo antiguo vs. nuevo en Bolivianos (Bs.) y genera reportes PDF en salidas
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenScanner}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2 self-start sm:self-auto"
        >
          <ScanLine className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          <span>Escanear Producto</span>
        </button>
      </div>

      {(canEntry || canExit) && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
              {canEntry && (
                <button
                  type="button"
                  onClick={() => setFormType('INGRESO')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
                    formType === 'INGRESO'
                      ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Registrar Ingreso
                </button>
              )}
              {canExit && (
                <button
                  type="button"
                  onClick={() => setFormType('SALIDA')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
                    formType === 'SALIDA'
                      ? 'bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Registrar Salida
                </button>
              )}
            </div>
            {activeProduct && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Stock actual:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {activeProduct.stock_current} {activeProduct.unit}
                </strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Producto / Material *
              </label>
              <select
                value={activeProduct?.id || ''}
                onChange={(e) => handleProductChange(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.sku}] {p.name} ({p.stock_current} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cantidad *
              </label>
              <input
                type="number"
                min={1}
                max={formType === 'SALIDA' && activeProduct ? Math.max(1, activeProduct.stock_current) : undefined}
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {formType === 'INGRESO' ? (
              <>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Costo Nuevo (Bs.) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={costEntry}
                    onChange={(e) => setCostEntry(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Margen (%) / Precio Bs.
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={marginPercent}
                      onChange={(e) => setMarginPercent(Number(e.target.value))}
                      title="Margen deseado %"
                      className="w-20 min-h-[44px] px-2.5 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={customNewPrice}
                      onChange={(e) => setCustomNewPrice(e.target.value)}
                      placeholder="Precio"
                      title="Precio manual opcional en Bs."
                      className="w-full min-h-[44px] px-2.5 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Área o Destino
                </label>
                <input
                  type="text"
                  value={responsibleArea}
                  onChange={(e) => setResponsibleArea(e.target.value)}
                  placeholder="Ej. Mantenimiento Planta / Línea 2"
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}
          </div>

          {formType === 'INGRESO' && activeProduct && (
            <CostAnalysisCard
              product={activeProduct}
              quantity={quantity}
              costEntry={costEntry}
              marginPercent={marginPercent}
              customNewPrice={customNewPrice}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {formType === 'SALIDA' ? 'Responsable que retira / recibe *' : 'Proveedor o Responsable'}
              </label>
              <input
                type="text"
                required={formType === 'SALIDA'}
                value={responsibleName}
                onChange={(e) => setResponsibleName(e.target.value)}
                placeholder={formType === 'SALIDA' ? 'Nombre completo del responsable' : user.name}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="md:col-span-8">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {formType === 'SALIDA' ? 'Detalle / Motivo de la salida *' : 'Observaciones o Referencia OC'}
              </label>
              <input
                type="text"
                required={formType === 'SALIDA'}
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                placeholder={
                  formType === 'SALIDA'
                    ? 'Describe el uso, orden de trabajo o proyecto al que se asigna el material'
                    : 'Factura, orden de compra o nota de entrega'
                }
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs font-medium ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              }`}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !activeProduct}
              className={`min-h-[46px] px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors ${
                formType === 'INGRESO'
                  ? 'bg-blue-700 hover:bg-blue-800'
                  : 'bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600'
              }`}
            >
              {submitting
                ? 'Procesando...'
                : formType === 'INGRESO'
                  ? 'Confirmar Ingreso y Actualizar Precio'
                  : 'Registrar Salida y Generar Reporte PDF'}
            </button>
          </div>
        </form>
      )}

      {/* Movements Ledger */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Filtrar por folio, producto, responsable o detalle..."
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg self-start">
            {(['ALL', 'INGRESO', 'SALIDA'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterType === t
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t === 'ALL' ? 'Todos' : t === 'INGRESO' ? 'Ingresos' : 'Salidas'}
              </button>
            ))}
          </div>
        </div>

        {loadingHistory ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Cargando movimientos...
          </div>
        ) : movements.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay movimientos para mostrar.
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Folio / Fecha</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4 text-right">Cant.</th>
                    <th className="py-3 px-4 text-right">Costo Ant. → Res.</th>
                    <th className="py-3 px-4 text-right">Precio Nuevo</th>
                    <th className="py-3 px-4">Responsable / Detalle</th>
                    <th className="py-3 px-4 text-right">Exportar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {m.folio}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(m.created_at)}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            m.type === 'INGRESO'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{m.sku}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {m.type === 'INGRESO' ? '+' : '-'}{m.quantity} {m.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {m.type === 'INGRESO' ? (
                          <span>
                            {formatCurrency(m.cost_previous)} →{' '}
                            <strong className="text-slate-900 dark:text-slate-100">
                              {formatCurrency(m.cost_resulting)}
                            </strong>
                          </span>
                        ) : (
                          <span>{formatCurrency(m.cost_resulting)}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {formatCurrency(m.price_resulting)}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {m.responsible_name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.reason_detail}</p>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {m.type === 'SALIDA' ? (
                          <button
                            type="button"
                            onClick={() => onOpenExitPdf(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 text-xs font-medium"
                          >
                            <FileText className="w-3.5 h-3.5" /> PDF / Enviar
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

            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {movements.map((m) => (
                <div key={m.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {m.folio}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        m.type === 'INGRESO'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {m.type} · {m.type === 'INGRESO' ? '+' : '-'}{m.quantity} {m.unit}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.product_name}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Responsable: <strong>{m.responsible_name}</strong> · {m.responsible_area}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{m.reason_detail}</p>
                  {m.type === 'SALIDA' && (
                    <button
                      type="button"
                      onClick={() => onOpenExitPdf(m)}
                      className="min-h-[44px] w-full rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-4 h-4" /> Reporte PDF / Móvil / Correo
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
