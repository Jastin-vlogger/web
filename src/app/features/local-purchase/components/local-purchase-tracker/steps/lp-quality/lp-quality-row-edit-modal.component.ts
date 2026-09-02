import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';

type QualityDocKind = 'inhouse' | 'strategic' | 'thirdParty' | 'attachment';

// Split out of LpQualityComponent per the plan's file-size instruction — In-house/Strategic/
// Third-Party report No/Date/Doc fields plus the (optional, no validation) Attachment upload,
// same field shape as the real Quality step's Quality Rows table.
@Component({
  selector: 'app-lp-quality-row-edit-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, InputTextModule, DatePickerModule],
  templateUrl: './lp-quality-row-edit-modal.component.html',
})
export class LpQualityRowEditModalComponent {
  @Input({ required: true }) row!: FormGroup;
  @Input({ required: true }) rowIndex!: number;
  @Output() close = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<{ index: number; kind: QualityDocKind; file: File }>();

  selectedFileNames = signal<Record<string, string>>({});

  onFileChange(event: Event, kind: QualityDocKind): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.selectedFileNames.update((names) => ({ ...names, [kind]: file.name }));
    this.fileSelected.emit({ index: this.rowIndex, kind, file });
  }
}
