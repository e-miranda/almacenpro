import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Mail,
  MapPin,
  Share2,
  UserCheck,
  X,
} from 'lucide-react';
import type { Movement } from '../types';
import { apiFetch, formatCurrency, formatDateTime } from '../lib/api';
import {
  buildExitSummaryText,
  downloadExitPdf,
  exportExitByEmail,
  shareExitPdfMobile,
} from '../lib/pdf';

interface ExitReportModalProps {
  movement: Movement | null;
  movements?: Movement[];
  onClose: () => void;
}

export const ExitReportModal: React.FC<ExitReportModalProps> = ({
  movement,
  movements,
  onClose,
}) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const [batchItems, setBatchItems] = useState<Movement[]>([]);
  const [loadingBatch, setLoadingBatch] = useState(false);

  useEffect(() => {
    setFeedback('');
    setCopied(false);

    if (!movement) {
      setBatchItems([]);
      return;
    }

    if (movements && movements.length > 0) {
      setBatchItems(movements);
      return;
    }

    setBatchItems([movement]);

    if (movement.exit_batch_id || movement.folio.startsWith('SAL-')) {
      let active = true;
      setLoadingBatch(true);
      const target = movement.exit_batch_id ? String(movement.exit_batch_id) : movement.folio;
      apiFetch<{ items: Movement[] }>(`/api/movements/exit-batch/${encodeURIComponent(target)}`)
        .then((res) => {
          if (active && Array.isArray(res.items) && res.items.length > 0) {
            setBatchItems(res.items);
          }
        })
        .catch(() => {
          // fallback to single movement
        })
        .finally(() => {
          if (active) setLoadingBatch(false);
        });
      return () => {
        active = false;
      };
    }
  }, [movement, movements]);

  if (!movement) return null;

  const items = batchItems.length > 0 ? batchItems : [movement];
  const primary = items[0];
  const grandTotal = items.reduce((acc, m) => acc + (Number(m.total_value) || 0), 0);
  const totalUnits = items.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);

  const handleDownload = () => {
    downloadExitPdf(items);
    setFeedback(`Archivo Reporte_Salida_${primary.folio}.pdf descargado.`);
  };

  const handleShare = async () => {
    const res = await shareExitPdfMobile(items);
    setFeedback(res.message);
  };

  const handleEmail = () => {
    exportExitByEmail(items, recipientEmail.trim());
    setFeedback(
      `PDF descargado y cliente de correo abierto${recipientEmail ? ` para ${recipientEmail}` : ''}. Adjunta el PDF generado.`
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildExitSummaryText(items));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback('No se pudo copiar al portapapeles.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reporte de salida en PDF"
    >
      <div className="w-full sm:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                Centro de salud Pumas Andinos
              </p>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Reporte de Salida · {primary.folio}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(primary.created_at)} · {items.length} producto(s)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar reporte"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Materiales Entregados {loadingBatch ? '(cargando lote...)' : ''}
              </p>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                {totalUnits} uds. totales
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-52 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.product_name}
                    </p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.sku} · Unit: {formatCurrency(item.cost_resulting)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      {item.quantity} {item.unit}
                    </p>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                      {formatCurrency(item.total_value)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pt-2 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                  Personal responsable
                </p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {primary.responsible_name || 'No especificado'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  Sector: {primary.sector_name || primary.responsible_area || 'Operaciones'}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">Valoración Total de Salida</p>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                  {formatCurrency(grandTotal)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Detalle / Motivo de Salida</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5 leading-relaxed">
                {primary.reason_detail || 'Sin detalle registrado.'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Despachado por:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {primary.operator_name || 'Almacén Central'}
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Correo de destino (opcional para envío directo)
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="responsable@empresa.com"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {feedback && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-3.5 py-2.5 text-xs text-blue-900 dark:text-blue-200">
              {feedback}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Exportar a Plataforma Móvil</span>
            </button>
            <button
              type="button"
              onClick={handleEmail}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <span>Exportar por Correo</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              )}
              <span>{copied ? 'Resumen Copiado' : 'Copiar Detalle'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
