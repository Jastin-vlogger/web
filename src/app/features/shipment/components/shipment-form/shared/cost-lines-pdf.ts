import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PaymentCostLine, PaymentCostTotals } from '../../../../../core/models/payment-cost-sheet.model';
import { formatAmount } from './cost-lines.util';
import { formatPageNumberLabel } from './advance-request-report';

export interface CostLinesPdfOptions {
  fileStem: string;
  /** e.g. the shipment number and BL no, shown under the title on every page. */
  subtitle: string;
  downloadedBy: string;
}

const COLUMNS = ['SN', 'Description', 'Cost DH', 'Bill Ref. (No / Date)', 'Bill Ref. (Party)', 'Payment Reference', 'Remarks', 'Borne By RHGT', 'Borne by Silal'];

/** Landscape A4 PDF of the saved lines + TOTAL, any number of lines; title on every page, "Page x of N" footer. */
export function buildCostLinesPdf(lines: readonly PaymentCostLine[], totals: PaymentCostTotals, options: CostLinesPdfOptions): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  const body = lines.map((l) => [
    String(l.sn), l.description, formatAmount(l.costDh), l.billRefNo, l.billRefParty, l.paymentReference, l.remarks,
    formatAmount(l.borneByRhgt), formatAmount(l.borneBySilal),
  ]);
  const foot = [['', 'TOTAL', formatAmount(totals.costDh), '', '', '', '', formatAmount(totals.borneByRhgt), formatAmount(totals.borneBySilal)]];

  autoTable(doc, {
    head: [COLUMNS],
    body,
    foot,
    showHead: 'everyPage',
    showFoot: 'lastPage',
    theme: 'grid',
    startY: 70,
    margin: { top: 70, left: margin, right: margin, bottom: 30 },
    styles: { fontSize: 7, cellPadding: 3, lineColor: [150, 150, 150], lineWidth: 0.3, overflow: 'linebreak' },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      2: { halign: 'right', cellWidth: 60 },
      7: { halign: 'right', cellWidth: 62 },
      8: { halign: 'right', cellWidth: 62 },
    },
    didDrawPage: () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('ROYAL HORIZON GENERAL TRADING', margin, 34);
      doc.setFontSize(9);
      doc.text('Payment Costing', margin, 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(options.subtitle, margin, 60);
    },
  });

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(130);
    doc.text(`Downloaded by: ${options.downloadedBy || 'Unknown user'}`, margin, pageHeight - 12);
    doc.text(formatPageNumberLabel(page, total), pageWidth - margin, pageHeight - 12, { align: 'right' });
  }
  doc.setTextColor(0);
  return doc;
}

export function downloadCostLinesPdf(lines: readonly PaymentCostLine[], totals: PaymentCostTotals, options: CostLinesPdfOptions): void {
  buildCostLinesPdf(lines, totals, options).save(`${options.fileStem.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
}
