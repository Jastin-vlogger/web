import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LocalPurchase, LocalPurchaseStorageSplit } from '../../../../models/local-purchase.model';
import { LocalPurchaseService } from '../../../../services/local-purchase.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { WarehouseService } from '../../../../../../core/services/warehouse.service';
import { LpStorageRowsTableComponent } from './lp-storage-rows-table.component';
import { LpStorageRowEditModalComponent } from './lp-storage-row-edit-modal.component';

// Orchestrator: form state + save-all handler. Row rendering is split out into
// LpStorageRowsTableComponent and the file-upload modal into LpStorageRowEditModalComponent —
// per the plan's "split into multiple smaller files" instruction, mirroring how the real
// Storage step (2179 combined lines in 2 files) could itself have been split.
@Component({
  selector: 'app-lp-storage',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LpStorageRowsTableComponent, LpStorageRowEditModalComponent],
  templateUrl: './lp-storage.component.html',
})
export class LpStorageComponent implements OnChanges {
  @Input({ required: true }) localPurchase!: LocalPurchase;
  @Input() canEdit = false;
  @Output() saved = new EventEmitter<void>();

  form: FormGroup;
  saving = signal(false);
  editingRowIndex = signal<number | null>(null);
  warehouseOptions = signal<Array<{ label: string; value: string }>>([]);
  private pendingFiles = new Map<number, File>();

  constructor(
    private fb: FormBuilder,
    private localPurchaseService: LocalPurchaseService,
    private notificationService: NotificationService,
    private warehouseService: WarehouseService
  ) {
    this.form = this.fb.group({ rows: this.fb.array([]) });
    // Fetched independently of lp-allocation's own copy — matches the established pattern
    // (the real Shipment flow's BL Details and Storage components each call
    // WarehouseService.getWarehouses() separately too; no shared cache exists to reuse).
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
    this.rebuildForm();
  }

  get rows(): FormArray {
    return this.form.get('rows') as FormArray;
  }

  asGroup(control: any): FormGroup {
    return control as FormGroup;
  }

  private rebuildForm(): void {
    const rows = this.localPurchase?.storageSplits || [];
    const groups = (rows.length ? rows : [this.emptyRow()]).map((row) => this.buildRowGroup(row));
    this.form.setControl('rows', this.fb.array(groups));
  }

  private emptyRow(): LocalPurchaseStorageSplit {
    // Defaults to (but doesn't lock) Stage 2's allocated warehouse, since that stage is
    // single-destination-only — still editable per row here in case of a real override.
    const allocatedWarehouse = this.localPurchase?.storageAllocationDecision?.warehouse || '';
    return { containerSerialNo: '', bags: 0, warehouse: allocatedWarehouse, block: '', shortageBags: 0 };
  }

  getAllocatedTotal(): number {
    return this.rows.controls.reduce((sum, c) => sum + (Number(c.get('bags')?.value) || 0), 0);
  }

  getRemainingQty(): number {
    const planned = Number(this.localPurchase?.plannedQtyMT) || 0;
    return Math.max(0, planned - this.getAllocatedTotal());
  }

  private buildRowGroup(row: LocalPurchaseStorageSplit): FormGroup {
    return this.fb.group({
      containerSerialNo: [row.containerSerialNo || ''],
      bags: [row.bags || 0],
      warehouse: [row.warehouse || ''],
      block: [row.block || ''],
      grn: [row.grn || ''],
      batch: [row.batch || ''],
      productionDate: [row.productionDate ? new Date(row.productionDate) : null],
      expiryDate: [row.expiryDate ? new Date(row.expiryDate) : null],
      receivedOnDate: [row.receivedOnDate ? new Date(row.receivedOnDate) : new Date()],
      receivedOnTime: [row.receivedOnTime || ''],
      grossWeight: [row.grossWeight || ''],
      netWeight: [row.netWeight || ''],
      shortageBags: [row.shortageBags || 0],
      remarks: [row.remarks || ''],
      documentUrl: [row.documentUrl || ''],
      documentName: [row.documentName || ''],
    });
  }

  addRow(): void {
    this.rows.push(this.buildRowGroup(this.emptyRow()));
  }

  removeRow(index: number): void {
    if (this.rows.length <= 1) return;
    this.rows.removeAt(index);
    this.pendingFiles.delete(index);
  }

  openRowEditModal(index: number): void {
    if (!this.canEdit) return;
    this.editingRowIndex.set(index);
  }

  closeRowEditModal(): void {
    this.editingRowIndex.set(null);
  }

  onRowFileSelected(index: number, file: File): void {
    this.pendingFiles.set(index, file);
  }

  saveAll(): void {
    if (!this.canEdit) return;
    this.saving.set(true);
    const formData = new FormData();
    const rowsValue = this.rows.value.map((row: any) => ({
      ...row,
      productionDate: row.productionDate ? new Date(row.productionDate).toISOString() : null,
      expiryDate: row.expiryDate ? new Date(row.expiryDate).toISOString() : null,
      receivedOnDate: row.receivedOnDate ? new Date(row.receivedOnDate).toISOString() : null,
    }));
    formData.append('storageSplits', JSON.stringify(rowsValue));
    this.pendingFiles.forEach((file, index) => {
      formData.append(`storageSplits_${index}_document`, file, file.name);
    });

    this.localPurchaseService.updateStorage(this.localPurchase._id, formData).subscribe({
      next: () => {
        this.saving.set(false);
        this.pendingFiles.clear();
        this.notificationService.success('Saved', 'Storage & Arrival details updated.');
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        console.error('Save storage error:', err);
        this.notificationService.error('Save failed', err?.error?.message || 'Failed to save storage details.');
      },
    });
  }
}
