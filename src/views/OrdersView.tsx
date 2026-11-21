import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api';
import type { AuthUser, Movement, Product, WarehouseOrder } from '../types';

interface OrdersViewProps {
  user: AuthUser;
  products: Product[];
  preselectedProduct: Product | null;
  onClearPreselected: () => void;
  onDispatchedExit: (movement: Movement) => void;
  onStockChanged: () => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  user,
  products,
  preselectedProduct,
  onClearPreselected,
  onDispatchedExit,
  onStockChanged,
}) => {
  const [orders, setOrders] = useState<WarehouseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | WarehouseOrder['status']>('ALL');
  const [showForm, setShowForm] = useState(Boolean(preselectedProduct));

  const [department, setDepartment] = useState(user.department || 'Operaciones');
  const [priority, setPriority] = useState<'Normal' | 'Urgente'>('Normal');
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<Array<{ product_id: number; quantity: number }>>(() =>
    preselectedProduct
      ? [{ product_id: preselectedProduct.id, quantity: 1 }]
      : products[0]
        ? [{ product_id: products[0].id, quantity: 1 }]
        : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (preselectedProduct) {
      setShowForm(true);
      setDraftItems([{ product_id: preselectedProduct.id, quantity: 1 }]);
      onClearPreselected();
    }
  }, [preselectedProduct, onClearPreselected]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ orders: WarehouseOrder[] }>('/api/orders');
      setOrders(res.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar pedidos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const addDraftLine = () => {
    if (products.length === 0) return;
    setDraftItems((prev) => [...prev, { product_id: products[0].id, quantity: 1 }]);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ folio: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          department,
          priority,
          notes,
          items: draftItems,
        }),
      });
      setFeedback(`Pedido ${res.folio} enviado para autorización.`);
      setNotes('');
      setShowForm(false);
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (orderId: number, decision: 'Aprobado' | 'Rechazado') => {
    setError('');
    setFeedback('');
    try {
      await apiFetch(`/api/orders/${orderId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          review_notes:
            decision === 'Aprobado'
              ? 'Autorizado para entrega en almacén.'
              : 'Solicitud no autorizada por administración.',
        }),
      });
      setFeedback(`Pedido ${decision.toLowerCase()} correctamente.`);
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el pedido.');
    }
  };

  const handleDispatch = async (order: WarehouseOrder) => {
    setError('');
    setFeedback('');
    try {
      const res = await apiFetch<{ movements: Movement[] }>(`/api/orders/${order.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ responsible_name: order.requester_name }),
      });
      setFeedback(`Pedido ${order.folio} despachado y stock descontado automáticamente.`);
      onStockChanged();
      loadOrders();
      if (res.movements && res.movements[0]) {
        onDispatchedExit(res.movements[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo despachar el pedido.');
    }
  };

  const filteredOrders =
    statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter);

  const renderStatusLabel = (status: WarehouseOrder['status']) => {
    switch (status) {
      case 'Pendiente':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" /> Pendiente de Autorización
          </span>
        );
      case 'Aprobado':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <ClipboardCheck className="w-3.5 h-3.5" /> Autorizado (Por Despachar)
          </span>
        );
      case 'Despachado':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <PackageCheck className="w-3.5 h-3.5" /> Despachado
          </span>
        );
      case 'Rechazado':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
            <XCircle className="w-3.5 h-3.5" /> Rechazado
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Pedidos y Autorizaciones
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Solicita materiales al almacén, autoriza salidas y despacha con reporte PDF automático
          </p>
        </div>
        {user.permissions.request_order && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium flex items-center gap-2 self-start sm:self-auto whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{showForm ? 'Cerrar Formulario' : 'Solicitar Pedido'}</span>
          </button>
        )}
      </div>

      {showForm && user.permissions.request_order && (
        <form
          onSubmit={handleSubmitOrder}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            Nueva Solicitud de Pedido / Salida de Almacén
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Área / Departamento
              </label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'Normal' | 'Urgente')}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="Normal">Normal</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Solicitante
              </label>
              <input
                type="text"
                disabled
                value={user.name}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Ítems solicitados *
              </label>
              <button
                type="button"
                onClick={addDraftLine}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar otro ítem
              </button>
            </div>

            {draftItems.map((line, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2">
                <select
                  value={line.product_id}
                  onChange={(e) => {
                    const next = [...draftItems];
                    next[idx].product_id = Number(e.target.value);
                    setDraftItems(next);
                  }}
                  className="flex-1 min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.sku}] {p.name} (Disponible: {p.stock_current} {p.unit})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    required
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...draftItems];
                      next[idx].quantity = Math.max(1, Number(e.target.value));
                      setDraftItems(next);
                    }}
                    className="w-28 min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  {draftItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400"
                      aria-label="Eliminar línea"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Detalle / Justificación del pedido *
            </label>
            <textarea
              required
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Indica orden de trabajo, proyecto o motivo de uso"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Enviando...' : 'Enviar Solicitud'}</span>
            </button>
          </div>
        </form>
      )}

      {feedback && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-xs font-medium text-emerald-900 dark:text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 px-4 py-3 text-xs font-medium text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
        {(['ALL', 'Pendiente', 'Aprobado', 'Despachado', 'Rechazado'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              statusFilter === s
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {s === 'ALL' ? 'Todos' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Cargando pedidos...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No hay pedidos en esta categoría.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {order.folio}
                    </span>
                    <span>·</span>
                    <span>{formatDateTime(order.created_at)}</span>
                    <span>·</span>
                    <span className={order.priority === 'Urgente' ? 'text-red-700 dark:text-red-400 font-semibold' : ''}>
                      Prioridad {order.priority}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    Solicita: {order.requester_name} · {order.department}
                  </p>
                </div>
                <div>{renderStatusLabel(order.status)}</div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {order.items.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{item.product_name}</p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {item.sku} · Stock disponible en almacén: {item.stock_current} {item.unit}
                      </p>
                    </div>
                    <p className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                      {item.quantity_requested} {item.unit}
                    </p>
                  </div>
                ))}
              </div>

              {order.notes && (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                  <strong>Detalle:</strong> {order.notes}
                </p>
              )}

              {(order.reviewed_by || order.dispatched_by) && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {order.reviewed_by && `Revisado por ${order.reviewed_by}`}
                  {order.reviewed_by && order.dispatched_by && ' · '}
                  {order.dispatched_by && `Despachado por ${order.dispatched_by}`}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {order.status === 'Pendiente' && user.permissions.approve_orders && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleReview(order.id, 'Rechazado')}
                      className="min-h-[42px] px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" /> Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(order.id, 'Aprobado')}
                      className="min-h-[42px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Autorizar Pedido
                    </button>
                  </>
                )}
                {order.status === 'Aprobado' && user.permissions.register_exit && (
                  <button
                    type="button"
                    onClick={() => handleDispatch(order)}
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" /> Despachar Salida y Generar PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
