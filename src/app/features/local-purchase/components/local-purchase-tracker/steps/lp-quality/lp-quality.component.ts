import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { LocalPurchase, LocalPurchaseQualityRow } from '../../../../models/local-purchase.model';
import { LocalPurchaseService } from '../../../../services/local-purchase.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { LpQualityRowEditModalComponent } from './lp-quality-row-edit-modal.component';

// Orchestrator: qualityRows FormArray + save(). Report-no/date/doc details per row are split
// into LpQualityRowEditModalComponent per the plan's file-size instruction, mirroring the real
// Quality step's In-house/Strategic/Third-Party report columns — same field shape, fewer files.
@Component({
  selector: 'app-lp-quality',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule, SelectModule, DatePickerModule, LpQualityRowEditModalComponent],
  templateUrl: './lp-quality.component.html',
})
export class LpQualityComponent implements OnChanges {
  @Input({ required: true }) localPurchase!: LocalPurchase;
  @Input() canEdit = false;
  @Output() saved = new EventEmitter<void>();

  form: FormGroup;
  saving = signal(false);
  editingRowIndex = signal<number | null>(null);
  private pendingFiles = new Map<string, File>();

  readonly phaseOptions = [
    { label: 'S1', value: 'S1' },
    { label: 'S2', value: 'S2' },
    { label: 'S3', value: 'S3' },
  ];

  constructor(
    private fb: FormBuilder,
    private localPurchaseService: LocalPurchaseService,
    private notificationService: NotificationService
  ) {
    this.form = this.fb.group({ rows: this.fb.array([]) });
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

  private emptyRow(index: number): LocalPurchaseQualityRow {
    return { sn: index + 1, phase: 'S1', date: null };
  }

  private buildRowGroup(row: LocalPurchaseQualityRow): FormGroup {
    return this.fb.group({
      sn: [row.sn || 1],
      sampleNo: [row.sampleNo || ''],
      phase: [row.phase || 'S1'],
      date: [row.date ? new Date(row.date) : new Date()],
      inhouseReportNo: [row.inhouseReportNo || ''],
      inhouseReportDate: [row.inhouseReportDate ? new Date(row.inhouseReportDate) : null],
      inhouseReportDocumentUrl: [row.inhouseReportDocumentUrl || ''],
      inhouseReportDocumentName: [row.inhouseReportDocumentName || ''],
      strategicReportNo: [row.strategicReportNo || ''],
      strategicReportDate: [row.strategicReportDate ? new Date(row.strategicReportDate) : null],
      strategicReportDocumentUrl: [row.strategicReportDocumentUrl || ''],
      strategicReportDocumentName: [row.strategicReportDocumentName || ''],
      thirdPartyReportNo: [row.thirdPartyReportNo || ''],
      thirdPartyReportDate: [row.thirdPartyReportDate ? new Date(row.thirdPartyReportDate) : null],
      thirdPartyReportDocumentUrl: [row.thirdPartyReportDocumentUrl || ''],
      thirdPartyReportDocumentName: [row.thirdPartyReportDocumentName || ''],
      remarks: [row.remarks || ''],
      attachmentDocumentUrl: [row.attachmentDocumentUrl || ''],
      attachmentDocumentName: [row.attachmentDocumentName || ''],
    });
  }

  private rebuildForm(): void {
    const rows = this.localPurchase?.qualityRows || [];
    const groups = (rows.length ? rows : [this.emptyRow(0)]).map((row) => this.buildRowGroup(row));
    this.form.setControl('rows', this.fb.array(groups));
  }

  addRow(): void {
    this.rows.push(this.buildRowGroup(this.emptyRow(this.rows.length)));
  }

  removeRow(index: number): void {
    if (this.rows.length <= 1) return;
    this.rows.removeAt(index);
  }

  openRowEditModal(index: number): void {
    if (!this.canEdit) return;
    this.editingRowIndex.set(index);
  }

  closeRowEditModal(): void {
    this.editingRowIndex.set(null);
  }

  // kind: 'inhouse' | 'strategic' | 'thirdParty' | 'attachment' — matches backend's
  // qualityRows_<index>_<kind> field-name convention (local-purchase-quality.controller.js).
  onRowFileSelected(index: number, kind: string, file: File): void {
    this.pendingFiles.set(`qualityRows_${index}_${kind}`, file);
  }

  saveAll(): void {
    if (!this.canEdit) return;
    // Phase and Date are the only required fields — Attachment stays optional, same fix
    // already applied to the real Quality step this session.
    const invalidRows: number[] = [];
    this.rows.controls.forEach((rowCtrl, idx) => {
      const phase = String(rowCtrl.get('phase')?.value || '').trim();
      const date = rowCtrl.get('date')?.value;
      if (!phase || !date) invalidRows.push(idx + 1);
    });
    if (invalidRows.length) {
      this.notificationService.error('Required Fields Missing', `Rows ${invalidRows.join(', ')}: Phase and Date are required.`);
      return;
    }

    this.saving.set(true);
    const formData = new FormData();
    const rowsValue = this.rows.value.map((row: any) => ({
      ...row,
      date: row.date ? new Date(row.date).toISOString() : null,
      inhouseReportDate: row.inhouseReportDate ? new Date(row.inhouseReportDate).toISOString() : null,
      strategicReportDate: row.strategicReportDate ? new Date(row.strategicReportDate).toISOString() : null,
      thirdPartyReportDate: row.thirdPartyReportDate ? new Date(row.thirdPartyReportDate).toISOString() : null,
    }));
    formData.append('qualityRows', JSON.stringify(rowsValue));
    this.pendingFiles.forEach((file, key) => formData.append(key, file, file.name));

    this.localPurchaseService.updateQuality(this.localPurchase._id, formData).subscribe({
      next: () => {
        this.saving.set(false);
        this.pendingFiles.clear();
        this.notificationService.success('Saved', 'Quality details updated.');
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        console.error('Save quality error:', err);
        this.notificationService.error('Save failed', err?.error?.message || 'Failed to save quality details.');
      },
    });
  }
}
