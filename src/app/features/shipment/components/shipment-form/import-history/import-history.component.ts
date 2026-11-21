import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ShipmentService } from '../../../../../core/services/shipment.service';
import { ShipmentImportLogItem } from '../../../../../core/models/shipment.model';

const SOURCE_LABELS: Record<string, string> = {
  bl: 'Bill of Lading',
  packing_list: 'Packing List',
  arrival_notice: 'Arrival Notice',
  dpw_cargo: 'DPW Cargo',
  cost_sheet: 'Payment Costing Sheet',
};

const ACTION_LABELS: Record<string, string> = {
  import: 'Imported',
  reimport: 'Re-imported',
  submit: 'Submitted & locked',
  unlock: 'Unlocked',
};

// Shows when each document was imported into this shipment, by whom and from which file.
@Component({
  selector: 'app-import-history',
  standalone: true,
  imports: [CommonModule, DialogModule],
  template: `
    <button
      type="button"
      (click)="open()"
      class="rbac-allow-interaction inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm hover:bg-slate-50">
      <i class="pi pi-history text-[11px]"></i>
      Import History
    </button>

    <p-dialog
      header="Import History"
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '56rem', maxWidth: '95vw' }"
      [draggable]="false">
      @if (loading()) {
        <p class="py-6 text-sm text-slate-500">Loading import history...</p>
      } @else if (error()) {
        <p class="py-6 text-sm text-rose-500">{{ error() }}</p>
      } @else if (!items().length) {
        <p class="py-6 text-sm text-slate-500">
          No imports recorded yet. Imports are logged from now on; data imported before this log existed has no date on record.
        </p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr class="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th class="border border-slate-200 px-3 py-2">Date &amp; Time</th>
                <th class="border border-slate-200 px-3 py-2">Document</th>
                <th class="border border-slate-200 px-3 py-2">Action</th>
                <th class="border border-slate-200 px-3 py-2">File</th>
                <th class="border border-slate-200 px-3 py-2">By</th>
                <th class="border border-slate-200 px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item._id) {
                <tr>
                  <td class="border border-slate-200 px-3 py-2 whitespace-nowrap">{{ item.importedAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="border border-slate-200 px-3 py-2">{{ sourceLabel(item.source) }}</td>
                  <td class="border border-slate-200 px-3 py-2">{{ actionLabel(item.action) }}</td>
                  <td class="border border-slate-200 px-3 py-2 break-all">{{ item.fileName || '–' }}</td>
                  <td class="border border-slate-200 px-3 py-2">{{ item.importedBy || '–' }}</td>
                  <td class="border border-slate-200 px-3 py-2">{{ details(item) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </p-dialog>
  `,
})
export class ImportHistoryComponent {
  @Input() shipmentId: string | null | undefined;

  private shipmentService = inject(ShipmentService);

  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly items = signal<ShipmentImportLogItem[]>([]);

  open(): void {
    this.visible.set(true);
    if (!this.shipmentId) return;
    this.loading.set(true);
    this.error.set(null);
    this.shipmentService.getImportHistory(this.shipmentId).subscribe({
      next: (res) => {
        this.items.set(res.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load import history right now.');
        this.loading.set(false);
      },
    });
  }

  sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source;
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  details(item: ShipmentImportLogItem): string {
    const s = item.summary || {};
    const parts: string[] = [];
    if (s['blNo']) parts.push(`BL ${s['blNo']}`);
    if (s['containers'] != null) parts.push(`${s['containers']} container(s)`);
    if (s['sheets'] != null) parts.push(`${s['sheets']} sheet(s)`);
    if (s['reason']) parts.push(`Reason: ${s['reason']}`);
    return parts.join(' · ') || '–';
  }
}
