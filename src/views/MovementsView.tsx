import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime } from '../lib/api';
import type { AuthUser, Movement, Personnel, Product, Sector } from '../types';
import { CostAnalysisCard } from '../components/CostAnalysisCard';

interface MovementsViewProps {
  user: AuthUser;
  products: Product[];
  preselectedProduct: Product | null;
  preselectedMode: 'INGRESO' | 'SALIDA';
  onClearPreselected: () => void;
  onOpenStockSearch: () => void;
  onOpenExitPdf: (movement: Movement, items?: Movement[]) => void;
  onStockChanged: () => void;
}

export const MovementsView: React.FC<MovementsViewProps> = ({
  user,
  products,
  preselectedProduct,
  preselectedMode,
  onClearPreselected,
  onOpenStockSearch,
  onOpenExitPdf,
  onStockChanged,
}) => {
  const canEntry = user.permissions.register_entry;
  const canExit = user.permissions.register_exit;

  const [formType, setFormType] = useState<'INGRESO' | 'SALIDA'>(
    preselectedMode === 'SALIDA' && canExit ? 'SALIDA' : canEntry ? 'INGRESO' : 'SALIDA'
  );

  // Catalogs for Sector & Personnel
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);

  // Entry fields (single product + weighted cost analysis)
  const [selectedProductId, setSelectedProductId] = useState<number>(
    preselectedProduct?.id || products[0]?.id || 0
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [costEntry, setCostEntry] = useState<number>(preselectedProduct?.cost_current || 0);
  const [marginPercent, setMarginPercent] = useState<number>(preselectedProduct?.margin_percent || 30);
  const [customNewPrice, setCustomNewPrice] = useState<string>('');

  // Multi-product exit items
  const [exitItems, setExitItems] = useState<Array<{ product_id: number; quantity: number }>>(() =>
    preselectedProduct
      ? [{ product_id: preselectedProduct.id, quantity: 1 }]
      : products[0]
        ? [{ product_id: products[0].id, quantity: 1 }]
        : []
  );

  // Responsible Personnel & Sector
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<number>(0); // 0 = manual / custom
  const [selectedSectorId, setSelectedSectorId] = useState<number>(0);
  const [responsibleName, setResponsibleName] = useState<string>('');
  const [responsibleArea, setResponsibleArea] = useState<string>('');
  const [reasonDetail, setReasonDetail] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'INGRESO' | 'SALIDA'>('ALL');
  const [searchQ, setSearchQ] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);

  const filteredSelectorProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, productQuery]);

  const activeSectors = useMemo(() => sectors.filter((s) => s.active === 1), [sectors]);
  const activePersonnel = useMemo(() => personnelList.filter((p) => p.active === 1), [personnelList]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ sectors: Sector[] }>('/api/sectors'),
      apiFetch<{ personnel: Personnel[] }>('/api/personnel'),
    ])
      .then(([secRes, perRes]) => {
        setSectors(secRes.sectors);
        setPersonnelList(perRes.personnel);
        const firstActivePer = perRes.personnel.find((p) => p.active === 1);
        const firstActiveSec = secRes.sectors.find((s) => s.active === 1);
        if (firstActivePer) {
          setSelectedPersonnelId(firstActivePer.id);
          setResponsibleName(firstActivePer.name);
          setSelectedSectorId(firstActivePer.sector_id);
          setResponsibleArea(firstActivePer.sector_name);
        } else if (firstActiveSec) {
          setSelectedSectorId(firstActiveSec.id);
          setResponsibleArea(firstActiveSec.name);
        }
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  useEffect(() => {
    if (products.length > 0 && exitItems.length === 0) {
      setExitItems([{ product_id: products[0].id, quantity: 1 }]);
    }
  }, [products, exitItems.length]);

  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
      setCostEntry(preselectedProduct.cost_current);
      setMarginPercent(preselectedProduct.margin_percent);
      setCustomNewPrice('');
      setExitItems([{ product_id: preselectedProduct.id, quantity: 1 }]);
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

  const handlePersonnelSelect = (pid: number) => {
    setSelectedPersonnelId(pid);
    if (pid === 0) {
      setResponsibleName('');
      return;
    }
    const person = personnelList.find((p) => p.id === pid);
    if (person) {
      setResponsibleName(person.name);
      setSelectedSectorId(person.sector_id);
      setResponsibleArea(person.sector_name);
    }
  };

  const handleSectorSelect = (sid: number) => {
    setSelectedSectorId(sid);
    const sec = sectors.find((s) => s.id === sid);
    if (sec) {
      setResponsibleArea(sec.name);
    }
  };

  const addExitLine = () => {
    if (products.length === 0) return;
    const usedIds = new Set(exitItems.map((l) => l.product_id));
    const nextProd =
      products.find((p) => !usedIds.has(p.id) && p.stock_current > 0) ||
      products.find((p) => p.stock_current > 0) ||
      products[0];
    setExitItems((prev) => [...prev, { product_id: nextProd.id, quantity: 1 }]);
  };

  // Live totals for Multi-product exit
  const exitSummary = useMemo(() => {
    const qtyByProd = new Map<number, number>();
    let totalUnits = 0;
    let totalValue = 0;
    const stockWarnings: string[] = [];

    for (const line of exitItems) {
      const pid = line.product_id;
      const qty = Math.max(0, Number(line.quantity) || 0);
      qtyByProd.set(pid, (qtyByProd.get(pid) ?? 0) + qty);
      totalUnits += qty;
      const prod = products.find((p) => p.id === pid);
      if (prod) {
        totalValue += qty * prod.cost_current;
      }
    }

    for (const [pid, qty] of qtyByProd.entries()) {
      const prod = products.find((p) => p.id === pid);
      if (prod && qty > prod.stock_current) {
        stockWarnings.push(
          `${prod.name}: solicitado ${qty} ${prod.unit}, disponible ${prod.stock_current}`
        );
      }
    }

    return { totalUnits, totalValue, stockWarnings, distinctCount: qtyByProd.size };
  }, [exitItems, products]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      if (formType === 'INGRESO') {
        if (!activeProduct) return;
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
        setQuantity(1);
        setCustomNewPrice('');
      } else {
        if (exitItems.length === 0) {
          setFeedback({ type: 'err', text: 'Agrega al menos un producto para registrar la salida.' });
          setSubmitting(false);
          return;
        }
        if (exitSummary.stockWarnings.length > 0) {
          setFeedback({
            type: 'err',
            text: `Stock insuficiente: ${exitSummary.stockWarnings[0]}`,
          });
          setSubmitting(false);
          return;
        }

        const res = await apiFetch<{ movement: Movement; movements: Movement[] }>(
          '/api/movements/exit',
          {
            method: 'POST',
            body: JSON.stringify({
              items: exitItems,
              personnel_id: selectedPersonnelId > 0 ? selectedPersonnelId : null,
              sector_id: selectedSectorId > 0 ? selectedSectorId : null,
              responsible_name: responsibleName.trim(),
              responsible_area: responsibleArea.trim() || 'Operaciones',
              reason_detail: reasonDetail.trim(),
            }),
          }
        );

        const count = res.movements?.length || 1;
        setFeedback({
          type: 'ok',
          text: `Salida ${res.movement.folio} registrada (${count} producto${count > 1 ? 's' : ''}) para ${res.movement.responsible_name} (${res.movement.sector_name || res.movement.responsible_area}).`,
        });
        setExitItems(products[0] ? [{ product_id: products[0].id, quantity: 1 }] : []);
        onOpenExitPdf(res.movement, res.movements);
      }

      setReasonDetail('');
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
            Ingresos, Salidas Multi-Producto y Análisis de Costos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Despacha múltiples materiales por personal y sector en Bolivianos (Bs.) con comprobante PDF unificado
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenStockSearch}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2 self-start sm:self-auto"
        >
          <Search className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          <span>Buscar Producto y Stock</span>
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

            {formType === 'INGRESO' && activeProduct ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Stock actual:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {activeProduct.stock_current} {activeProduct.unit}
                </strong>
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {exitSummary.distinctCount} producto(s) · {exitSummary.totalUnits} uds. ·{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {formatCurrency(exitSummary.totalValue)}
                </strong>
              </p>
            )}
          </div>

          {formType === 'INGRESO' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Producto / Material *
                    </label>
                    <input
                      type="text"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="Filtrar producto o SKU..."
                      className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <select
                    value={activeProduct?.id || ''}
                    onChange={(e) => handleProductChange(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {(filteredSelectorProducts.length > 0 ? filteredSelectorProducts : products).map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.sku}] {p.name} — Existencia: {p.stock_current} {p.unit}
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
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

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
              </div>

              {activeProduct && (
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
                    Proveedor o Responsable
                  </label>
                  <input
                    type="text"
                    value={responsibleName}
                    onChange={(e) => setResponsibleName(e.target.value)}
                    placeholder={user.name}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Área / Proveedor
                  </label>
                  <input
                    type="text"
                    value={responsibleArea}
                    onChange={(e) => setResponsibleArea(e.target.value)}
                    placeholder="Recepción Almacén"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="md:col-span-5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Observaciones o Referencia OC
                  </label>
                  <input
                    type="text"
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    placeholder="Factura, orden de compra o nota de entrega"
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </>
          ) : (
            /* SALIDA MULTI-PRODUCTO + PERSONAL Y SECTOR */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                    Personal que retira / recibe *
                  </label>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => handlePersonnelSelect(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {activePersonnel.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.position} ({p.sector_name})
                      </option>
                    ))}
                    <option value={0}>Otro / Externo (ingresar nombre manualmente)</option>
                  </select>
                </div>

                <div className="md:col-span-6">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                    Sector de destino *
                  </label>
                  <select
                    value={selectedSectorId}
                    onChange={(e) => handleSectorSelect(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {activeSectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        [{s.code}] {s.name}
                      </option>
                    ))}
                    <option value={0}>Otro sector</option>
                  </select>
                </div>
              </div>

              {(selectedPersonnelId === 0 || selectedSectorId === 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedPersonnelId === 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre completo del responsable *
                      </label>
                      <input
                        type="text"
                        required
                        value={responsibleName}
                        onChange={(e) => setResponsibleName(e.target.value)}
                        placeholder="Nombre y apellido de quien retira"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}
                  {selectedSectorId === 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nombre del sector / área *
                      </label>
                      <input
                        type="text"
                        required
                        value={responsibleArea}
                        onChange={(e) => setResponsibleArea(e.target.value)}
                        placeholder="Ej. Mantenimiento Planta"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Multi-Product Rows */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Productos incluidos en esta salida *
                  </span>
                  <button
                    type="button"
                    onClick={addExitLine}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar producto</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {exitItems.map((line, idx) => {
                    const prod = products.find((p) => p.id === line.product_id);
                    const subtotal = prod ? line.quantity * prod.cost_current : 0;
                    const overStock = prod ? line.quantity > prod.stock_current : false;
                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800"
                      >
                        <select
                          value={line.product_id}
                          onChange={(e) => {
                            const next = [...exitItems];
                            next[idx].product_id = Number(e.target.value);
                            setExitItems(next);
                          }}
                          className="flex-1 min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.sku}] {p.name} (Stock: {p.stock_current} {p.unit} · {formatCurrency(p.cost_current)})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-28">
                            <input
                              type="number"
                              min={1}
                              max={prod ? Math.max(1, prod.stock_current) : undefined}
                              required
                              value={line.quantity}
                              onChange={(e) => {
                                const next = [...exitItems];
                                next[idx].quantity = Math.max(1, Number(e.target.value));
                                setExitItems(next);
                              }}
                              aria-label="Cantidad a retirar"
                              className={`w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                                overStock
                                  ? 'border-red-500 text-red-700 dark:text-red-400'
                                  : 'border-slate-300 dark:border-slate-700'
                              }`}
                            />
                          </div>

                          <div className="w-28 text-right font-mono text-xs tabular-nums">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatCurrency(subtotal)}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Disp: {prod?.stock_current ?? 0} {prod?.unit || ''}
                            </p>
                          </div>

                          {exitItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExitItems((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label="Quitar producto"
                              className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {exitSummary.stockWarnings.length > 0 && (
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">
                    {exitSummary.stockWarnings.join(' · ')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Detalle / Motivo de la salida *
                </label>
                <input
                  type="text"
                  required
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="Describe la orden de trabajo, mantenimiento o proyecto al que se asignan los materiales"
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          )}

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
              disabled={submitting || (formType === 'INGRESO' ? !activeProduct : exitItems.length === 0)}
              className={`min-h-[46px] px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 ${
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
              placeholder="Filtrar por folio, producto, personal, sector o detalle..."
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
                    <th className="py-3 px-4 text-right">Total (Bs.)</th>
                    <th className="py-3 px-4">Personal / Sector</th>
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
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {formatCurrency(m.total_value)}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {m.responsible_name}{' '}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            · {m.sector_name || m.responsible_area}
                          </span>
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
                    Responsable: <strong>{m.responsible_name}</strong> · Sector: {m.sector_name || m.responsible_area}
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
