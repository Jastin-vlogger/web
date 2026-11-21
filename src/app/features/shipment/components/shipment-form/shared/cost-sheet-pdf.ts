import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CostSheetSnapshot } from '../../../../../core/models/payment-cost-sheet.model';
import { buildSheetGrid, borderCss } from './cost-sheet-grid.util';
import { formatPageNumberLabel } from './advance-request-report';

export interface CostSheetPdfOptions {
  fileStem: string;
  /** Shown in the footer, e.g. "Imported by Rayees on 21/11/2026 14:05". */
  importedLine: string;
  downloadedBy: string;
}

const hexToRgb = (hex: string | null): [number, number, number] | undefined => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
};

const lineWidthOf = (css: string | undefined): number => (css?.startsWith('3px') ? 1.2 : css?.startsWith('2px') ? 0.8 : css ? 0.4 : 0);

/** Builds a landscape A4 PDF of the imported cost sheet, keeping merges, widths, fonts and fills. */
export function buildCostSheetPdf(snapshot: CostSheetSnapshot, options: CostSheetPdfOptions): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;
  const contentWidth = pageWidth - margin * 2;

  snapshot.sheets.forEach((sheet, index) => {
    if (index > 0) doc.addPage();
    const grid = buildSheetGrid(sheet);
    const totalPx = grid.colWidths.reduce((sum, w) => sum + w, 0) || 1;
    const scale = contentWidth / totalPx;
    const visibleCols = grid.colWidths.map((w, i) => ({ w, i })).filter((c) => c.w > 0);

    const body = grid.rows.map((row) => {
      const hasContent = row.cells.some((cell) => cell.text || cell.background);
      if (!hasContent) {
        return [{ content: '', colSpan: Math.max(visibleCols.length, 1), styles: { minCellHeight: 5, cellPadding: 0, lineWidth: 0 } }];
      }
      return row.cells.map((cell) => {
        const top = lineWidthOf(borderCss(cell.borders.t) ?? undefined);
        const bottom = lineWidthOf(borderCss(cell.borders.b) ?? undefined);
        const left = lineWidthOf(borderCss(cell.borders.l) ?? undefined);
        const right = lineWidthOf(borderCss(cell.borders.r) ?? undefined);
        return {
          content: cell.text,
          colSpan: cell.colspan,
          rowSpan: cell.rowspan,
          styles: {
            fontStyle: cell.bold && cell.italic ? 'bolditalic' : cell.bold ? 'bold' : cell.italic ? 'italic' : 'normal',
            halign: cell.align,
            valign: cell.valign,
            fontSize: cell.fontPx ? Math.max(5, Math.min(11, cell.fontPx * 0.62)) : 6.2,
            textColor: hexToRgb(cell.color) ?? [0, 0, 0],
            fillColor: hexToRgb(cell.background) ?? false,
            lineWidth: { top, right, bottom, left },
            lineColor: [60, 60, 60],
            overflow: cell.numeric ? 'visible' : 'linebreak',
          },
        };
      });
    });

    const columnStyles: Record<number, { cellWidth: number }> = {};
    visibleCols.forEach((col, pos) => { columnStyles[pos] = { cellWidth: col.w * scale }; });

    autoTable(doc, {
      startY: margin,
      body: body as any,
      theme: 'plain',
      showHead: 'never',
      styles: { fontSize: 6.5, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, lineWidth: 0 },
      columnStyles,
      margin: { top: margin, left: margin, right: margin, bottom: 28 },
    });
  });

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(130);
    doc.text(`${options.importedLine} | Downloaded by: ${options.downloadedBy || 'Unknown user'}`, margin, pageHeight - 10);
    doc.text(formatPageNumberLabel(page, total), pageWidth - margin, pageHeight - 10, { align: 'right' });
  }
  doc.setTextColor(0);
  return doc;
}

export function downloadCostSheetPdf(snapshot: CostSheetSnapshot, options: CostSheetPdfOptions): void {
  buildCostSheetPdf(snapshot, options).save(`${options.fileStem.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
}
