import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { RhStatusSummaryRow } from '../../../../core/models/rh-status-summary.model';
import { RhStatusSummaryService } from '../../services/rh-status-summary.service';

type RhStatusSummaryColumn = {
  header: string;
  key: keyof RhStatusSummaryRow;
};

@Component({
  selector: 'app-shipment-status-summary-rh',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shipment-status-summary-rh.component.html',
  styleUrl: './shipment-status-summary-rh.component.scss',
})
export class ShipmentStatusSummaryRhComponent implements OnInit {
  private rhStatusSummaryService = inject(RhStatusSummaryService);

  readonly columns: RhStatusSummaryColumn[] = [
    { header: 'Sl No', key: 'slNo' },
    { header: 'Shipment No.', key: 'shipmentNo' },
    { header: 'Supplier', key: 'supplier' },
    { header: 'Item description', key: 'itemDescription' },
    { header: 'FCL', key: 'fcl' },
    { header: 'Bag', key: 'bag' },
    { header: 'Ton', key: 'ton' },
    { header: 'COM IN NO', key: 'comInNo' },
    { header: 'BLNo', key: 'blNo' },
    { header: 'GRN', key: 'grn' },
    { header: 'Qty', key: 'qty' },
    { header: 'WH', key: 'wh' },
    { header: 'BATCH', key: 'batch' },
    { header: 'P.Date', key: 'pDate' },
    { header: 'E.Date', key: 'eDate' },
    { header: 'Status', key: 'status' },
  ];

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly rows = signal<RhStatusSummaryRow[]>([]);
  readonly generatedAt = signal<string | null>(null);
  readonly exporting = signal(false);
  readonly search = signal('');

  readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rows = this.rows();
    if (!term) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(term))
    );
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.rhStatusSummaryService
      .getData()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.rows.set(response.rows ?? []);
          this.generatedAt.set(response.generatedAt ?? null);
        },
        error: () => {
          this.error.set('Unable to load shipment status summary RH data right now.');
        },
      });
  }

  exportExcel(): void {
    if (this.exporting() || !this.rows().length) return;

    this.exporting.set(true);
    this.rhStatusSummaryService
      .downloadExcel()
      .pipe(finalize(() => this.exporting.set(false)))
      .subscribe({
        next: (blob) => {
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `shipment-status-summary-rh-${new Date().toISOString().slice(0, 10)}.xlsx`;
          anchor.click();
          URL.revokeObjectURL(objectUrl);
        },
        error: () => {
          this.error.set('Unable to export shipment status summary RH report right now.');
        },
      });
  }

  formatCellValue(value: unknown): string | number {
    if (value == null || value === '') return '';
    return String(value);
  }

  getStatusClasses(status: string | undefined): string {
    const baseClasses = 'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]';
    if (status === 'Arrived') return `${baseClasses} border-emerald-200 bg-emerald-50 text-emerald-700`;
    if (status === 'Port') return `${baseClasses} border-amber-200 bg-amber-50 text-amber-700`;
    return `${baseClasses} border-slate-200 bg-slate-100 text-slate-600`;
  }
}
