import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { LocalPurchase } from '../../../../models/local-purchase.model';
import { LocalPurchaseService } from '../../../../services/local-purchase.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { WarehouseService } from '../../../../../../core/services/warehouse.service';
import { LpAllocationAuditModalComponent } from './lp-allocation-audit-modal.component';

// Stage 2: Storage Allocation — single-destination-warehouse decision + a
// draft/pending_warehouse_manager/approved workflow, replicating the real Shipment flow's BL
// Details "Storage Allocation" tab (status badge, audit modal, Warehouse History timeline) but
// simplified to one warehouse (LP has no line-items/containers to distribute across warehouses).
@Component({
  selector: 'app-lp-allocation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SelectModule, LpAllocationAuditModalComponent],
  templateUrl: './lp-allocation.component.html',
})
export class LpAllocationComponent implements OnChanges {
  @Input({ required: true }) localPurchase!: LocalPurchase;
  @Input() canEdit = false;
  @Input() canApprove = false;
  @Output() saved = new EventEmitter<void>();

  warehouseControl = new FormControl<string>('');
  warehouseOptions = signal<Array<{ label: string; value: string }>>([]);
  saving = signal(false);
  approving = signal(false);
  auditModalVisible = signal(false);

  constructor(
    private localPurchaseService: LocalPurchaseService,
    private notificationService: NotificationService,
    private warehouseService: WarehouseService
  ) {
    // Fetched independently here rather than shared with lp-storage — matches the established
    // pattern where the real Shipment flow's BL Details and Storage components each call
    // WarehouseService.getWarehouses() separately too (no shared cache exists).
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        const activeWarehouses = (warehouses || [])
          .filter((w) => w.status === 'Active')
          .map((w) => {
            const trimmedCode = (w.code || '').trim();
            const codeSuffix = trimmedCode && trimmedCode.toLowerCase() !== (w.name || '').trim().toLowerCase() ? ` - ${trimmedCode}` : '';
            const label = `${w.name}${codeSuffix}`;
            return { label, value: label };
          });
        this.warehouseOptions.set(activeWarehouses);
      },
    });
  }

  ngOnChanges(): void {
    this.warehouseControl.setValue(this.localPurchase?.storageAllocationDecision?.warehouse || '');
    if (!this.canEdit) this.warehouseControl.disable({ emitEvent: false });
    else this.warehouseControl.enable({ emitEvent: false });
  }

  get approval() {
    return this.localPurchase?.storageAllocationApproval || { status: 'draft' as const };
  }

  get hasAuditTrail(): boolean {
    const a = this.approval;
    return !!(a.submittedAt || a.lastUpdatedAt || a.warehouseManagerApprovedAt);
  }

  getApprovalLabel(): string {
    switch (this.approval.status) {
      case 'pending_warehouse_manager':
        return 'Pending Warehouse Manager Approval';
      case 'approved':
        return 'Approved';
      default:
        return 'Draft';
    }
  }

  getApprovalBadgeClasses(): string {
    const label = this.getApprovalLabel();
    if (label === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (label.includes('Pending')) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  }

  get isPendingApproval(): boolean {
    return this.approval.status === 'pending_warehouse_manager';
  }

  openAuditModal(): void {
    this.auditModalVisible.set(true);
  }

  closeAuditModal(): void {
    this.auditModalVisible.set(false);
  }

  saveAllocation(): void {
    if (!this.canEdit) return;
    const warehouse = (this.warehouseControl.value || '').trim();
    if (!warehouse) {
      this.notificationService.warn('Warehouse required', 'Please select a destination warehouse.');
      return;
    }
    this.saving.set(true);
    this.localPurchaseService.updateAllocation(this.localPurchase._id, warehouse).subscribe({
      next: () => {
        this.saving.set(false);
        this.notificationService.success('Saved', 'Storage allocation saved.');
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        console.error('Save allocation error:', err);
        this.notificationService.error('Save failed', err?.error?.message || 'Failed to save storage allocation.');
      },
    });
  }

  approveAllocation(): void {
    if (!this.canApprove || !this.isPendingApproval) return;
    this.approving.set(true);
    this.localPurchaseService.approveAllocation(this.localPurchase._id).subscribe({
      next: () => {
        this.approving.set(false);
        this.notificationService.success('Approved', 'Storage allocation approved.');
        this.saved.emit();
      },
      error: (err) => {
        this.approving.set(false);
        console.error('Approve allocation error:', err);
        this.notificationService.error('Approve failed', err?.error?.message || 'Failed to approve storage allocation.');
      },
    });
  }

  // Single-event Warehouse History timeline (LP has no Transportation Arrangement step, so
  // there's only ever the one 'allocation' event type unlike the real flow's two-event mix).
  getWarehouseHistory(): Array<{ warehouse: string; date: string | null }> {
    const decision = this.localPurchase?.storageAllocationDecision;
    if (!decision?.warehouse) return [];
    const approval = this.approval;
    const date = approval.warehouseManagerApprovedAt || approval.submittedAt || null;
    return [{ warehouse: decision.warehouse, date }];
  }
}
