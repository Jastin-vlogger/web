import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { MultiSelectModule } from 'primeng/multiselect';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import * as XLSX from 'xlsx';

import { ShipmentService } from '../../core/services/shipment.service';
import { FlatShipmentRow } from '../../core/models/shipment.model';

/**
 * Point 4: lists every individual shipment (split) across all LPOs, sourced from the flat
 * backend endpoint. Shipment ID is the first column. Includes search + multi-select status
 * filter (Point 6) and a Track action that opens the parent LPO's BL Details tab (Point 5).
 */
@Component({
  selector: 'app-all-shipments',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonModule, MultiSelectModule],
  templateUrl: './all-shipments.component.html',
})
export class AllShipmentsComponent implements OnInit {
  private shipmentService = inject(ShipmentService);
  private router = inject(Router);
  protected readonly Math = Math;

  rows = signal<FlatShipmentRow[]>([]);
  loading = signal(true);
  currentPage = signal(1);
  pageSize = signal(20);
  totalRecords = signal(0);
  totalPages = signal(0);
  searchQuery = signal('');
  selectedStatuses = signal<string[]>([]);
  exporting = signal(false);

  // Point 6: status filter options (values match the backend per-container status strings).
  readonly statusOptions = [
    { label: 'At the Port', value: 'At the Port' },
    { label: 'On Transit', value: 'On Transit' },
    { label: 'Delivered WH', value: 'Delivered WH' },
    { label: 'ETD Yet To Due', value: 'ETD yet to Due' },
    { label: 'ETD Yet To Be Confirmed', value: 'ETD yet to be confirmed' },
  ];

