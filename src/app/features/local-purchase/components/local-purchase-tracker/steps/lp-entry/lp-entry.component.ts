import { Component, EventEmitter, Input, Output, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocalPurchase } from '../../../../models/local-purchase.model';
import { LocalPurchaseService } from '../../../../services/local-purchase.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { DocumentPreviewComponent } from '../../../../../../shared/components/document-preview/document-preview.component';

// View of the entry data captured at creation — simplified equivalent of
// shipment-summary.component.ts's "Shipment Entry" stage-1 view. Everything is read-only except
// the Order Date, which can be corrected (extraction may miss it and fall back to the creation date).
@Component({
  selector: 'app-lp-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, DocumentPreviewComponent],
  templateUrl: './lp-entry.component.html',
})
export class LpEntryComponent {
  @Input({ required: true }) localPurchase!: LocalPurchase;

  @Output() saved = new EventEmitter<void>();

  @ViewChild('docPreview') docPreview!: DocumentPreviewComponent;

  editingDate = signal(false);
  savingDate = signal(false);
  dateDraft = '';

  constructor(
    private localPurchaseService: LocalPurchaseService,
    private notificationService: NotificationService,
  ) {}

  startDateEdit(): void {
    const value = this.localPurchase.orderDate ? new Date(this.localPurchase.orderDate) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.dateDraft = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    this.editingDate.set(true);
  }

  cancelDateEdit(): void {
    this.editingDate.set(false);
  }

  saveDate(): void {
    if (!this.dateDraft || this.savingDate()) return;
    this.savingDate.set(true);
    this.localPurchaseService.updateEntry(this.localPurchase._id, { orderDate: this.dateDraft }).subscribe({
      next: () => {
        this.savingDate.set(false);
        this.editingDate.set(false);
        this.notificationService.success('Saved', 'Order date updated.');
        this.saved.emit();
      },
      error: (err) => {
        this.savingDate.set(false);
        this.notificationService.error('Save failed', err?.error?.message || 'Failed to update order date.');
      },
    });
  }

  supplierName(): string {
    const s = this.localPurchase.supplierId;
    if (typeof s === 'object' && s?.name) return s.name;
    return this.localPurchase.supplierName || '—';
  }

  fclDisplay(): number {
    if (Number(this.localPurchase.fcl) > 0) return Number(this.localPurchase.fcl);
    const qty = Number(this.localPurchase.plannedQtyMT) || 0;
    return qty > 0 ? Math.ceil(qty / 25) : 0;
  }

  preview(url: string | undefined, title: string): void {
    if (url) this.docPreview.open(url, title);
  }
}
