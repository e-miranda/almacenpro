import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Movement, ReportSummary } from '../types';
import { MONTHS_ES, formatCurrency, formatDateTime } from './api';

function normalizeMovements(input: Movement | Movement[]): Movement[] {
  return Array.isArray(input) ? input : [input];
}

export function buildExitReportPdf(input: Movement | Movement[]): jsPDF {
  const items = normalizeMovements(input);
  const primary = items[0];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  // Top Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 215.9, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Centro de salud Pumas Andinos', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('AlmacénPro · COMPROBANTE OFICIAL DE SALIDA DE MATERIAL', 14, 18.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(`FOLIO: ${primary.folio}`, 201, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Fecha: ${formatDateTime(primary.created_at)}`, 201, 18.5, { align: 'right' });

  // Responsible & Sector Box
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 35, 187.9, 34, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('PERSONAL RESPONSABLE QUE RETIRA / RECIBE', 19, 42);
  doc.text('SECTOR / DESTINO', 112, 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(primary.responsible_name || 'No especificado', 19, 48.5);
  doc.text(primary.sector_name || primary.responsible_area || 'Operaciones', 112, 48.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('DESPACHADO POR', 19, 57.5);
  doc.text('RESUMEN DEL COMPROBANTE', 112, 57.5);

  const grandTotal = items.reduce((acc, it) => acc + (Number(it.total_value) || 0), 0);
  const totalUnits = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(primary.operator_name || 'Operador de Almacén', 19, 63.5);
  doc.text(
    `${items.length} producto(s) · ${totalUnits} uds. · Total ${formatCurrency(grandTotal)}`,
    112,
    63.5
  );

  // Item Table (multi-product)
  autoTable(doc, {
    startY: 76,
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [15, 23, 42],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    head: [['SKU', 'Descripción del Ítem o Material', 'Unidad', 'Cantidad', 'Costo Unit.', 'Valor Total']],
    body: items.map((m) => [
      m.sku,
      m.product_name,
      m.unit || 'Pza',
      String(m.quantity),
      formatCurrency(m.cost_resulting),
      formatCurrency(m.total_value),
    ]),
    foot: [
      [
        '',
        'TOTAL DE LA SALIDA',
        '',
        String(totalUnits),
        '',
        formatCurrency(grandTotal),
      ],
    ],
    columnStyles: {
      0: { cellWidth: 34 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  });

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Detail & Justification Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, afterTableY, 187.9, 30, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('DETALLE / MOTIVO DE LA SALIDA', 19, afterTableY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const splitDetail = doc.splitTextToSize(
    primary.reason_detail || 'Sin observaciones adicionales.',
    176
  );
  doc.text(splitDetail, 19, afterTableY + 14);

  // Signature Lines
  const sigY = Math.min(242, afterTableY + 52);
  doc.setDrawColor(148, 163, 184);
  doc.line(22, sigY, 92, sigY);
  doc.line(124, sigY, 194, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(primary.responsible_name || 'Responsable', 57, sigY + 5.5, { align: 'center' });
  doc.text(primary.operator_name || 'Almacén Central', 159, sigY + 5.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma de Recibido (Personal)', 57, sigY + 10, { align: 'center' });
  doc.text('Firma de Entrega (Almacén)', 159, sigY + 10, { align: 'center' });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Centro de salud Pumas Andinos · AlmacénPro · Folio ${primary.folio}`,
    107.9,
    265,
    { align: 'center' }
  );

  return doc;
}

export function downloadExitPdf(input: Movement | Movement[]): void {
  const items = normalizeMovements(input);
  const doc = buildExitReportPdf(items);
  doc.save(`Reporte_Salida_${items[0].folio}.pdf`);
}

export async function shareExitPdfMobile(
  input: Movement | Movement[]
): Promise<{ shared: boolean; message: string }> {
  const items = normalizeMovements(input);
  const primary = items[0];
  const doc = buildExitReportPdf(items);
  const blob = doc.output('blob');
  const fileName = `Reporte_Salida_${primary.folio}.pdf`;
  const file = new File([blob], fileName, { type: 'application/pdf' });

  const itemsText = items
    .map((m) => `${m.quantity} ${m.unit} de ${m.product_name}`)
    .join(', ');
  const summaryText = `Salida ${primary.folio}: ${itemsText}. Responsable: ${primary.responsible_name} (${primary.sector_name || primary.responsible_area}). Detalle: ${primary.reason_detail}`;

  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          title: `Reporte de Salida ${primary.folio}`,
          text: summaryText,
          files: [file],
        });
        return { shared: true, message: 'PDF compartido desde la plataforma móvil.' };
      }
      await navigator.share({
        title: `Reporte de Salida ${primary.folio}`,
        text: summaryText,
      });
      doc.save(fileName);
      return {
        shared: true,
        message: 'Resumen compartido y PDF descargado para adjuntar.',
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { shared: false, message: 'Compartir cancelado por el usuario.' };
      }
    }
  }

  doc.save(fileName);
  return {
    shared: false,
    message: 'PDF descargado (tu navegador de escritorio no permite compartir archivos directamente).',
  };
}

export function buildExitSummaryText(input: Movement | Movement[]): string {
  const items = normalizeMovements(input);
  const primary = items[0];
  const grandTotal = items.reduce((acc, it) => acc + (Number(it.total_value) || 0), 0);

  const lines = [
    `CENTRO DE SALUD PUMAS ANDINOS — REPORTE DE SALIDA DE ALMACÉN — ${primary.folio}`,
    `Fecha: ${formatDateTime(primary.created_at)}`,
    `Personal Responsable: ${primary.responsible_name} (Sector: ${primary.sector_name || primary.responsible_area})`,
    `Despachado por: ${primary.operator_name || 'Almacén Central'}`,
    '',
    'PRODUCTOS ENTREGADOS:',
    ...items.map(
      (m, i) =>
        `${i + 1}. ${m.product_name} (SKU: ${m.sku}) — ${m.quantity} ${m.unit} · Unit: ${formatCurrency(m.cost_resulting)} · Subtotal: ${formatCurrency(m.total_value)}`
    ),
    '',
    `Valor Total de Salida: ${formatCurrency(grandTotal)}`,
    `Detalle: ${primary.reason_detail}`,
  ];
  return lines.join('\n');
}

export function exportExitByEmail(input: Movement | Movement[], recipientEmail = ''): void {
  const items = normalizeMovements(input);
  const primary = items[0];
  downloadExitPdf(items);
  const subject = encodeURIComponent(
    items.length > 1
      ? `Reporte de Salida ${primary.folio} — ${items.length} productos`
      : `Reporte de Salida ${primary.folio} — ${primary.product_name}`
  );
  const body = encodeURIComponent(
    `${buildExitSummaryText(items)}\n\nNota: Se descargó el archivo Reporte_Salida_${primary.folio}.pdf para adjuntarlo a este correo.`
  );
  const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${subject}&body=${body}`;
  const link = document.createElement('a');
  link.href = mailto;
  link.click();
}

export function downloadPeriodReportPdf(summary: ReportSummary): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const monthLabel = MONTHS_ES.find((m) => m.value === summary.month)?.label || summary.month;
  const periodTitle =
    summary.mode === 'annual' ? `Reporte Anual ${summary.year}` : `Reporte Mensual — ${monthLabel} ${summary.year}`;

  const selectedUserName = summary.user_id
    ? summary.filterUsers.find((u) => u.id === summary.user_id)?.name
    : null;
  const selectedCatName = summary.category_id
    ? summary.filterCategories.find((c) => c.id === summary.category_id)?.name
    : null;
  const filterSubtitle = [
    selectedUserName ? `Usuario: ${selectedUserName}` : null,
    selectedCatName ? `Categoría: ${selectedCatName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 215.9, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Centro de salud Pumas Andinos', 14, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    filterSubtitle ? `Reporte Principal · ${periodTitle} (${filterSubtitle})` : `Reporte Principal · ${periodTitle}`,
    14,
    19
  );
  doc.setFontSize(8.5);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-BO')}`, 201, 15, { align: 'right' });

  // KPI summary row
  autoTable(doc, {
    startY: 32,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 9, fontStyle: 'bold' },
    head: [['Movimientos', 'Ingresos (Unidades)', 'Valor Ingresos', 'Salidas (Unidades)', 'Valor Salidas']],
    body: [
      [
        String(summary.totals.total_movements),
        `${summary.totals.ingreso_units} (${summary.totals.ingreso_count} mov.)`,
        formatCurrency(summary.totals.ingreso_value),
        `${summary.totals.salida_units} (${summary.totals.salida_count} mov.)`,
        formatCurrency(summary.totals.salida_value),
      ],
    ],
  });

  // Category Report Table
  const yCat = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Resumen por Categoría', 14, yCat);

  autoTable(doc, {
    startY: yCat + 2.5,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [['Categoría', 'Prod.', 'Stock', 'Valor Inv. (Bs.)', 'Entradas', 'Salidas', 'Mov. (Bs.)']],
    body: summary.categoryReport.map((c) => [
      c.name,
      String(c.product_count),
      String(c.stock_units),
      formatCurrency(c.inventory_cost_value),
      `+${c.ingreso_units}`,
      `-${c.salida_units}`,
      formatCurrency(c.ingreso_value + c.salida_value),
    ]),
  });

  // User Report Table
  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Actividad por Usuario', 14, y1);

  autoTable(doc, {
    startY: y1 + 2.5,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [['Usuario', 'Rol', 'Mov.', 'Ingresos', 'Salidas', 'Unidades', 'Valor Operado', 'Pedidos']],
    body: summary.userReport.map((u) => [
      u.name,
      u.role_name,
      String(u.movement_count),
      String(u.ingreso_count),
      String(u.salida_count),
      String(u.total_units),
      formatCurrency(u.total_value),
      String(u.orders_requested),
    ]),
  });

  // Stock & Products Table (with Category)
  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Niveles de Stock Actualizados y Costos por Categoría', 14, y2);

  autoTable(doc, {
    startY: y2 + 2.5,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    head: [['SKU', 'Producto', 'Categoría', 'Stock', 'Mín.', 'Costo Prom.', 'Precio']],
    body: summary.topProducts.slice(0, 20).map((p) => [
      p.sku,
      p.name,
      p.category,
      `${p.stock_current} ${p.unit}`,
      String(p.stock_min),
      formatCurrency(p.cost_current),
      formatCurrency(p.price_current),
    ]),
  });

  // Movement details when available
  if (summary.movementDetails.length > 0) {
    const y3 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Detalle de Movimientos del Período', 14, y3);

    autoTable(doc, {
      startY: y3 + 2.5,
      margin: { left: 14, right: 14 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5 },
      head: [['Folio', 'Tipo', 'Producto', 'Categoría', 'Cant.', 'Operador / Resp.', 'Total (Bs.)']],
      body: summary.movementDetails.slice(0, 35).map((m) => [
        m.folio,
        m.type,
        m.product_name,
        m.category || '—',
        `${m.quantity} ${m.unit}`,
        `${m.operator_name || 'Sistema'} / ${m.responsible_name}`,
        formatCurrency(m.total_value),
      ]),
    });
  }

  doc.save(
    `Centro_Salud_Pumas_Andinos_${summary.mode === 'annual' ? `Anual_${summary.year}` : `Mensual_${summary.year}-${summary.month}`}.pdf`
  );
}

function getReportHeaderSubtitle(summary: ReportSummary, titlePrefix: string): string {
  const monthLabel = MONTHS_ES.find((m) => m.value === summary.month)?.label || summary.month;
  const periodTitle =
    summary.mode === 'annual' ? `Año ${summary.year}` : `${monthLabel} ${summary.year}`;
  const selectedUserName = summary.user_id
    ? summary.filterUsers.find((u) => u.id === summary.user_id)?.name
    : null;
  const selectedCatName = summary.category_id
    ? summary.filterCategories.find((c) => c.id === summary.category_id)?.name
    : null;
  const filterSubtitle = [
    selectedUserName ? `Usuario: ${selectedUserName}` : null,
    selectedCatName ? `Categoría: ${selectedCatName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return filterSubtitle
    ? `${titlePrefix} · ${periodTitle} (${filterSubtitle})`
    : `${titlePrefix} · ${periodTitle}`;
}

export function downloadIncomeReportPdf(summary: ReportSummary): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const items =
    summary.ingresoDetails ?? summary.movementDetails.filter((m) => m.type === 'INGRESO');

  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, 215.9, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Centro de salud Pumas Andinos', 14, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(getReportHeaderSubtitle(summary, 'Reporte de Ingresos de Almacén'), 14, 19);
  doc.setFontSize(8.5);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-BO')}`, 201, 15, { align: 'right' });

  autoTable(doc, {
    startY: 33,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 9, fontStyle: 'bold' },
    head: [['Registros de Ingreso', 'Unidades Ingresadas', 'Valor Total Ingresado', 'Promedio por Ingreso']],
    body: [
      [
        String(summary.totals.ingreso_count),
        `${summary.totals.ingreso_units} uds.`,
        formatCurrency(summary.totals.ingreso_value),
        formatCurrency(
          summary.totals.ingreso_count > 0
            ? summary.totals.ingreso_value / summary.totals.ingreso_count
            : 0
        ),
      ],
    ],
  });

  const yTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Detalle de Ingresos (${items.length})`, 14, yTable);

  autoTable(doc, {
    startY: yTable + 2.5,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    head: [['Folio', 'Fecha', 'SKU', 'Producto', 'Cant.', 'Costo Unit.', 'Operador / Detalle', 'Total (Bs.)']],
    body:
      items.length === 0
        ? [['—', '—', '—', 'Sin ingresos registrados en este período', '0', 'Bs 0.00', '—', 'Bs 0.00']]
        : items.map((m) => [
            m.folio,
            formatDateTime(m.created_at),
            m.sku,
            m.product_name,
            `${m.quantity} ${m.unit}`,
            formatCurrency(m.cost_resulting),
            `${m.operator_name || 'Sistema'} · ${m.reason_detail || 'Ingreso'}`,
            formatCurrency(m.total_value),
          ]),
  });

  doc.save(
    `Pumas_Andinos_Ingresos_${summary.mode === 'annual' ? summary.year : `${summary.year}-${summary.month}`}.pdf`
  );
}

export function downloadExpensesReportPdf(summary: ReportSummary): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const items =
    summary.egresoDetails ?? summary.movementDetails.filter((m) => m.type === 'SALIDA');

  doc.setFillColor(120, 53, 15);
  doc.rect(0, 0, 215.9, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Centro de salud Pumas Andinos', 14, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(getReportHeaderSubtitle(summary, 'Reporte de Egresos (Salidas) de Almacén'), 14, 19);
  doc.setFontSize(8.5);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-BO')}`, 201, 15, { align: 'right' });

  autoTable(doc, {
    startY: 33,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [146, 64, 14], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 9, fontStyle: 'bold' },
    head: [['Registros de Egreso', 'Unidades Despachadas', 'Valor Total Egresado', 'Promedio por Salida']],
    body: [
      [
        String(summary.totals.salida_count),
        `${summary.totals.salida_units} uds.`,
        formatCurrency(summary.totals.salida_value),
        formatCurrency(
          summary.totals.salida_count > 0
            ? summary.totals.salida_value / summary.totals.salida_count
            : 0
        ),
      ],
    ],
  });

  const yTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Detalle de Egresos / Salidas (${items.length})`, 14, yTable);

  autoTable(doc, {
    startY: yTable + 2.5,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    head: [['Folio', 'Fecha', 'SKU', 'Producto', 'Cant.', 'Responsable / Sector', 'Motivo', 'Total (Bs.)']],
    body:
      items.length === 0
        ? [['—', '—', '—', 'Sin egresos registrados en este período', '0', '—', '—', 'Bs 0.00']]
        : items.map((m) => [
            m.folio,
            formatDateTime(m.created_at),
            m.sku,
            m.product_name,
            `${m.quantity} ${m.unit}`,
            `${m.responsible_name || 'No especificado'} (${m.sector_name || m.responsible_area})`,
            m.reason_detail || 'Salida',
            formatCurrency(m.total_value),
          ]),
  });

  doc.save(
    `Pumas_Andinos_Egresos_${summary.mode === 'annual' ? summary.year : `${summary.year}-${summary.month}`}.pdf`
  );
}