  private readonly searchInput$ = new Subject<string>();

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((value) => {
        this.searchQuery.set(value.trim());
        this.currentPage.set(1);
        this.fetchShipments();
      });
    this.fetchShipments();
  }

  fetchShipments(): void {
    this.loading.set(true);
    this.shipmentService
      .getAllShipmentsFlat(this.currentPage(), this.pageSize(), this.searchQuery(), this.selectedStatuses())
      .subscribe({
        next: (response) => {
          this.rows.set(response.shipments);
          this.totalRecords.set(response.totalRecords);
          this.totalPages.set(response.totalPages);
          this.currentPage.set(response.page);
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Error fetching shipments:', error);
          this.loading.set(false);
        },
      });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement)?.value ?? '';
    this.searchInput$.next(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.currentPage.set(1);
    this.fetchShipments();
  }

  onStatusFilterChange(statuses: string[]): void {
    this.selectedStatuses.set(statuses ?? []);
    this.currentPage.set(1);
    this.fetchShipments();
  }

  /**
   * Column spec for the full-detail export, in the exact order/grouping of the
   * "Final Data.xlsx" reference format: 74 columns, grouped under department
   * headers (Purchase / Logistics / FAS / Warehouse) on row 1, column names on row 2.
   */
  private buildExportColumns(): Array<{ group: string; header: string; value: (row: FlatShipmentRow, idx: number) => string | number }> {
    const PURCHASE = 'Purchase Department';
    const LOGISTICS = 'Logistics Department';
    const FAS = 'FAS Department';
    const WH_MANAGER = 'Warehouse Department (Warehouse Manager)';
    const WH_STOREKEEPER = 'Warehouse Department (Storekeepers)';
    const fmt = (v: string | null | undefined) => this.fmtDate(v);

    return [
      // Purchase Department
      { group: PURCHASE, header: 'S No.', value: (_r, idx) => idx + 1 },
      { group: PURCHASE, header: 'Shipment ID', value: (r) => r.shipmentId },
      { group: PURCHASE, header: 'Order Date', value: (r) => fmt(r.orderDate) },
      { group: PURCHASE, header: 'Supplier', value: (r) => r.supplier || '' },
      { group: PURCHASE, header: 'Item Code', value: (r) => r.itemCode || '' },
      { group: PURCHASE, header: 'Description', value: (r) => r.description || '' },
      { group: PURCHASE, header: 'Commodity', value: (r) => r.commodity || '' },
      { group: PURCHASE, header: 'Brand', value: (r) => r.brandName || '' },
      { group: PURCHASE, header: 'Packing', value: (r) => r.packing || '' },
      { group: PURCHASE, header: 'Variant', value: (r) => r.variant || '' },
      { group: PURCHASE, header: 'Barcode', value: (r) => r.barcode || '' },
      { group: PURCHASE, header: 'Country of Origin', value: (r) => r.countryOfOrigin || '' },
      { group: PURCHASE, header: 'H.S Code', value: (r) => r.hsCode || '' },
      { group: PURCHASE, header: 'Buying Qty', value: (r) => r.buyingQty },
      { group: PURCHASE, header: 'FCL', value: (r) => r.fcl },
      { group: PURCHASE, header: 'Bags', value: (r) => r.bags ?? '' },
      { group: PURCHASE, header: 'Pallet', value: (r) => r.pallet ?? '' },
      { group: PURCHASE, header: 'Port of Loading', value: (r) => r.portOfLoading || '' },
      { group: PURCHASE, header: 'Port of Discharge', value: (r) => r.portOfDischarge || '' },
      { group: PURCHASE, header: 'Bank Name', value: (r) => r.bankName || '' },
      { group: PURCHASE, header: 'Inco Terms', value: (r) => r.incoterms || '' },
      { group: PURCHASE, header: 'ETD', value: (r) => fmt(r.etd) },
      { group: PURCHASE, header: 'ETA', value: (r) => fmt(r.eta) },
      { group: PURCHASE, header: 'BL No', value: (r) => r.blNo || '' },
      { group: PURCHASE, header: 'Commercial Invoice No', value: (r) => r.commercialInvoiceNo || '' },
      { group: PURCHASE, header: 'Ship Onboard Date', value: (r) => fmt(r.shipOnBoardDate) },
      { group: PURCHASE, header: 'Shipping Line', value: (r) => r.shippingLine || '' },
      { group: PURCHASE, header: 'No of Containers', value: (r) => r.noOfContainers ?? '' },
      { group: PURCHASE, header: 'Free Detention Days', value: (r) => r.freeDetentionDays ?? '' },
      { group: PURCHASE, header: 'Maximum Detention Days', value: (r) => r.maximumDetentionDays ?? '' },
      { group: PURCHASE, header: 'Shipment Arrived', value: (r) => r.shipmentArrived || '' },
      { group: PURCHASE, header: 'Courier Track No', value: (r) => r.courierTrackNo || '' },
      { group: PURCHASE, header: 'Provider', value: (r) => r.provider || '' },
      { group: PURCHASE, header: 'Reciever', value: (r) => r.receiver || '' },
      { group: PURCHASE, header: 'Expected Doc Date', value: (r) => fmt(r.expectedDocDate) },
      { group: PURCHASE, header: 'Arrival Document Received', value: (r) => r.arrivalDocumentReceived || '' },
      // Logistics Department (Clearing Advance request)
      { group: LOGISTICS, header: 'Clearing Advance Request Date', value: (r) => fmt(r.clearingAdvanceRequestDate) },
      { group: LOGISTICS, header: 'Clearing Advance Amount', value: (r) => r.clearingAdvanceAmount ?? '' },
      // FAS Department (Clearing Advance approval)
      { group: FAS, header: 'Clearing Advance Approved Date', value: (r) => fmt(r.clearingAdvanceApprovedDate) },
      { group: FAS, header: 'Cheque No', value: (r) => r.chequeNo || '' },
      { group: FAS, header: 'Cheque Date', value: (r) => fmt(r.chequeDate) },
      // Warehouse Department (Warehouse Manager)
      { group: WH_MANAGER, header: 'Storage Allocation Date', value: (r) => fmt(r.storageAllocationDate) },
      { group: WH_MANAGER, header: 'Allocate Same Warehouse', value: (r) => r.allocateSameWarehouse || '' },
      { group: WH_MANAGER, header: 'Destination Warehouse(s)', value: (r) => r.destinationWarehouses || '' },
      // FAS Department (Bank / Murabaha submission)
      { group: FAS, header: 'DA Submitted To Bank', value: (r) => r.daSubmittedToBank || '' },
      { group: FAS, header: 'Submission Date', value: (r) => fmt(r.submissionDate) },
      { group: FAS, header: 'Skip Murabaha', value: (r) => r.skipMurabaha || '' },
      { group: FAS, header: 'Murabaha Released Date', value: (r) => fmt(r.murabahaReleasedDate) },
      { group: FAS, header: 'Murabaha Submitted  To Bank', value: (r) => r.murabahaSubmittedToBank || '' },
      { group: FAS, header: 'Murabaha Submission Date', value: (r) => fmt(r.murabahaSubmissionDate) },
      { group: FAS, header: 'Final Contract Received Date', value: (r) => fmt(r.finalContractReceivedDate) },
      // Logistics Department (Port & Clearance)
      { group: LOGISTICS, header: 'Commercial Document Received Date', value: (r) => fmt(r.commercialDocumentReceivedDate) },
      { group: LOGISTICS, header: ' Arrival Date', value: (r) => fmt(r.arrivalDate) },
      { group: LOGISTICS, header: 'Shipping Line Free Detention Days', value: (r) => r.shippingLineFreeDetentionDays ?? '' },
      { group: LOGISTICS, header: 'Port Free Storage Days', value: (r) => r.portFreeStorageDays ?? '' },
      { group: LOGISTICS, header: 'DO Date', value: (r) => fmt(r.doDate) },
      { group: LOGISTICS, header: 'BOE Number', value: (r) => r.boeNumber || '' },
      { group: LOGISTICS, header: 'BOE Date', value: (r) => fmt(r.boeDate) },
      { group: LOGISTICS, header: 'Customer Inspection Required', value: (r) => r.customerInspectionRequired || '' },
      { group: LOGISTICS, header: 'Municipality Ref No', value: (r) => r.municipalityRefNo || '' },
      { group: LOGISTICS, header: 'Municipality Inspection Date', value: (r) => fmt(r.municipalityInspectionDate) },
      { group: LOGISTICS, header: 'Municipality Status', value: (r) => r.municipalityStatus || '' },
      { group: LOGISTICS, header: 'Municipality Released Date', value: (r) => fmt(r.municipalityReleasedDate) },
      { group: LOGISTICS, header: 'Transportation Arrangement', value: (r) => r.transportationArrangement || '' },
      { group: LOGISTICS, header: 'Transport Companies', value: (r) => r.transportCompany || '' },
      { group: LOGISTICS, header: 'Planned (Containers)', value: (r) => r.plannedContainers ?? '' },
      { group: LOGISTICS, header: 'Not Planned (Containers)', value: (r) => r.notPlannedContainers ?? '' },
      // Ungrouped — Payment
      { group: '', header: 'Payment Allocation Request Date', value: (r) => fmt(r.paymentAllocationRequestDate) },
      { group: '', header: 'Payment Received Amount', value: (r) => r.paymentReceivedAmount ?? '' },
      // FAS Department
      { group: FAS, header: 'Payment Approved Date', value: (r) => fmt(r.paymentApprovedDate) },
      { group: FAS, header: 'Diiference Amount', value: (r) => r.differenceAmount ?? '' },
      // Warehouse Department (Storekeepers)
      { group: WH_STOREKEEPER, header: 'Containers Received', value: (r) => r.containersReceived ?? '' },
      { group: WH_STOREKEEPER, header: 'Containers Remaining', value: (r) => r.containersRemaining ?? '' },
      // Ungrouped
      { group: '', header: 'Status', value: (r) => this.getDisplayStageName(r.status) },
    ];
  }

  /** Full-detail export, matching the "Final Data.xlsx" reference format exactly. */
  exportExcel(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    // limit high enough to pull every matching row for the export.
    this.shipmentService
      .getAllShipmentsFlat(1, 100000, this.searchQuery(), this.selectedStatuses())
      .subscribe({
        next: (response) => {
          const columns = this.buildExportColumns();

          // Row 1: department group labels, kept only on the first column of each
          // consecutive run (merged cells only carry a value in their top-left cell).
          const groupRow: string[] = columns.map((c) => c.group);
          for (let i = groupRow.length - 1; i > 0; i--) {
            if (groupRow[i] && groupRow[i] === groupRow[i - 1]) groupRow[i] = '';
          }
          const headerRow = columns.map((c) => c.header);
          const dataRows = response.shipments.map((row, idx) => columns.map((c) => c.value(row, idx)));

          const worksheet = XLSX.utils.aoa_to_sheet([groupRow, headerRow, ...dataRows]);

          // Merge each consecutive run of identical, non-empty department labels on row 1.
          const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
          let runStart = 0;
          for (let i = 1; i <= columns.length; i++) {
            const endOfRun = i === columns.length || columns[i].group !== columns[runStart].group;
            if (endOfRun) {
              if (columns[runStart].group && i - runStart > 1) {
                merges.push({ s: { r: 0, c: runStart }, e: { r: 0, c: i - 1 } });
              }
              runStart = i;
            }
          }
          worksheet['!merges'] = merges;
          worksheet['!cols'] = columns.map(() => ({ wch: 20 }));

          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments');
          XLSX.writeFile(workbook, `shipments-${new Date().toISOString().slice(0, 10)}.xlsx`);
          this.exporting.set(false);
        },
        error: (error) => {
          console.error('Error exporting shipments:', error);
          this.exporting.set(false);
        },
      });
  }

  private fmtDate(value: string | null | undefined): string {
    return value ? new Date(value).toLocaleDateString('en-GB') : '';
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.fetchShipments();
    }
  }

  getDisplaySerial(index: number): number {
    return this.totalRecords() - ((this.currentPage() - 1) * this.pageSize() + index);
  }

  /** Point 5: open the parent LPO's BL Details tab focused on this shipment row. */
  track(row: FlatShipmentRow): void {
    this.router.navigate(['/shipments/track', row.parentId], {
      queryParams: { tab: 'bl_details', shipmentIndex: row.childIndex },
    });
  }

  getDisplayStageName(status: string | null | undefined): string {
    const normalized = String(status || '').trim();
    if (normalized === 'Planned Split') return 'Shipment Split';
    if (normalized === 'Shipment Entry') return 'ETD yet to be confirmed';
    return normalized;
  }

  getSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const s = this.getDisplayStageName(status).toLowerCase();
    if (!s) return 'secondary';
    if (s.includes('reached wh') || s.includes('delivered wh') || s.includes('completed')) return 'success';
    if (s.includes('at the port') || s.includes('port of discharge')) return 'warn';
    if (s.includes('on transit')) return 'info';
    if (s.includes('etd') || s.includes('eta')) return 'secondary';
    if (s.includes('delayed') || s.includes('error')) return 'danger';
    return 'secondary';
  }

  getStatusClasses(status: string): string {
    const severity = this.getSeverity(status);
    if (severity === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (severity === 'info') return 'bg-blue-50 text-blue-700 border-blue-100';
    if (severity === 'warn') return 'bg-amber-50 text-amber-700 border-amber-100';
    if (severity === 'danger') return 'bg-rose-50 text-rose-700 border-rose-100';
    return 'bg-slate-50 text-slate-700 border-slate-100';
  }
}
