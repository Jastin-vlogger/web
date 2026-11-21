import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface AdvanceRequestReportLineItem {
  sn: number | string;
  description: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  actualPaid?: number | string;
  difference?: number | string;
  paymentTo?: string;
  paymentTerm?: string;
  paymentReference?: string;
  remarks?: string;
}

export interface AdvanceRequestReportAdditionalItem {
  sn: number | string;
  title: string;
  comment?: string;
  amount: number | string;
  status: string;
  requestedAt?: string;
  approvedAt?: string;
}

export interface AdvanceRequestReportConfig {
  fileStem: string;
  sourceLabel: string;
  reportDate: string;
  boeDate: string;
  vendor: string;
  country: string;
  shipmentNo: string;
  shippingLine: string;
  invoiceAmountFC: string;
  blNo: string;
  exchangeRate: string;
  noOfContainers: string;
  invoiceAmountAED: string;
  loadingPort: string;
  despatchPort: string;
  incoTerms: string;
  supplierInvoiceNo: string;
  eta: string;
  item: string;
  planningToReleaseDate: string;
  noOfDaysAtPort: string;
  storage: string;
  downloadedBy: string;
  preparedBy?: string;
  approvedBy?: string;
  lines: AdvanceRequestReportLineItem[];
  additionalRequests?: AdvanceRequestReportAdditionalItem[];
}

function formatNumber(value: unknown, fallback = ''): string {
  if (value === '' || value == null) return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return String(value);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized);
}

function safe(value: unknown, fallback = '—'): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

/** Column set of the main cost table (exported so the layout can be unit-tested). */
export const ADVANCE_REQUEST_REPORT_COLUMNS = [
  'S. No.',
  'Description',
  'Qty',
  'Rate',
  'Amount',
  'Actual Paid',
  'Different',
  'Payment To',
  'Payment Term',
  'Payment Reference',
  'Remarks',
] as const;

export function formatPageNumberLabel(page: number, total: number): string {
  return `Page ${page} of ${total}`;
}

const PAGE_MARGIN = 28;
const TITLE_BLOCK_HEIGHT = 44;
const INFO_FONT = 7;
const INFO_LINE_HEIGHT = 8.4;
const INFO_PAD_Y = 2;
const INFO_PAD_X = 4;

function buildInfoRows(config: AdvanceRequestReportConfig): string[][] {
  return [
    ['BOE Date', safe(config.boeDate), 'Vendor / Supplier', safe(config.vendor), 'Country', safe(config.country)],
    ['Shipment No.', safe(config.shipmentNo), 'Shipping Line', safe(config.shippingLine), 'BL No.', safe(config.blNo)],
    ['Invoice Amount FC', safe(config.invoiceAmountFC), 'Exchange Rate', safe(config.exchangeRate), 'No of Containers', safe(config.noOfContainers)],
    ['Invoice Amount AED', safe(config.invoiceAmountAED), 'Loading Port', safe(config.loadingPort), 'Despatch Port', safe(config.despatchPort)],
    ['Inco Terms', safe(config.incoTerms), 'Supplier Invoice No.', safe(config.supplierInvoiceNo), 'ETA', safe(config.eta)],
    ['Item', safe(config.item), 'Planning to Release Dt', safe(config.planningToReleaseDate), 'No of Days at Port', safe(config.noOfDaysAtPort)],
    ['Storage (WH)', safe(config.storage), '', '', '', ''],
  ];
}

interface HeaderLayout {
  rows: string[][];
  colWidths: number[];
  rowHeights: number[];
  /** y where page content (tables) may start, below the repeating header. */
  contentTop: number;
}

/** Measures the repeating page header (title block + shipment info grid) once. */
function measureHeader(doc: jsPDF, config: AdvanceRequestReportConfig, contentWidth: number): HeaderLayout {
  const rows = buildInfoRows(config);
  const fractions = [0.12, 0.22, 0.12, 0.22, 0.12, 0.20];
  const colWidths = fractions.map((f) => contentWidth * f);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(INFO_FONT);
  const rowHeights = rows.map((row) => {
    const lines = row.map((cell, i) => doc.splitTextToSize(cell || ' ', colWidths[i] - INFO_PAD_X * 2).length);
    return Math.max(...lines, 1) * INFO_LINE_HEIGHT + INFO_PAD_Y * 2;
  });
  const gridHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  return { rows, colWidths, rowHeights, contentTop: TITLE_BLOCK_HEIGHT + gridHeight + 10 };
}

