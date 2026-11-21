import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Calculator } from 'lucide-react';
import type { Product } from '../types';
import { formatCurrency } from '../lib/api';

interface CostAnalysisCardProps {
  product: Product;
  quantity: number;
  costEntry: number;
  marginPercent: number;
  customNewPrice: string;
}

export const CostAnalysisCard: React.FC<CostAnalysisCardProps> = ({
  product,
  quantity,
  costEntry,
  marginPercent,
  customNewPrice,
}) => {
  const validQty = Math.max(0, quantity);
  const validCost = Math.max(0, costEntry);
  const oldStock = product.stock_current;
  const oldCost = product.cost_current;
  const newTotalStock = oldStock + validQty;

  const weightedCost =
    newTotalStock > 0
      ? oldStock > 0
        ? (oldStock * oldCost + validQty * validCost) / newTotalStock
        : validCost
      : oldCost;

  const costDiff = validCost - oldCost;
  const costDiffPct = oldCost > 0 ? (costDiff / oldCost) * 100 : 0;

  const parsedCustom = customNewPrice.trim() !== '' ? Number(customNewPrice) : NaN;
  const suggestedPrice =
    Number.isFinite(parsedCustom) && parsedCustom >= 0
      ? parsedCustom
      : weightedCost * (1 + Math.max(0, marginPercent) / 100);

  const priceDiff = suggestedPrice - product.price_current;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Calculator className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          <span>Análisis Comparativo de Costo y Nuevo Precio (Bs.)</span>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Stock: {oldStock} → {newTotalStock} {product.unit}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Costo Antiguo (Actual)</p>
          <p className="mt-1 text-lg font-semibold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {formatCurrency(oldCost)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Precio actual: {formatCurrency(product.price_current)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Costo Ingreso Nuevo</p>
          <p className="mt-1 text-lg font-semibold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {formatCurrency(validCost)}
          </p>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium tabular-nums">
            {costDiff > 0.005 ? (
              <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +{formatCurrency(costDiff)} (+{costDiffPct.toFixed(1)}% incremento)
              </span>
            ) : costDiff < -0.005 ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {formatCurrency(costDiff)} ({costDiffPct.toFixed(1)}% ahorro)
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                <Minus className="w-3.5 h-3.5" />
                Sin variación de costo
              </span>
            )}
          </div>
        </div>

        <div className="bg-blue-50/70 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800 p-3">
          <p className="text-xs font-medium text-blue-900 dark:text-blue-300">
            Nuevo Costo Promedio y Precio
          </p>
          <p className="mt-1 text-lg font-bold font-mono text-blue-800 dark:text-blue-300 tabular-nums">
            {formatCurrency(weightedCost)}{' '}
            <span className="text-xs font-sans font-normal text-blue-700 dark:text-blue-400">costo</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            Nuevo precio: {formatCurrency(suggestedPrice)}
            {Math.abs(priceDiff) > 0.005 && (
              <span className="ml-1 text-slate-600 dark:text-slate-400 font-normal">
                ({priceDiff >= 0 ? '+' : ''}{formatCurrency(priceDiff)})
              </span>
            )}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Fórmula aplicada: ({oldStock} × {formatCurrency(oldCost)} + {validQty} × {formatCurrency(validCost)}) ÷{' '}
        {newTotalStock || 1} ={' '}
        <strong className="text-slate-700 dark:text-slate-200 tabular-nums">
          {formatCurrency(weightedCost)}
        </strong>
      </p>
    </div>
  );
};
