import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { LocalPurchaseStorageAllocationApproval, LocalPurchaseApprovalUser } from '../../../../models/local-purchase.model';

// Read-only Submitted / Last Updated / Warehouse Manager Approval timeline — split out of
// LpAllocationComponent per the file-size convention, reusing
// shipment-bl-details.component.html:1508-1588's structure/copy verbatim.
@Component({
  selector: 'app-lp-allocation-audit-modal',
  standalone: true,
  imports: [CommonModule, DialogModule],
  templateUrl: './lp-allocation-audit-modal.component.html',
})
export class LpAllocationAuditModalComponent {
  @Input() visible = false;
  @Input() approval: LocalPurchaseStorageAllocationApproval | null = null;
  @Output() closed = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }

  getApprovalUserName(userField: LocalPurchaseApprovalUser | undefined): string {
    if (!userField) return '—';
    if (typeof userField === 'object') return userField.name || userField.email || '—';
    return '—';
  }

  formatApprovalDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