/** Draws the company/report title block and the shipment info grid on the CURRENT page. */
function drawPageHeader(doc: jsPDF, config: AdvanceRequestReportConfig, layout: HeaderLayout): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ROYAL HORIZON GENERAL TRADING LLC', PAGE_MARGIN, 24);
  doc.setFontSize(8);
  doc.text('IMPORT SHIPPING CLEARING ADVANCE & REIMBURSEMENT', PAGE_MARGIN, 35);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(`Source: ${safe(config.sourceLabel)}`, pageWidth - PAGE_MARGIN, 24, { align: 'right' });
  doc.text(`Generated: ${safe(config.reportDate)}`, pageWidth - PAGE_MARGIN, 35, { align: 'right' });
  doc.setTextColor(0);

  let y = TITLE_BLOCK_HEIGHT;
  doc.setLineWidth(0.2);
  doc.setDrawColor(160);
  layout.rows.forEach((row, r) => {
    let x = PAGE_MARGIN;
    const h = layout.rowHeights[r];
    row.forEach((cell, c) => {
      const w = layout.colWidths[c];
      const isLabel = c % 2 === 0;
      if (isLabel) {
        doc.setFillColor(247, 248, 250);
        doc.rect(x, y, w, h, 'FD');
      } else {
        doc.rect(x, y, w, h, 'S');
      }
      doc.setFont('helvetica', isLabel ? 'bold' : 'normal');
      doc.setFontSize(INFO_FONT);
      doc.text(doc.splitTextToSize(cell, w - INFO_PAD_X * 2), x + INFO_PAD_X, y + INFO_PAD_Y + INFO_FONT, { baseline: 'alphabetic' });
      x += w;
    });
    y += h;
  });
  doc.setDrawColor(0);
}

const tableTheme = {
  theme: 'grid' as const,
  styles: {
    fontSize: 6.8,
    cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    lineWidth: 0.2,
    lineColor: [160, 160, 160] as [number, number, number],
  },
  headStyles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: 0,
    fontStyle: 'bold' as const,
    fontSize: 6.8,
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.3,
  },
  tableLineWidth: 0.4,
  tableLineColor: [0, 0, 0] as [number, number, number],
};

/**
 * Builds the report. Every page carries the full header (title block + shipment info grid) and the
 * column headings, and a "Page X of N" footer, so any single printed/downloaded page is self-explanatory.
 */
