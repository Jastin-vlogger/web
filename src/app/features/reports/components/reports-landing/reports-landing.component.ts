import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { ShipmentReportExportChildRow, ShipmentReportExportRow, StorageArrivalReportRow, FasDocumentTrackingRow } from '../../../../core/models/shipment.model';
import { ShipmentReportFilters, ShipmentService } from '../../../../core/services/shipment.service';
import { AuthService } from '../../../../core/services/auth.service';

type ReportColumn = {
  header: string;
  key: keyof ShipmentReportExportRow;
  width: number;
};

type ChildReportColumn = {
  header: string;
  key: keyof ShipmentReportExportChildRow;
};

type StorageArrivalReportColumn = {
  header: string;
  key: keyof StorageArrivalReportRow;
  width: number;
};

type FasDocumentTrackingColumn = {
  header: string;
  key: keyof FasDocumentTrackingRow;
  width: number;
};

type ExportType = 'excel' | 'pdf';
type ActiveReport = 'default' | 'storage-arrival' | 'fas-document-tracking';

@Component({
  selector: 'app-reports-landing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-landing.component.html',
  styleUrl: './reports-landing.component.scss',
})
export class ReportsLandingComponent implements OnInit {
  private shipmentService = inject(ShipmentService);
  private authService = inject(AuthService);

  isFasUser(): boolean {
    const role = String(this.authService.getCurrentUser()?.role || '').trim().toLowerCase();
    return role === 'fas' || role === 'fasmanager' || role === 'fas manager';
  }

  readonly loading = signal(true);
  readonly exporting = signal<ExportType | null>(null);
  readonly error = signal<string | null>(null);
  readonly rows = signal<ShipmentReportExportRow[]>([]);
  readonly filterOptionRows = signal<ShipmentReportExportRow[]>([]);
  readonly generatedAt = signal<string | null>(null);
  readonly expandedShipments = signal<Record<string, boolean>>({});
  readonly filters = signal<ShipmentReportFilters>({});
  readonly filterModalVisible = signal(false);
  readonly exportModalVisible = signal(false);
  readonly pendingExportType = signal<ExportType | null>(null);

  readonly storageArrivalLoading = signal(false);
  readonly storageArrivalError = signal<string | null>(null);
  readonly storageArrivalRows = signal<StorageArrivalReportRow[]>([]);
  readonly storageArrivalGeneratedAt = signal<string | null>(null);
  readonly storageArrivalExporting = signal(false);

  readonly fasTrackingLoading = signal(false);
  readonly fasTrackingError = signal<string | null>(null);
  readonly fasTrackingRows = signal<FasDocumentTrackingRow[]>([]);
  readonly fasTrackingGeneratedAt = signal<string | null>(null);
  readonly fasTrackingExporting = signal(false);

  readonly activeReport = signal<ActiveReport>('default');

