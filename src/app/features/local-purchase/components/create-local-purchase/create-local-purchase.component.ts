import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { LocalPurchaseService } from '../../services/local-purchase.service';

// Simplified creation form — no PI/BL, but DOES upload an S1 Quality Report alongside
// the LPO (same document pair as the regular Shipment flow) so Extract can reuse the Python
// service's real /shipment-form endpoint unmodified. Independent of create-shipment.component.ts
// (no shared code), same overall shape/UX language.
@Component({
  selector: 'app-create-local-purchase',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, InputTextModule, SelectModule, InputNumberModule, DatePickerModule, ToastModule],
  providers: [MessageService],
  templateUrl: './create-local-purchase.component.html',
  styleUrls: ['./create-local-purchase.component.scss'],
})
export class CreateLocalPurchaseComponent {
  form: FormGroup;
  lpoFile = signal<File | null>(null);
  s1QualityReportFile = signal<File | null>(null);
  // Optional — not sent to extract-lpo, only to /create. Stored/attached, no extraction
  // dependency on it.
  commercialFile = signal<File | null>(null);
  extracting = signal(false);
  submitting = signal(false);
  // Gates the red-border state on the LPO/S1 dropzones (they aren't FormControls, so there's
  // no built-in `touched` to key off like the rest of the form) — set true on the first failed
  // submit attempt, same moment `form.markAllAsTouched()` reveals the other field errors.
  submitAttempted = signal(false);

  private readonly REQUIRED_FIELD_LABELS: Record<string, string> = {
    orderDate: 'Order Date',
    supplierName: 'Supplier Name',
    supplierEmail: 'Supplier Email',
    plannedQtyMT: 'Planned Qty',
    buyunit: 'Buying Unit',
    paymentTerms: 'Payment Terms',
  };

  readonly buyunitOptions = [
    { label: 'MT', value: 'MT' },
    { label: 'Bag', value: 'Bag' },
  ];

  constructor(
    private fb: FormBuilder,
    private localPurchaseService: LocalPurchaseService,
    private router: Router,
    private messageService: MessageService
  ) {
    this.form = this.fb.group({
      orderDate: [new Date(), Validators.required],
      supplierName: ['', Validators.required],
      supplierEmail: ['', [Validators.required, Validators.email]],
      itemDescription: [''],
      commodity: [''],
      countryOfOrigin: [''],
      brandName: [''],
      hsCode: [''],
      plannedQtyMT: [null, Validators.required],
      buyunit: ['MT', Validators.required],
      fcPerUnit: [0],
      totalFC: [0],
      amountAED: [0],
      paymentTerms: ['', Validators.required],
      incoterms: [''],
      advanceAmount: [0],
      bankName: [''],
    });
  }

  // Drives the red `[invalid]` border on each required PrimeNG/input control — same
  // touched-gated check used throughout, exposed once here so the template stays terse.
  isFieldInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && control.touched;
  }

  onLpoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.lpoFile.set(file);
  }

  onS1QualityReportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.s1QualityReportFile.set(file);
  }

  onCommercialFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.commercialFile.set(file);
  }

  extractLpo(): void {
    const lpo = this.lpoFile();
    const s1 = this.s1QualityReportFile();
    if (!lpo || !s1) {
      this.messageService.add({ severity: 'warn', summary: 'Documents required', detail: 'Upload both the LPO and S1 Quality Report before extracting.' });
      return;
    }
    this.extracting.set(true);
    const formData = new FormData();
    formData.append('lpoDocument', lpo, lpo.name);
    formData.append('s1QualityReport', s1, s1.name);
    this.localPurchaseService.extractLpo(formData).subscribe({
      next: (res) => {
        this.extracting.set(false);
        const data = res.data || {};
        this.form.patchValue({
          supplierName: data.supplierName || this.form.value.supplierName,
          supplierEmail: data.supplierEmail || this.form.value.supplierEmail,
          itemDescription: data.itemDescription || this.form.value.itemDescription,
          commodity: data.commodity || this.form.value.commodity,
          countryOfOrigin: data.countryOfOrigin || this.form.value.countryOfOrigin,
          brandName: data.brandName || this.form.value.brandName,
          hsCode: data.hsCode || this.form.value.hsCode,
          plannedQtyMT: data.plannedQtyMT || this.form.value.plannedQtyMT,
          fcPerUnit: data.fcPerUnit || this.form.value.fcPerUnit,
          totalFC: data.totalFC || this.form.value.totalFC,
        });
        this.messageService.add({ severity: 'success', summary: 'Extracted', detail: 'Fields auto-populated where available.' });
      },
      error: (err) => {
        this.extracting.set(false);
        // Fail soft — e.g. the Python service being down, or its document classification
        // rejecting a bad upload — same resilience pattern as the regular shipment flow.
        this.messageService.add({ severity: 'warn', summary: 'Extraction failed', detail: err?.error?.message || 'Please fill the form manually.' });
      },
    });
  }

  onSubmit(): void {
    this.submitAttempted.set(true);

    if (this.form.invalid || !this.lpoFile() || !this.s1QualityReportFile()) {
      this.form.markAllAsTouched();

      const missing: string[] = [];
      for (const [controlName, label] of Object.entries(this.REQUIRED_FIELD_LABELS)) {
        const control = this.form.get(controlName);
        if (!control?.invalid) continue;
        missing.push(controlName === 'supplierEmail' && control.hasError('email')
          ? `${label} (must be a valid email address)`
          : label);
      }
      if (!this.lpoFile()) missing.push('LPO Document');
      if (!this.s1QualityReportFile()) missing.push('S1 Quality Report');

      this.messageService.add({
        severity: 'error',
        summary: 'Missing fields',
        detail: missing.length ? `Please fill/upload: ${missing.join(', ')}.` : 'Please fill all required fields.',
        life: 6000,
      });
      return;
    }

    this.submitting.set(true);
    const value = this.form.value;
    const formData = new FormData();
    const orderDate = value.orderDate instanceof Date ? value.orderDate.toISOString().slice(0, 10) : value.orderDate;
    const payload: Record<string, string> = {
      orderDate,
      supplierName: value.supplierName || '',
      supplierEmail: value.supplierEmail || '',
      itemDescription: value.itemDescription || '',
      commodity: value.commodity || '',
      countryOfOrigin: value.countryOfOrigin || '',
      brandName: value.brandName || '',
      hsCode: value.hsCode || '',
      plannedQtyMT: String(value.plannedQtyMT || 0),
      buyunit: value.buyunit || 'MT',
      fcPerUnit: String(value.fcPerUnit || 0),
      totalFC: String(value.totalFC || 0),
      amountAED: String(value.amountAED || 0),
      paymentTerms: value.paymentTerms || '',
      incoterms: value.incoterms || '',
      advanceAmount: String(value.advanceAmount || 0),
      bankName: value.bankName || '',
    };
    Object.entries(payload).forEach(([key, val]) => formData.append(key, val));
    formData.append('lpoDocument', this.lpoFile()!, this.lpoFile()!.name);
    formData.append('s1QualityReport', this.s1QualityReportFile()!, this.s1QualityReportFile()!.name);
    if (this.commercialFile()) {
      formData.append('commercialDocument', this.commercialFile()!, this.commercialFile()!.name);
    }

    this.localPurchaseService.create(formData).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Local Purchase created successfully.' });
        this.router.navigate(['/local-purchase/track', res.data._id]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: err?.error?.message || 'Could not create Local Purchase.' });
      },
    });
  }
}
