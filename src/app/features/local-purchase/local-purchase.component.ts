import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
// xlsx-js-style writes cell fills/fonts that the plain "xlsx" package drops.
import * as XLSX from 'xlsx-js-style';
import { LocalPurchaseService } from './services/local-purchase.service';
import { LocalPurchase, LocalPurchaseQualityRow, LocalPurchaseStorageSplit } from './models/local-purchase.model';

@Component({
  selector: 'app-local-purchase-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './local-purchase.component.html',
})
export class LocalPurchaseListComponent implements OnInit {
  items = signal<LocalPurchase[]>([]);
  loading = signal(true);
  currentPage = signal(1);
  pageSize = signal(20);
  totalRecords = signal(0);
  totalPages = signal(0);
  searchQuery = signal('');
  exporting = signal(false);

  private readonly searchInput$ = new Subject<string>();

  constructor(private localPurchaseService: LocalPurchaseService, private router: Router) {}

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
      this.searchQuery.set(value.trim());
      this.currentPage.set(1);
      this.fetch();
    });
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.localPurchaseService.getList(this.currentPage(), this.pageSize(), this.searchQuery()).subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.totalRecords.set(response.totalRecords);
        this.totalPages.set(response.totalPages);
        this.currentPage.set(response.page);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching local purchases:', err);
        this.loading.set(false);
      },
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement)?.value ?? '';
    this.searchInput$.next(value);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.fetch();
  }

  track(item: LocalPurchase): void {
    this.router.navigate(['/local-purchase/track', item._id]);
  }

  supplierName(item: LocalPurchase): string {
    if (typeof item.supplierId === 'object' && item.supplierId?.name) return item.supplierId.name;
    return item.supplierName || '—';
  }

  /** FCL: stored value, else derived from qty (20ft container = 25 MT) for older records. */
  fclDisplay(item: LocalPurchase): number {
    if (Number(item.fcl) > 0) return Number(item.fcl);
    const qty = Number(item.plannedQtyMT) || 0;
    return qty > 0 ? Math.ceil(qty / 25) : 0;
  }

  // ── Excel export ────────────────────────────────────────────────────────────
  private fmtDate(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
  }

  private firstNonEmpty<T>(list: T[] | undefined, pick: (row: T) => unknown): string {
    for (const row of list || []) {
      const v = pick(row);
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  /** One row per local purchase; nested storage/quality collapsed to a first-non-empty summary. */
  private buildExportColumns(): Array<{ header: string; value: (r: LocalPurchase) => string | number }> {
    const itemDesc = (r: LocalPurchase) =>
      r.itemDescription || (typeof r.itemId === 'object' && r.itemId?.description) || '';
    const splits = (r: LocalPurchase): LocalPurchaseStorageSplit[] => r.storageSplits || [];
    const quality = (r: LocalPurchase): LocalPurchaseQualityRow[] => r.qualityRows || [];

    return [
      { header: 'LPO Number', value: (r) => r.lpoNumber || r.lpNumber || '' },
      { header: 'LP No. (internal)', value: (r) => r.lpNumber || '' },
      { header: 'Year', value: (r) => r.year ?? '' },
      { header: 'Order Date', value: (r) => this.fmtDate(r.orderDate) },
      { header: 'Stage', value: (r) => r.currentStage || '' },
      { header: 'Supplier', value: (r) => this.supplierName(r) === '—' ? '' : this.supplierName(r) },
      { header: 'Supplier Email', value: (r) => r.supplierEmail || '' },
      { header: 'Item Code', value: (r) => r.itemCode || '' },
      { header: 'Item Description', value: (r) => itemDesc(r) },
      { header: 'Commodity', value: (r) => r.commodity || '' },
      { header: 'Country of Origin', value: (r) => r.countryOfOrigin || '' },
      { header: 'Brand', value: (r) => r.brandName || '' },
      { header: 'Barcode', value: (r) => r.barcode || '' },
      { header: 'Variant', value: (r) => r.variant || '' },
      { header: 'HS Code', value: (r) => r.hsCode || '' },
      { header: 'Packing', value: (r) => r.packing || '' },
      { header: 'Planned Qty (MT)', value: (r) => r.plannedQtyMT ?? '' },
      { header: 'FCL', value: (r) => this.fclDisplay(r) },
      { header: 'Buy Unit', value: (r) => r.buyunit || '' },
      { header: 'FC per Unit', value: (r) => r.fcPerUnit ?? '' },
      { header: 'Total FC', value: (r) => r.totalFC ?? '' },
      { header: 'Amount AED', value: (r) => r.amountAED ?? '' },
      { header: 'Payment Terms', value: (r) => r.paymentTerms || '' },
      { header: 'Inco Terms', value: (r) => r.incoterms || '' },
      { header: 'Advance Amount', value: (r) => r.advanceAmount ?? '' },
      { header: 'Advance Date', value: (r) => this.fmtDate(r.advanceAmountDate) },
      { header: 'Bank Name', value: (r) => r.bankName || '' },
      { header: 'Payment Total', value: (r) => r.payment?.totalAmount ?? '' },
      { header: 'Payment Paid', value: (r) => r.payment?.paidAmount ?? '' },
      { header: 'Payment Balance', value: (r) => r.payment?.balanceAmount ?? '' },
      { header: 'Payment Status', value: (r) => r.payment?.paymentStatus || '' },
      { header: 'Warehouse', value: (r) => r.storageAllocationDecision?.warehouse || '' },
      { header: 'Allocation Status', value: (r) => r.storageAllocationApproval?.status || '' },
      { header: 'Containers Received', value: (r) => splits(r).filter((s) => !!s.receivedOnDate).length },
      { header: 'Shortage Bags', value: (r) => splits(r).reduce((sum, s) => sum + (Number(s.shortageBags) || 0), 0) },
      { header: 'Batch', value: (r) => this.firstNonEmpty(splits(r), (s) => s.batch) },
      { header: 'GRN', value: (r) => this.firstNonEmpty(splits(r), (s) => s.grn) },
      { header: 'Inhouse Report No', value: (r) => this.firstNonEmpty(quality(r), (q) => q.inhouseReportNo) },
      { header: 'Inhouse Document', value: (r) => this.firstNonEmpty(quality(r), (q) => q.inhouseReportDocumentName) || 'Not Available' },
      { header: 'Third Party report No', value: (r) => this.firstNonEmpty(quality(r), (q) => q.thirdPartyReportNo) },
      { header: 'Third Party Document', value: (r) => this.firstNonEmpty(quality(r), (q) => q.thirdPartyReportDocumentName) || 'Not Available' },
      { header: 'Quality Remarks', value: (r) => this.firstNonEmpty(quality(r), (q) => q.remarks) },
      { header: 'LPO Document', value: (r) => r.lpoDocumentName || '' },
      { header: 'S1 Report', value: (r) => r.s1QualityReportName || '' },
      { header: 'Commercial Document', value: (r) => r.commercialDocumentName || '' },
    ];
  }

  exportExcel(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.localPurchaseService.getAll(this.searchQuery()).subscribe({
      next: (response) => {
        const columns = this.buildExportColumns();
        const headerRow = columns.map((c) => c.header);
        const dataRows = response.items.map((row) => columns.map((c) => c.value(row)));

        const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
        worksheet['!cols'] = columns.map(() => ({ wch: 20 }));

        const thin = { style: 'thin', color: { rgb: 'FF000000' } };
        const borders = { top: thin, bottom: thin, left: thin, right: thin };
        columns.forEach((_, c) => {
          const headerRef = XLSX.utils.encode_cell({ r: 0, c });
          const headerCell = worksheet[headerRef] || (worksheet[headerRef] = { t: 's', v: '' });
          headerCell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: '000000' } },
            font: { bold: true, color: { rgb: 'FFFFFFFF' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: borders,
          };
          for (let r = 0; r < dataRows.length; r++) {
            const ref = XLSX.utils.encode_cell({ r: r + 1, c });
            if (worksheet[ref]) worksheet[ref].s = { border: borders };
          }
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Local Purchases');
        XLSX.writeFile(workbook, `local-purchases-${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.exporting.set(false);
      },
      error: (err) => {
        console.error('Error exporting local purchases:', err);
        this.exporting.set(false);
      },
    });
  }

  stageClass(stage: string): string {
    switch (stage) {
      case 'Completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Quality': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Storage & Arrival': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }
}
