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

  /** Task #3: export the full filtered Shipments list to Excel. */
  exportExcel(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    // limit high enough to pull every matching row for the export.
    this.shipmentService
      .getAllShipmentsFlat(1, 100000, this.searchQuery(), this.selectedStatuses())
      .subscribe({
        next: (response) => {
          const data = response.shipments.map((row, idx) => ({
            'S No.': idx + 1,
            'Shipment ID': row.shipmentId,
            'BL No': row.blNo || '',
            'Order Date': row.orderDate ? new Date(row.orderDate).toLocaleDateString('en-GB') : '',
            'Supplier': row.supplier || '',
            'Description': row.description || '',
            'Buying Qty': row.buyingQty,
            'FCL': row.fcl,
            'Status': this.getDisplayStageName(row.status),
          }));
          const worksheet = XLSX.utils.json_to_sheet(data);
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
