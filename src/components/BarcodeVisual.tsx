import React from 'react';

interface BarcodeVisualProps {
  code: string;
  height?: number;
  showText?: boolean;
}

export const BarcodeVisual: React.FC<BarcodeVisualProps> = ({
  code,
  height = 32,
  showText = true,
}) => {
  const clean = code || '0000000000000';
  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 2;

  // Start guard
  bars.push({ x: cursor, w: 1.5 });
  cursor += 3;
  bars.push({ x: cursor, w: 1.5 });
  cursor += 3;

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    const w1 = ((charCode % 3) + 1) * 1.1;
    const gap1 = (((charCode >> 2) % 2) + 1) * 1.2;
    const w2 = (((charCode >> 3) % 2) + 1) * 1.2;
    const gap2 = (((charCode >> 4) % 3) + 1) * 1.1;

    bars.push({ x: cursor, w: w1 });
    cursor += w1 + gap1;
    bars.push({ x: cursor, w: w2 });
    cursor += w2 + gap2;
  }

  // End guard
  bars.push({ x: cursor, w: 1.5 });
  cursor += 3;
  bars.push({ x: cursor, w: 1.5 });
  cursor += 3;

  return (
    <div className="inline-flex flex-col items-center select-none">
      <div className="bg-white px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">
        <svg
          viewBox={`0 0 ${cursor} ${height}`}
          className="w-full max-w-[160px] text-slate-900"
          style={{ height }}
          aria-label={`Código de barras ${clean}`}
        >
          {bars.map((b, idx) => (
            <rect key={idx} x={b.x} y={0} width={b.w} height={height} fill="currentColor" />
          ))}
        </svg>
      </div>
      {showText && (
        <span className="mt-1 font-mono text-[11px] tracking-wider text-slate-600 dark:text-slate-400 tabular-nums">
          {clean}
        </span>
      )}
    </div>
  );
};
