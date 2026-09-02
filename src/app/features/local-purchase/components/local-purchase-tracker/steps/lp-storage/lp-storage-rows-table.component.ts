import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';

// Split out of LpStorageComponent per the plan's file-size instruction — pure row-rendering,
// inline-editable cells (same convention as the real Storage step's always-editable rows), with
// document upload delegated to the parent-owned edit modal.
@Component({
  selector: 'app-lp-storage-rows-table',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule, InputNumberModule, DatePickerModule, SelectModule],
  templateUrl: './lp-storage-rows-table.component.html',
})
export class LpStorageRowsTableComponent {
  @Input({ required: true }) rows!: FormArray;
  @Input() canEdit = false;
  @Input() warehouseOptions: Array<{ label: string; value: string }> = [];
  @Output() editRow = new EventEmitter<number>();
  @Output() removeRowIndex = new EventEmitter<number>();

  asGroup(control: any): FormGroup {
    return control as FormGroup;
  }
}
