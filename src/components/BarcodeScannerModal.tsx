import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, Keyboard, ScanLine, X, AlertCircle } from 'lucide-react';
import type { Product } from '../types';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  sampleProducts?: Product[];
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onDetected,
  sampleProducts = [],
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!open) {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      setCameraActive(false);
      setCameraError('');
      return;
    }

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Tu navegador no permite acceso a la cámara. Usa el lector USB o ingresa el código manualmente.');
        return;
      }
      try {
        setCameraError('');
        setCameraActive(true);
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const preferred =
          devices.find((d) => /back|rear|environment|trasera/i.test(d.label)) ||
          devices[devices.length - 1];

        if (!videoRef.current || cancelled) return;

        const controls = await reader.decodeFromVideoDevice(
          preferred?.deviceId,
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText().trim();
              if (text) {
                controls.stop();
                onDetected(text);
                onClose();
              }
            }
          }
        );
        controlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setCameraActive(false);
          setCameraError(
            'No se pudo iniciar la cámara (permiso denegado o sin cámara disponible). Puedes escanear con lector USB o escribir el código.'
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!cleaned) return;
    onDetected(cleaned);
    setManualCode('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de códigos de barras"
    >
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Escáner de Código de Barras
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cámara en tiempo real, lector USB o código manual
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative aspect-video w-full rounded-xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {cameraActive && !cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-3/4 h-28 border-2 border-blue-400/80 rounded-lg relative">
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-blue-500/80" />
                </div>
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/95 p-5 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                <p className="text-xs text-slate-200 max-w-xs leading-relaxed">{cameraError}</p>
              </div>
            )}
            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Camera className="w-7 h-7" />
                <span className="text-xs">Iniciando cámara...</span>
              </div>
            )}
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Keyboard className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Lectura directa (pistola USB / código manual)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ej. 7501000100014 o FER-001"
                className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Buscar
              </button>
            </div>
          </form>

          {sampleProducts.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Prueba rápida de escaneo con códigos del catálogo:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sampleProducts.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onDetected(p.barcode);
                      onClose();
                    }}
                    className="px-2.5 py-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    {p.barcode} · {p.sku}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
