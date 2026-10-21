import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { ShipmentCostRow } from '../../../../core/models/shipment-cost.model';
import { ShipmentCostService } from '../../services/shipment-cost.service';

type ShipmentCostColumn = {
  header: string;
  key: keyof ShipmentCostRow;
};

@Component({
  selector: 'app-shipment-cost-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shipment-cost-report.component.html',
  styleUrl: './shipment-cost-report.component.scss',
})
export class ShipmentCostReportComponent implements OnInit {
  private shipmentCostService = inject(ShipmentCostService);

  readonly columns: ShipmentCostColumn[] = [
    { header: 'Sl No', key: 'slNo' },
    { header: 'Shipment No.', key: 'shipmentNo' },
    { header: 'Supplier', key: 'supplier' },
    { header: 'BL No.', key: 'blNo' },
    { header: 'Description', key: 'description' },
    { header: 'Actual Paid', key: 'actualPaid' },
  ];

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly rows = signal<ShipmentCostRow[]>([]);
  readonly totalActualPaid = signal(0);
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

  // Footer total follows the search so it always matches the rows on screen.
  readonly visibleTotal = computed(() => {
    const total = this.filteredRows().reduce((sum, row) => sum + (Number(row.actualPaid) || 0), 0);
    return Math.round((total + Number.EPSILON) * 100) / 100;
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.shipmentCostService
      .getData()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.rows.set(response.rows ?? []);
          this.totalActualPaid.set(response.totalActualPaid ?? 0);
          this.generatedAt.set(response.generatedAt ?? null);
        },
        error: (err) => {
          this.error.set(
            err?.status === 403
              ? 'You do not have access to the Shipment Cost Report.'
              : 'Unable to load shipment cost report data right now.'
          );
        },
      });
  }

  exportExcel(): void {
    if (this.exporting() || !this.rows().length) return;

    this.exporting.set(true);
    this.shipmentCostService
      .downloadExcel()
      .pipe(finalize(() => this.exporting.set(false)))
      .subscribe({
        next: (blob) => {
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `shipment-cost-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
          anchor.click();
          URL.revokeObjectURL(objectUrl);
        },
        error: () => {
          this.error.set('Unable to export shipment cost report right now.');
        },
      });
  }

  formatCellValue(value: unknown): string | number {
    if (value == null || value === '') return '';
    return String(value);
  }
}