export function buildAdvanceRequestReportDoc(config: AdvanceRequestReportConfig): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PAGE_MARGIN;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 24;

  const header = measureHeader(doc, config, contentWidth);
  const pageMargin = { top: header.contentTop, left: margin, right: margin, bottom: footerReserve };
  const didDrawPage = () => drawPageHeader(doc, config, header);

  const tableRows = config.lines.map((line) => [
    String(line.sn),
    safe(line.description),
    formatNumber(line.qty, ''),
    formatNumber(line.rate, ''),
    formatNumber(line.amount, ''),
    formatNumber(line.actualPaid, ''),
    formatNumber(line.difference, ''),
    safe(line.paymentTo, ''),
    safe(line.paymentTerm, ''),
    safe(line.paymentReference, ''),
    safe(line.remarks, ''),
  ]);

  const totals = config.lines.reduce(
    (acc, line) => ({
      amount: acc.amount + (Number(line.amount) || 0),
      actualPaid: acc.actualPaid + (Number(line.actualPaid) || 0),
      difference: acc.difference + (Number(line.difference) || 0),
    }),
    { amount: 0, actualPaid: 0, difference: 0 }
  );

  tableRows.push([
    '',
    'TOTAL',
    '',
    '',
    formatNumber(totals.amount),
    formatNumber(totals.actualPaid),
    formatNumber(totals.difference),
    '',
    '',
    '',
    '',
  ]);

  autoTable(doc, {
    ...tableTheme,
    startY: header.contentTop,
    head: [[...ADVANCE_REQUEST_REPORT_COLUMNS]],
    showHead: 'everyPage',
    body: tableRows,
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 170 },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 44, halign: 'right' },
      4: { cellWidth: 62, halign: 'right' },
      5: { cellWidth: 62, halign: 'right' },
      6: { cellWidth: 62, halign: 'right' },
      7: { cellWidth: 68 },
      8: { cellWidth: 62 },
      9: { cellWidth: 100 },
      10: { cellWidth: 'auto' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [244, 244, 244];
      }
    },
    didDrawPage,
    margin: pageMargin,
  });

  const startNewPage = (): number => {
    doc.addPage();
    drawPageHeader(doc, config, header);
    return header.contentTop;
  };

  let y = (doc as any).lastAutoTable.finalY + 14;

  if (config.additionalRequests?.length) {
    if (y > pageHeight - 120) {
      y = startNewPage();
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text('ADDITIONAL REQUESTS', margin, y);
    y += 6;

    const additionalRows = config.additionalRequests.map((item) => [
      String(item.sn),
      safe(item.title),
      safe(item.comment, ''),
      formatNumber(item.amount, ''),
      safe(item.status),
      safe(item.requestedAt, ''),
      safe(item.approvedAt, ''),
    ]);
    const additionalTotal = config.additionalRequests.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    additionalRows.push(['', 'TOTAL', '', formatNumber(additionalTotal), '', '', '']);

    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['S. No.', 'Title', 'Comment', 'Amount', 'Status', 'Requested', 'Approved']],
      showHead: 'everyPage',
      body: additionalRows,
      columnStyles: {
        0: { cellWidth: 34, halign: 'center' },
        1: { cellWidth: 150 },
        2: { cellWidth: 200 },
        3: { cellWidth: 72, halign: 'right' },
        4: { cellWidth: 90 },
        5: { cellWidth: 80 },
        6: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === additionalRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [244, 244, 244];
        }
      },
      didDrawPage,
      margin: pageMargin,
    });

    y = (doc as any).lastAutoTable.finalY + 14;
  }

  if (y > pageHeight - 90) {
    y = startNewPage();
  }

  const summaryBody = [
    ['Paid by A/c.', '', 'Paid by', '', 'Other', ''],
    ['To be paid to Transporter', '', 'To be paid to Offloader', '', 'Notes', ''],
  ];

  autoTable(doc, {
    startY: y,
    body: summaryBody,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: { top: 8, bottom: 8, left: 4, right: 4 },
      lineWidth: 0.2,
      lineColor: [160, 160, 160],
      minCellHeight: 26,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: 92 },
      1: { cellWidth: 150 },
      2: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: 68 },
      3: { cellWidth: 150 },
      4: { fontStyle: 'bold', fillColor: [247, 248, 250], cellWidth: 52 },
      5: { cellWidth: 'auto' },
    },
    didDrawPage,
    margin: pageMargin,
    tableLineWidth: 0.4,
    tableLineColor: [0, 0, 0],
  });

  y = (doc as any).lastAutoTable.finalY + 24;
  if (y > pageHeight - 60) {
    y = startNewPage() + 10;
  }
  const signatureLabels = ['PREPARED BY', 'VERIFIED BY', 'A/C APPROVAL'];
  const signatureWidth = contentWidth / signatureLabels.length;
  signatureLabels.forEach((label, index) => {
    const x = margin + index * signatureWidth;
    const value = index === 0 ? config.preparedBy : index === 1 ? config.approvedBy : '';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(label, x + 6, y);
    if (value) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(safe(value), x + 6, y + 17, { maxWidth: signatureWidth - 16 });
    }
    doc.setDrawColor(120);
    doc.setLineWidth(0.4);
    doc.line(x + 6, y + 24, x + signatureWidth - 10, y + 24);
  });

  // Footer on every page: who generated it, and "Page X of N".
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(130);
    doc.text(
      `Generated by Royal Shipment Tracker | Downloaded by: ${safe(config.downloadedBy, 'Unknown user')}`,
      margin,
      pageHeight - 10
    );
    doc.text(formatPageNumberLabel(page, totalPages), pageWidth - margin, pageHeight - 10, { align: 'right' });
  }
  doc.setTextColor(0);
  return doc;
}

function reportFileName(config: AdvanceRequestReportConfig): string {
  return `${config.fileStem.replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
}

export function downloadAdvanceRequestReportPdf(config: AdvanceRequestReportConfig): void {
  buildAdvanceRequestReportDoc(config).save(reportFileName(config));
}

/** Opens the same PDF in a new tab and starts the browser print dialog. */
export function printAdvanceRequestReportPdf(config: AdvanceRequestReportConfig): void {
  const doc = buildAdvanceRequestReportDoc(config);
  doc.autoPrint();
  const url = doc.output('bloburl') as unknown as string;
  window.open(url, '_blank');
}
