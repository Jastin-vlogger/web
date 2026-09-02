import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';

// Split out of LpStorageComponent per the plan's file-size instruction — secondary fields
// (GRN/batch/dates/weights/remarks) plus document upload, same structural role as
// shipment-storage.component's per-row arrival-edit modal / shipment-bl-details' clearing-row
// edit modal (no shared code, same UX convention).
@Component({
  selector: 'app-lp-storage-row-edit-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, InputTextModule, TextareaModule, DatePickerModule],
  templateUrl: './lp-storage-row-edit-modal.component.html',
})
export class LpStorageRowEditModalComponent {
  @Input({ required: true }) row!: FormGroup;
  @Input({ required: true }) rowIndex!: number;
  @Output() close = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<{ index: number; file: File }>();

  selectedFileName = signal<string>('');

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.selectedFileName.set(file.name);
    this.fileSelected.emit({ index: this.rowIndex, file });
  }
}
