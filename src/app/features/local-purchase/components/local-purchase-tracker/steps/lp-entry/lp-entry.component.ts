import { Component, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalPurchase } from '../../../../models/local-purchase.model';
import { DocumentPreviewComponent } from '../../../../../../shared/components/document-preview/document-preview.component';

// Read-only view of the entry data captured at creation — simplified equivalent of
// shipment-summary.component.ts's "Shipment Entry" stage-1 view. No edit affordance (per plan:
// "Once the data is submitted, it cannot be changed").
@Component({
  selector: 'app-lp-entry',
  standalone: true,
  imports: [CommonModule, DocumentPreviewComponent],
  templateUrl: './lp-entry.component.html',
})
export class LpEntryComponent {
  @Input({ required: true }) localPurchase!: LocalPurchase;

  @ViewChild('docPreview') docPreview!: DocumentPreviewComponent;

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
