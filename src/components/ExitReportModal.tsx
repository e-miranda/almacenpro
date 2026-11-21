import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Mail,
  Share2,
  UserCheck,
  X,
} from 'lucide-react';
import type { Movement } from '../types';
import { formatCurrency, formatDateTime } from '../lib/api';
import {
  buildExitSummaryText,
  downloadExitPdf,
  exportExitByEmail,
  shareExitPdfMobile,
} from '../lib/pdf';

interface ExitReportModalProps {
  movement: Movement | null;
  onClose: () => void;
}

export const ExitReportModal: React.FC<ExitReportModalProps> = ({ movement, onClose }) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);

  if (!movement) return null;

  const handleDownload = () => {
    downloadExitPdf(movement);
    setFeedback(`Archivo Reporte_Salida_${movement.folio}.pdf descargado.`);
  };

  const handleShare = async () => {
    const res = await shareExitPdfMobile(movement);
    setFeedback(res.message);
  };

  const handleEmail = () => {
    exportExitByEmail(movement, recipientEmail.trim());
    setFeedback(
      `PDF descargado y cliente de correo abierto${recipientEmail ? ` para ${recipientEmail}` : ''}. Adjunta el PDF generado.`
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildExitSummaryText(movement));
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
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Reporte de Salida · {movement.folio}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(movement.created_at)}
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
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ítem o Material Entregado</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {movement.product_name}
                </p>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                  {movement.sku} · {movement.barcode}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Cantidad</p>
                <p className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                  {movement.quantity} {movement.unit}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                  Responsable que recibe
                </p>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {movement.responsible_name || 'No especificado'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {movement.responsible_area || 'Operaciones'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Valoración de Salida</p>
                <p className="font-semibold font-mono text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                  {formatCurrency(movement.total_value)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Costo unitario: {formatCurrency(movement.cost_resulting)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Detalle / Motivo de Salida</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5 leading-relaxed">
                {movement.reason_detail || 'Sin detalle registrado.'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Despachado por:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {movement.operator_name || 'Almacén Central'}
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
