import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalPurchase } from '../../../../models/local-purchase.model';

// Read-only view of the entry data captured at creation — simplified equivalent of
// shipment-summary.component.ts's "Shipment Entry" stage-1 view. No edit affordance (per plan:
// "Once the data is submitted, it cannot be changed").
@Component({
  selector: 'app-lp-entry',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lp-entry.component.html',
})
export class LpEntryComponent {
  @Input({ required: true }) localPurchase!: LocalPurchase;

  supplierName(): string {
    const s = this.localPurchase.supplierId;
    if (typeof s === 'object' && s?.name) return s.name;
    return this.localPurchase.supplierName || '—';
  }
}