  readonly fasTrackingColumns: FasDocumentTrackingColumn[] = [
    { header: 'Sl No', key: 'slNo', width: 8 },
    { header: 'Courier Track No', key: 'courierTrackNo', width: 18 },
    { header: 'Provider', key: 'provider', width: 12 },
    { header: 'Receiver Type', key: 'receiverType', width: 14 },
    { header: 'Receiver', key: 'receiver', width: 20 },
    { header: 'Bank Name', key: 'bankName', width: 20 },
    { header: 'Expected Doc Receipt Date', key: 'expectedDocDate', width: 16 },
    { header: 'DA Received', key: 'daReceived', width: 12 },
    { header: 'Submitted to Bank', key: 'submittedToBank', width: 14 },
    { header: 'Bank Submission Date', key: 'bankSubmissionDate', width: 16 },
    { header: 'DA Signed & Stamped', key: 'daSigned', width: 14 },
    { header: 'Murabaha Required', key: 'murabahaRequired', width: 14 },
    { header: 'Murabaha Released Date', key: 'murabahaReleasedDate', width: 16 },
    { header: 'Murabaha Attached', key: 'murabahaAttached', width: 14 },
    { header: 'Murabaha Submitted to Bank', key: 'murabahaSubmittedToBank', width: 16 },
    { header: 'Murabaha Submission Date', key: 'murabahaSubmissionDate', width: 16 },
    { header: 'Final Contract Received', key: 'finalContractReceived', width: 16 },
    { header: 'Final Contract Attached', key: 'finalContractAttached', width: 16 },
    { header: 'Final Contract Submission Date', key: 'finalContractSubmissionDate', width: 16 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];

  readonly columns: ReportColumn[] = [
    { header: 'S/N', key: 'sn', width: 8 },
    { header: 'Year', key: 'year', width: 10 },
    { header: 'Shipment No.', key: 'shipmentNo', width: 26 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Supplier', key: 'supplier', width: 28 },
    { header: 'Country', key: 'country', width: 16 },
    { header: 'Variant', key: 'variant', width: 18 },
    { header: 'Item Description', key: 'itemDescription', width: 34 },
    { header: 'Rice Name', key: 'riceName', width: 18 },
    { header: 'Packing', key: 'packing', width: 12 },
    { header: 'PI No.', key: 'piNo', width: 20 },
    { header: 'FCL', key: 'fcl', width: 10 },
    { header: 'Cont. Size', key: 'containerSize', width: 12 },
    { header: 'Buying Unit', key: 'buyingUnit', width: 14 },
    { header: 'Buying Qty (MT)', key: 'buyingQtyMT', width: 16 },
    { header: 'FC per Unit', key: 'fcPerUnit', width: 14 },
    { header: 'Total FC', key: 'totalFC', width: 16 },
    { header: 'Inco Terms', key: 'incoterms', width: 14 },
    { header: 'FPO Number', key: 'fpoNo', width: 20 },
    { header: 'Bank Name', key: 'bankName', width: 18 },
    { header: 'Payment Terms', key: 'paymentTerms', width: 18 },
    { header: 'Shipment Status', key: 'shipmentStatus', width: 18 },
    { header: 'No. of Shipments', key: 'noOfShipments', width: 16 },
    { header: 'Port of Loading', key: 'portOfLoading', width: 20 },
    { header: 'Port of Discharge', key: 'portOfDischarge', width: 20 },
    { header: 'Advance Amount', key: 'advanceAmount', width: 16 },
    { header: 'Bags', key: 'bags', width: 12 },
    { header: 'Pallet', key: 'pallet', width: 12 },
    { header: 'Report Status', key: 'reportStatus', width: 26 },
  ];

  readonly childColumns: ChildReportColumn[] = [
    { header: 'Shipment Split', key: 'shipmentNo' },
    { header: 'Actual Shipment', key: 'actualShipmentNo' },
    { header: 'Schedule ETD', key: 'scheduledETD' },
    { header: 'Schedule ETA', key: 'scheduledETA' },
    { header: 'Actual ETD', key: 'actualETD' },
    { header: 'Actual ETA', key: 'actualETA' },
    { header: 'ETA Difference', key: 'etaDifference' },
    { header: 'FCL', key: 'fcl' },
    { header: 'Cont. Size', key: 'containerSize' },
    { header: 'Buying Qty (MT)', key: 'buyingQtyMT' },
    { header: 'Bags', key: 'bags' },
    { header: 'Pallet', key: 'pallet' },
    { header: 'Month', key: 'month' },
    { header: 'Week', key: 'weekWiseShipment' },
    { header: 'Status', key: 'shipmentStatus' },
  ];

  readonly storageArrivalColumns: StorageArrivalReportColumn[] = [
    { header: 'Sl No', key: 'slNo', width: 8 },
    { header: 'Shipment No.', key: 'shipmentNo', width: 18 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Supplier', key: 'supplier', width: 20 },
    { header: 'Country', key: 'country', width: 14 },
    { header: 'Item Description', key: 'itemDescription', width: 28 },
    { header: 'FCL', key: 'fcl', width: 8 },
    { header: 'Bags', key: 'bag', width: 10 },
    { header: 'Tons', key: 'ton', width: 10 },
    { header: 'ETA', key: 'eta', width: 12 },
    { header: 'COM IN NO', key: 'comInNo', width: 18 },
    { header: 'BL No', key: 'blNo', width: 20 },
    { header: 'GRN', key: 'grn', width: 18 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Warehouse', key: 'wh', width: 12 },
    { header: 'Batch', key: 'batch', width: 12 },
    { header: 'Production Date', key: 'pDate', width: 12 },
    { header: 'Expiry Date', key: 'eDate', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 22 },
  ];

  readonly selectedColumns = signal<string[]>(this.columns.map((column) => String(column.key)));
  readonly selectedChildColumns = signal<string[]>(this.childColumns.map((column) => String(column.key)));
  readonly activeFilterCount = computed(() =>
    Object.values(this.filters()).filter((value) => String(value ?? '').trim().length > 0).length
  );
  readonly filterOptions = computed(() => {
    const sourceRows = this.filterOptionRows().length ? this.filterOptionRows() : this.rows();
    return {
      suppliers: this.uniqueOptions(sourceRows.map((row) => row.supplier)),
      statuses: this.uniqueOptions(
        sourceRows.flatMap((row) => [
          row.shipmentStatus,
          row.reportStatus,
          ...(row.children || []).map((child) => child.shipmentStatus),
        ])
      ),
      portsOfDischarge: this.uniqueOptions(sourceRows.map((row) => row.portOfDischarge)),
      portsOfLoading: this.uniqueOptions(sourceRows.map((row) => row.portOfLoading)),
      items: this.uniqueOptions(sourceRows.flatMap((row) => [row.itemDescription, row.riceName])),
    };
  });

  readonly reportCards = computed(() => [
    {
      title: 'Shipment Master Export',
      description: 'Export filtered shipment records to Excel or PDF in the reporting format.',
      icon: 'pi pi-file-export',
      value: this.rows().length,
      tone: 'blue',
    },
    {
      title: 'Downloaded By',
      description: this.getDownloadedBy(),
      icon: 'pi pi-user',
      value: this.rows().length ? 'Ready' : 'No Data',
      tone: 'emerald',
    },
    {
      title: 'Generated At',
      description: this.generatedAt() ? this.formatDateTime(this.generatedAt()) : 'Waiting for data',
      icon: 'pi pi-clock',
      value: this.rows().length ? `${this.rows().length} rows` : '0 rows',
      tone: 'slate',
    },
  ]);

  ngOnInit(): void {
    this.loadReportRows();
    this.loadStorageArrivalReport();
    this.loadFasTrackingReport();
  }

  updateFilter(key: keyof ShipmentReportFilters, value: string): void {
    this.filters.update((current) => ({ ...current, [key]: value }));
  }

  openFilterModal(): void {
    this.filterModalVisible.set(true);
  }

  closeFilterModal(): void {
    if (this.loading()) return;
    this.filterModalVisible.set(false);
  }

  applyFilters(): void {
    this.loadReportRows();
    this.filterModalVisible.set(false);
  }

  clearFilters(): void {
    this.filters.set({});
    this.loadReportRows({});
    this.filterModalVisible.set(false);
  }

  loadReportRows(filters = this.filters()): void {
    this.loading.set(true);
    this.error.set(null);

    this.shipmentService
      .getShipmentReportExportData(filters)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          const rows = response.rows ?? [];
          this.rows.set(rows);
          if (!Object.values(filters).some((value) => String(value ?? '').trim().length > 0)) {
            this.filterOptionRows.set(rows);
          }
          this.generatedAt.set(response.generatedAt ?? null);
          this.expandedShipments.set({});
        },
        error: () => {
          this.error.set('Unable to load report data right now.');
        },
      });
  }

  openExportModal(type: ExportType): void {
    const report = this.activeReport();
    if (report === 'default') {
      if (!this.rows().length) return;
      this.pendingExportType.set(type);
      this.exportModalVisible.set(true);
    } else if (report === 'storage-arrival') {
      if (!this.storageArrivalRows().length) return;
      this.exportStorageArrivalReport();
    } else if (report === 'fas-document-tracking') {
      if (!this.fasTrackingRows().length) return;
      this.exportFasTrackingReport();
    }
  }

  closeExportModal(): void {
    if (this.exporting()) return;
    this.exportModalVisible.set(false);
    this.pendingExportType.set(null);
  }

  toggleColumn(key: string, child = false): void {
    const target = child ? this.selectedChildColumns : this.selectedColumns;
    target.update((current) => {
      const exists = current.includes(key);
      if (exists && current.length === 1) return current;
      return exists ? current.filter((item) => item !== key) : [...current, key];
    });
  }

  selectAllColumns(child = false): void {
    if (child) {
      this.selectedChildColumns.set(this.childColumns.map((column) => String(column.key)));
      return;
    }
    this.selectedColumns.set(this.columns.map((column) => String(column.key)));
  }

  exportSelectedColumns(): void {
    const type = this.pendingExportType();
    if (!type || !this.rows().length) return;

    this.exporting.set(type);
    const request = {
      filters: this.filters(),
      columns: this.selectedColumns(),
      childColumns: this.selectedChildColumns(),
    };
    const download$ =
      type === 'excel'
        ? this.shipmentService.downloadShipmentReportExcel(request)
        : this.shipmentService.downloadShipmentReportPdf(request);

    download$
      .pipe(finalize(() => this.exporting.set(null)))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, this.buildFilename(type === 'excel' ? 'xlsx' : 'pdf'));
          this.closeExportModal();
        },
        error: () => this.error.set(`Unable to export ${type.toUpperCase()} right now.`),
      });
  }

  private getDownloadedBy(): string {
    return this.authService.getCurrentUser()?.name || 'Royal Horizon User';
  }

  private buildFilename(ext: 'xlsx' | 'pdf'): string {
    const date = new Date().toISOString().slice(0, 10);
    return `royal-horizon-shipment-report-${date}.${ext}`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  private uniqueOptions(values: Array<unknown>): string[] {
    const optionMap = new Map<string, string>();
    values.forEach((value) => {
      const label = String(value ?? '').trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (!optionMap.has(key)) {
        optionMap.set(key, label);
      }
    });
    return Array.from(optionMap.values()).sort((a, b) => a.localeCompare(b));
  }

  private formatDateTime(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('en-US', {
          day: 'numeric',
          month: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        });
  }

  formatCellValue(value: unknown, key?: keyof ShipmentReportExportRow): string | number {
    if (key === 'noOfShipments' && (value == null || value === '')) return 0;
    if (value == null || value === '') return '';
    if (typeof value === 'number') {
      if (['fcPerUnit', 'totalFC', 'advanceAmount'].includes(String(key))) {
        return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      }
      if (['bags', 'pallet', 'buyingQtyMT', 'fcl', 'noOfShipments'].includes(String(key))) {
        return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      }
      return value;
    }
    return String(value);
  }

  formatChildCellValue(value: unknown, key?: keyof ShipmentReportExportChildRow): string | number {
    if (value == null || value === '') return '';
    if (
      key &&
      ['fcl', 'containerSize', 'buyingQtyMT', 'bags', 'pallet'].includes(String(key)) &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return String(value);
  }

  getStatusSeverity(status: string | null | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const s = String(status || '').trim().toLowerCase();
    if (!s) return 'secondary';
    if (s.includes('reached wh') || s.includes('delivered wh')) return 'success';
    if (s.includes('at port')) return 'warn';
    if (s.includes('on transit')) return 'info';
    if (s.includes('etd yet')) return 'secondary';
    if (s.includes('completed')) return 'success';
    if (s.includes('delayed') || s.includes('error')) return 'danger';
    return 'secondary';
  }

  getStatusClasses(status: string | undefined): string {
    const severity = this.getStatusSeverity(status);
    const baseClasses = 'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]';
    const severityClasses = {
      success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      info: 'border-blue-200 bg-blue-50 text-blue-700',
      warn: 'border-amber-200 bg-amber-50 text-amber-700',
      danger: 'border-rose-200 bg-rose-50 text-rose-700',
      secondary: 'border-slate-200 bg-slate-50 text-slate-700'
    };
    return `${baseClasses} ${severityClasses[severity]}`;
  }

  getChildStatusClasses(status: string | undefined): string {
    return this.getStatusClasses(status).replace('px-3', 'px-2.5');
  }

  hasChildren(row: ShipmentReportExportRow): boolean {
    return Array.isArray(row.children) && row.children.length > 0;
  }

  isExpanded(row: ShipmentReportExportRow): boolean {
    return !!this.expandedShipments()[row.shipmentNo];
  }

  toggleRow(row: ShipmentReportExportRow): void {
    if (!this.hasChildren(row)) return;
    this.expandedShipments.update((current) => ({
      ...current,
      [row.shipmentNo]: !current[row.shipmentNo],
    }));
  }

  loadStorageArrivalReport(): void {
    this.storageArrivalLoading.set(true);
    this.storageArrivalError.set(null);

    this.shipmentService
      .getStorageArrivalReportData()
      .pipe(finalize(() => this.storageArrivalLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.storageArrivalRows.set(response.rows ?? []);
          this.storageArrivalGeneratedAt.set(response.generatedAt ?? null);
        },
        error: () => {
          this.storageArrivalError.set('Unable to load storage arrival report data right now.');
        },
      });
  }

  exportStorageArrivalReport(): void {
    if (this.storageArrivalExporting() || !this.storageArrivalRows().length) return;

    this.storageArrivalExporting.set(true);
    this.shipmentService
      .downloadStorageArrivalReport()
      .pipe(finalize(() => this.storageArrivalExporting.set(false)))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, this.buildFilename('xlsx'));
        },
        error: () => {
          this.storageArrivalError.set('Unable to export storage arrival report right now.');
        },
      });
  }

  formatStorageArrivalCellValue(value: unknown): string | number {
    if (value == null || value === '') return '';
    return String(value);
  }

  getStorageArrivalStatusClasses(status: string | undefined): string {
    const baseClasses = 'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]';
    if (status === 'Arrived') {
      return `${baseClasses} border-emerald-200 bg-emerald-50 text-emerald-700`;
    }
    return `${baseClasses} border-amber-200 bg-amber-50 text-amber-700`;
  }

  loadFasTrackingReport(): void {
    this.fasTrackingLoading.set(true);
    this.fasTrackingError.set(null);

    this.shipmentService
      .getFasDocumentTrackingData()
      .pipe(finalize(() => this.fasTrackingLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.fasTrackingRows.set(response.rows ?? []);
          this.fasTrackingGeneratedAt.set(response.generatedAt ?? null);
        },
        error: () => {
          this.fasTrackingError.set('Unable to load FAS document tracking data right now.');
        },
      });
  }

  exportFasTrackingReport(): void {
    if (this.fasTrackingExporting() || !this.fasTrackingRows().length) return;

    this.fasTrackingExporting.set(true);
    this.shipmentService
      .downloadFasDocumentTrackingReport()
      .pipe(finalize(() => this.fasTrackingExporting.set(false)))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, `royal-horizon-fas-document-tracking-${new Date().toISOString().slice(0, 10)}.xlsx`);
        },
        error: () => {
          this.fasTrackingError.set('Unable to export FAS document tracking report right now.');
        },
      });
  }

  formatFasTrackingCellValue(value: unknown): string | number {
    if (value == null || value === '') return '';
    return String(value);
  }
}
