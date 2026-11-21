import { describe, expect, it, vi } from 'vitest';

// Wrap jsPDF so every text() call is recorded together with the page it was drawn on.
const textLog = vi.hoisted(() => [] as Array<{ page: number; text: string }>);
vi.mock('jspdf', async () => {
  const actual: any = await vi.importActual('jspdf');
  const Base = actual.default ?? actual.jsPDF;
  class LoggingPdf extends Base {
    constructor(...args: any[]) {
      super(...args);
      const original = this.text.bind(this);
      this.text = (text: any, ...rest: any[]) => {
        const page = this.internal.getCurrentPageInfo().pageNumber;
        textLog.push({ page, text: Array.isArray(text) ? text.join(' ') : String(text) });
        return original(text, ...rest);
      };
    }
  }
  return { ...actual, default: LoggingPdf, jsPDF: LoggingPdf };
});

import {
  ADVANCE_REQUEST_REPORT_COLUMNS,
  AdvanceRequestReportConfig,
  buildAdvanceRequestReportDoc,
  formatPageNumberLabel,
} from './advance-request-report';

const makeConfig = (lineCount: number): AdvanceRequestReportConfig => ({
  fileStem: 'RHST-0001-payment-allocation-report',
  sourceLabel: 'Payment Allocation',
  reportDate: '21/11/2026',
  boeDate: '13/07/2026',
  vendor: 'MNG OVERSEAS PRIVATE LIMITED',
  country: 'India',
  shipmentNo: 'RHST-0022/PO01-1577-3',
  shippingLine: 'BAY LINES',
  invoiceAmountFC: '0.00',
  blNo: 'BAXISM031149',
  exchangeRate: '3.67',
  noOfContainers: '5',
  invoiceAmountAED: '0.00',
  loadingPort: 'MUNDRA',
  despatchPort: 'AL FUJAIRAH',
  incoTerms: 'FOB',
  supplierInvoiceNo: 'MNGE/26-27/021',
  eta: '',
  item: '1-RH1-01B-0025 - Rice - Basmati Steam 1401 - Al Mustshar - 1x40kg',
  planningToReleaseDate: '',
  noOfDaysAtPort: '',
  storage: 'AL AIN',
  downloadedBy: 'Admin User',
  preparedBy: 'Logistics',
  lines: Array.from({ length: lineCount }, (_, i) => ({
    sn: i + 1,
    description: `Cost line number ${i + 1}`,
    qty: 1,
    rate: 10,
    amount: 100 + i,
    actualPaid: 100 + i,
    difference: 0,
    paymentTo: 'Shipping line',
    paymentTerm: 'CHQ',
    paymentReference: `PO01/26/027 REF-${i + 1}`,
    remarks: '',
  })),
});

function renderWithTextLog(config: AdvanceRequestReportConfig) {
  textLog.length = 0;
  const doc = buildAdvanceRequestReportDoc(config);
  return { doc, log: [...textLog] };
}

describe('advance request report (printed / downloaded PDF)', () => {
  it('has a separate Payment Reference column next to Payment Term', () => {
    const cols = [...ADVANCE_REQUEST_REPORT_COLUMNS];
    expect(cols).toContain('Payment Reference');
    expect(cols.indexOf('Payment Reference')).toBe(cols.indexOf('Payment Term') + 1);
    expect(cols).toContain('Remarks');
  });

  it('formats page numbers as "Page X of N"', () => {
    expect(formatPageNumberLabel(2, 5)).toBe('Page 2 of 5');
  });

  it('repeats the header on every page and numbers every page', () => {
    const { doc, log } = renderWithTextLog(makeConfig(60));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);

    for (let page = 1; page <= pages; page += 1) {
      const texts = log.filter((l) => l.page === page).map((l) => l.text);
      expect(texts, `page ${page} title`).toContain('ROYAL HORIZON GENERAL TRADING LLC');
      expect(texts, `page ${page} report name`).toContain('IMPORT SHIPPING CLEARING ADVANCE & REIMBURSEMENT');
      expect(texts.some((t) => t.includes('RHST-0022/PO01-1577-3')), `page ${page} shipment no`).toBe(true);
      expect(texts, `page ${page} number`).toContain(formatPageNumberLabel(page, pages));
    }
  });

  it('a short report is a single page and says Page 1 of 1', () => {
    const { doc, log } = renderWithTextLog(makeConfig(3));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(log.map((l) => l.text)).toContain('Page 1 of 1');
  });

  it('can be dumped for visual inspection when DUMP_PDF is set', () => {
    const target = (globalThis as any).process?.env?.DUMP_PDF;
    if (!target) return;
    const { doc } = renderWithTextLog(makeConfig(60));
    const bytes = doc.output('arraybuffer');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (globalThis as any).process.getBuiltinModule('fs').writeFileSync(target, Buffer.from(bytes));
  });
});
