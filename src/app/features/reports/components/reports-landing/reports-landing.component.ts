import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { ShipmentReportExportChildRow, ShipmentReportExportRow } from '../../../../core/models/shipment.model';
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

type ExportType = 'excel' | 'pdf';

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

  readonly loading = signal(true);
  readonly exporting = signal<ExportType | null>(null);
  readonly error = signal<string | null>(null);
  readonly rows = signal<ShipmentReportExportRow[]>([]);
  readonly generatedAt = signal<string | null>(null);
  readonly expandedShipments = signal<Record<string, boolean>>({});
  readonly filters = signal<ShipmentReportFilters>({});
  readonly filterModalVisible = signal(false);
  readonly exportModalVisible = signal(false);
  readonly pendingExportType = signal<ExportType | null>(null);

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

  readonly selectedColumns = signal<string[]>(this.columns.map((column) => String(column.key)));
  readonly selectedChildColumns = signal<string[]>(this.childColumns.map((column) => String(column.key)));
  readonly activeFilterCount = computed(() =>
    Object.values(this.filters()).filter((value) => String(value ?? '').trim().length > 0).length
  );

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
          this.rows.set(response.rows ?? []);
          this.generatedAt.set(response.generatedAt ?? null);
          this.expandedShipments.set({});
        },
        error: () => {
          this.error.set('Unable to load report data right now.');
        },
      });
  }

  openExportModal(type: ExportType): void {
    if (!this.rows().length) return;
    this.pendingExportType.set(type);
    this.exportModalVisible.set(true);
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
}
