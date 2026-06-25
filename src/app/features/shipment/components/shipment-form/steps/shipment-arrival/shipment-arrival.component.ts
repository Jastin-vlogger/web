import { Component, Input, inject, effect, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormArray, AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { AccordionModule } from 'primeng/accordion';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TextareaModule } from 'primeng/textarea';
import { ShipmentService } from '../../../../../../core/services/shipment.service';
import { WarehouseService } from '../../../../../../core/services/warehouse.service';
import { ExtractDpwCargoResponse } from '../../../../../../core/models/shipment.model';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { TransportationCompanyService } from '../../../../../../core/services/transportation-company.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { RbacService } from '../../../../../../core/services/rbac.service';
import {
  selectShipmentData,
  selectSubmittedStep3Indices,
  selectSubmittedStep4Indices,
  selectSubmittedStep5Indices,
  selectSubmittingRowIndex,
} from '../../../../../../store/shipment/shipment.selectors';
import * as ShipmentActions from '../../../../../../store/shipment/shipment.actions';
import { isDocumentationCompleteForCurrentFlow } from '../../shared/document-tracker-milestones';

type Step5DocKind =
  | 'arrivalNotice'
  | 'advanceRequest'
  | 'doReleased'
  | 'boePassingDate'
  | 'customsClearance'
  | 'municipality'
  | 'portClearance'
  | 'customerInspection';

type LogisticsSectionKey = Step5DocKind | 'transportation';
type CustomsDocType = 'boe' | 'do' | 'blOriginal' | 'invoice' | 'packingList' | 'coo';
const CUSTOMS_SUBMISSION_DOCS: Array<{ type: CustomsDocType; label: string }> = [
  { type: 'boe', label: 'BOE Copy' },
  { type: 'do', label: 'DO Copy' },
  { type: 'blOriginal', label: 'BL' },
  { type: 'invoice', label: 'Origin Invoice' },
  { type: 'packingList', label: 'Packing List' },
];

const STEP5_DOC_CONFIG: {
  kind: Step5DocKind;
  label: string;
  dateControl: string;
  remarksControl?: string;
}[] = [
  { kind: 'arrivalNotice', label: 'Arrival Notice Date', dateControl: 'arrivalNoticeDate' },
  { kind: 'advanceRequest', label: 'Advance Received', dateControl: 'advanceRequestDate' },
  { kind: 'doReleased', label: 'DO Released Date', dateControl: 'doReleasedDate', remarksControl: 'doReleasedRemarks' },
  { kind: 'boePassingDate', label: 'BOE Passing / DP Invoice', dateControl: 'boePassingDate', remarksControl: 'boePassingRemarks' },
  { kind: 'municipality', label: 'Municipality Clearance Application Date', dateControl: 'municipalityDate', remarksControl: 'municipalityRemarks' },
  { kind: 'customsClearance', label: 'Customs Clearance Date', dateControl: 'customsClearanceDate', remarksControl: 'customsClearanceRemarks' },
];

@Component({
  selector: 'app-shipment-arrival',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    AccordionModule,
    ConfirmDialogModule,
    DialogModule,
    SelectModule,
    ToggleSwitchModule,
    TextareaModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './shipment-arrival.component.html',
})
export class ShipmentArrivalComponent {
  @Input({ required: true }) formArray!: FormArray;
  @Input() visibleShipmentIndices: number[] = [];

  readonly step5DocConfig = STEP5_DOC_CONFIG;
  readonly customsSubmissionDocs = CUSTOMS_SUBMISSION_DOCS;
  readonly municipalityStatusOptions = [
    { label: 'Open', value: 'open' },
    { label: 'Released', value: 'released' },
    { label: 'Closed', value: 'closed' },
  ];
  readonly secondaryStep5DocConfig = STEP5_DOC_CONFIG.filter((doc) => doc.kind !== 'arrivalNotice');
  readonly visibleSecondaryStep5DocConfig = computed(() =>
    this.secondaryStep5DocConfig.filter((doc) => this.canViewLogisticsSection(doc.kind))
  );
  readonly visibleBulkSections = computed<LogisticsSectionKey[]>(() =>
    ([
      'arrivalNotice',
      'advanceRequest',
      'doReleased',
      'boePassingDate',
      'municipality',
      'transportation',
      'customsClearance',
    ] as LogisticsSectionKey[]).filter((section) => this.canViewLogisticsSection(section))
  );

  hasPendingEditableBulkSections(index: number): boolean {
    return this.getVisibleBulkSectionsForRow(index).some(
      (section) => this.canEditLogisticsSection(section) && !this.isLogisticsSectionLocked(index, section)
    );
  }

  getVisibleBulkSectionsForRow(index: number): LogisticsSectionKey[] {
    return this.visibleBulkSections().filter((section) =>
      section !== 'customsClearance' || this.isCustomClearanceRequired(index)
    );
  }

  @ViewChild('arrivalNoticeInput') arrivalNoticeInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('advanceRequestInput') advanceRequestInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('doReleasedInput') doReleasedInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('boePassingDateInput') boePassingDateInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customsClearanceInput') customsClearanceInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('municipalityInput') municipalityInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('dpInvoiceInput') dpInvoiceInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('municipalityCertificateInput') municipalityCertificateInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('repositoryDocumentUpload') repositoryDocumentUploadRef?: ElementRef<HTMLInputElement>;
  @ViewChild('typedDocInput') typedDocInputRef?: ElementRef<HTMLInputElement>;

  // Customs Documents ViewChild references
  @ViewChild('customsDocBoeInput') customsDocBoeInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customsDocDoInput') customsDocDoInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customsDocBlOriginalInput') customsDocBlOriginalInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customsDocInvoiceInput') customsDocInvoiceInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customsDocPackingListInput') customsDocPackingListInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customsDocCooInput') customsDocCooInputRef?: ElementRef<HTMLInputElement>;

  private pendingFileRow: number | null = null;
  private pendingDocKind: Step5DocKind | null = null;
  private restoredUiStateKey: string | null = null;

  readonly shipmentData = toSignal(inject(Store).select(selectShipmentData));

  readonly arrivalNoticeFile = signal<Record<number, File | null>>({});
  readonly advanceRequestFile = signal<Record<number, File | null>>({});
  readonly doReleasedFile = signal<Record<number, File | null>>({});
  readonly boePassingDateFile = signal<Record<number, File | null>>({});
  readonly customsClearanceFile = signal<Record<number, File | null>>({});
  readonly municipalityFile = signal<Record<number, File | null>>({});
  readonly dpInvoiceFile = signal<Record<number, File | null>>({});
  readonly municipalityCertificateFile = signal<Record<number, File | null>>({});

  // Toggle for the optional DP Invoice upload under Bill Processing. Hidden for now;
  // flip to true to re-enable the upload field and its (optional) validation.
  readonly showDpInvoiceUpload = false;

  // Customs Documents file signals
  readonly customsDocBoeFile = signal<Record<number, File | null>>({});
  readonly customsDocDoFile = signal<Record<number, File | null>>({});
  readonly customsDocBlOriginalFile = signal<Record<number, File | null>>({});
  readonly customsDocInvoiceFile = signal<Record<number, File | null>>({});
  readonly customsDocPackingListFile = signal<Record<number, File | null>>({});
  readonly customsDocCooFile = signal<Record<number, File | null>>({});

  readonly expandedTransportation = signal<Record<number, boolean>>({});
  readonly extractingArrivalNoticeRowIndex = signal<number | null>(null);
  readonly extractingDpwCargoRowIndex = signal<number | null>(null);
  readonly sectionSavingKey = signal<string | null>(null);
  readonly lockedSections = signal<Record<string, boolean>>({});
  readonly dpwExtractionDialogVisible = signal(false);
  readonly activeDpwExtractionRowIndex = signal<number | null>(null);
  readonly activeDpwExtraction = signal<ExtractDpwCargoResponse | null>(null);
  readonly bulkDateModalVisible = signal(false);
  readonly bulkDateRowIndex = signal<number | null>(null);
  readonly bulkTransportationSaving = signal(false);
  readonly bulkContainerSearchFilter = signal<string>('');
  readonly bulkTransportationAttachments = signal<File[]>([]);
  readonly transactionDetailModalVisible = signal(false);
  readonly selectedTransactionData = signal<any>(null);
  readonly bulkDateForm = new FormGroup({
    transportCompanyName: new FormControl<string | null>(null),
    warehouse: new FormControl<string | null>(null),
    bookedDate: new FormControl<Date | null>(null),
    bookingTime: new FormControl<Date | null>(null),
    transportDate: new FormControl<Date | null>(null),
    transportTime: new FormControl<Date | null>(null),
  });

  hasVisibleShipments(): boolean {
    return this.visibleShipmentIndices.length > 0;
  }

  shouldShowShipment(index: number): boolean {
    return this.visibleShipmentIndices.includes(index);
  }
  readonly lockedPortCustomsSections = signal<Record<number, boolean>>({});
  readonly lockedTransportationSections = signal<Record<number, boolean>>({});
  readonly openAccordionPanels = signal<string[]>([]);

  // POINT 11: Bulk save modal state
  readonly bulkSaveModalVisible = signal(false);
  readonly bulkSaveRowIndex = signal<number | null>(null);
  readonly bulkSaving = signal(false);

  // STEP 4: Documents Repository and Customer Inspection support
  readonly repositoryDocumentsModalVisible = signal(false);
  readonly repositoryDocumentsForRow = signal<number | null>(null);
  readonly uploadingRepositoryDocument = signal(false);
  readonly customerInspectionFile = signal<Record<number, File | null>>({});
  readonly commercialDocumentFile = signal<Record<number, File | null>>({});
  readonly repositoryDocumentUploadInput?: ElementRef<HTMLInputElement>;

  // Transportation Transaction dialog
  readonly newTransactionDialogVisible = signal(false);
  readonly newTransactionRowIndex = signal<number | null>(null);
  readonly savingTransaction = signal(false);
  readonly deletingTransactionId = signal<string | null>(null);
  readonly newTransactionForm = new FormGroup({
    containerSerials: new FormControl<string>('', { nonNullable: true }),
    transportCompany: new FormControl<string | null>(null),
    warehouse: new FormControl<string | null>(null),
    transportDate: new FormControl<Date | null>(null),
  });

  readonly customerInspectionStatusOptions = [
    { label: 'Passed', value: 'passed' },
    { label: 'Failed', value: 'failed' },
    { label: 'Pending', value: 'pending' },
  ];
  readonly warehouseOptions = signal<Array<{ label: string; value: string }>>([]);

  openBulkSaveModal(index: number): void {
    this.bulkSaveRowIndex.set(index);
    this.bulkSaveModalVisible.set(true);
  }

  closeBulkSaveModal(): void {
    this.bulkSaveModalVisible.set(false);
    this.bulkSaveRowIndex.set(null);
  }

  openRepositoryDocumentsModal(index: number): void {
    this.repositoryDocumentsForRow.set(index);
    this.repositoryDocumentsModalVisible.set(true);
  }

  closeRepositoryDocumentsModal(): void {
    this.repositoryDocumentsModalVisible.set(false);
    this.repositoryDocumentsForRow.set(null);
  }

  private normalizeAccordionValues(values: string | string[] | null | undefined): string[] {
    if (Array.isArray(values)) return values.filter(Boolean);
    if (typeof values === 'string' && values.trim()) return [values];
    return [];
  }

  private getUiStateStorageKey(): string | null {
    const shipmentId = this.shipmentData()?.shipment?._id;
    return shipmentId ? `shipment-arrival-ui:${shipmentId}` : null;
  }

  private persistUiState(): void {
    if (typeof window === 'undefined') return;
    const key = this.getUiStateStorageKey();
    if (!key) return;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ openAccordionPanels: this.normalizeAccordionValues(this.openAccordionPanels()) })
    );
  }

  private restoreUiState(): void {
    if (typeof window === 'undefined') return;
    const key = this.getUiStateStorageKey();
    if (!key || this.restoredUiStateKey === key) return;

    this.restoredUiStateKey = key;
    const rawState = window.sessionStorage.getItem(key);
    if (!rawState) return;

    try {
      const parsed = JSON.parse(rawState) as { openAccordionPanels?: string[] | null };
      this.openAccordionPanels.set(this.normalizeAccordionValues(parsed.openAccordionPanels));
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  onAccordionChange(values: string | string[] | null | undefined): void {
    const normalized = this.normalizeAccordionValues(values);
    if (normalized.length === 0 && (this.sectionSavingKey() !== null || this.submittingRowIndex() !== null)) {
      return;
    }
    this.openAccordionPanels.set(normalized);
    this.persistUiState();
  }

  private ensureAccordionOpen(index: number): void {
    const panelValue = `arr-${index}`;
    const current = this.normalizeAccordionValues(this.openAccordionPanels());
    if (!current.includes(panelValue)) {
      this.openAccordionPanels.set([...current, panelValue]);
      this.persistUiState();
    }
  }

  async executeBulkSave(index: number): Promise<void> {
    const pendingSections = this.getVisibleBulkSectionsForRow(index).filter(
      (section) => this.canEditLogisticsSection(section) && !this.isLogisticsSectionLocked(index, section)
    );

    if (pendingSections.length === 0) {
      this.messageService.add({ severity: 'info', summary: 'Nothing to save', detail: 'All sections are already saved.' });
      this.closeBulkSaveModal();
      return;
    }

    this.bulkSaving.set(true);
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!group || !containerId || !shipmentId) {
      this.bulkSaving.set(false);
      return;
    }
    this.ensureAccordionOpen(index);

    if (pendingSections.includes('transportation')) {
      const missingFields = this.validateTransportationSection(group);
      if (missingFields.length) {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
      const transportationRows = this.getTransportationRows(group);
      transportationRows.markAllAsTouched();
      if (transportationRows.invalid) {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Invalid transportation timing',
          detail: 'Transportation date and time must be the same as or later than the arranged date and booking time.',
        });
        return;
      }
      
      // Validate that all transport companies are selected
      const transportationData = transportationRows.getRawValue();
      const missingCompany = transportationData.some((tb: any) => !tb.transportCompanyName || tb.transportCompanyName.trim() === '');
      if (missingCompany) {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Transport Company Required',
          detail: 'Please select a transport company for all containers before saving.',
        });
        return;
      }
    }

    if (pendingSections.includes('customsClearance')) {
      const missingFields = this.validateCustomsClearanceSection(index, group);
      if (missingFields.length) {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    if (pendingSections.includes('boePassingDate')) {
      const missingFields = this.validateBoePassingSection(index, group);
      if (missingFields.length) {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    if (pendingSections.includes('municipality')) {
      const missingFields = this.validateMunicipalitySection(group);
      if (missingFields.length) {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    const payload = this.buildBulkLogisticsPayload(index, pendingSections);

    this.shipmentService.submitLogistics(containerId, payload).subscribe({
      next: () => {
        this.lockedSections.update((current) => {
          const next = { ...current };
          pendingSections.forEach((section) => {
            next[this.sectionKey(index, section)] = true;
          });
          return next;
        });
        this.applySectionLocks(index);
        this.bulkSaving.set(false);
        this.closeBulkSaveModal();
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
        this.messageService.add({
          severity: 'success',
          summary: 'Bulk Save Complete',
          detail: `${pendingSections.length} section(s) saved successfully.`,
        });
      },
      error: (error) => {
        this.bulkSaving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Bulk Save Failed',
          detail: error?.error?.message || 'Unable to save all Port and Clearance sections in one request.',
        });
      }
    });
  }

  private buildBulkLogisticsPayload(index: number, sections: LogisticsSectionKey[]): FormData {
    const group = this.formArray.at(index);
    const payload = new FormData();
    const toDate = (val: unknown) => (val ? new Date(val as Date).toISOString().split('T')[0] : '');

    payload.append('sectionKey', 'bulk');
    payload.append('bulkSectionKeys', JSON.stringify(sections));
    payload.append('customClearanceRequired', String(this.isCustomClearanceRequired(index)));

    if (sections.includes('arrivalNotice')) {
      this.updateDerivedDates(index);
      payload.append('arrivalOn', toDate(group.get('arrivalOn')?.value));
      payload.append('shipmentFreeRetentionDate', toDate(group.get('shipmentFreeRetentionDate')?.value));
      payload.append('maximumRetentionDate', toDate(group.get('maximumRetentionDate')?.value));
      payload.append('arrivalNoticeDate', toDate(group.get('arrivalNoticeDate')?.value));
      payload.append('arrivalNoticeFreeRetentionDays', String(group.get('arrivalNoticeFreeRetentionDays')?.value ?? ''));
      const file = this.getFile(index, 'arrivalNotice');
      if (file) payload.append('arrivalNoticeDocument', file, file.name);
    }

    const sectionMap = {
      advanceRequest: { date: 'advanceRequestDate', remarks: null as string | null, file: 'advanceRequestDocument' },
      doReleased: { date: 'doReleasedDate', remarks: 'doReleasedRemarks', file: 'doReleasedDocument' },
      boePassingDate: { date: 'boePassingDate', remarks: 'boePassingRemarks', file: 'boePassingDocument' },
      customsClearance: { date: 'customsClearanceDate', remarks: 'customsClearanceRemarks', file: 'customsClearanceDocument' },
      municipality: { date: 'municipalityDate', remarks: 'municipalityRemarks', file: 'municipalityDocument' },
    } as const;

    (['advanceRequest', 'doReleased', 'boePassingDate', 'customsClearance', 'municipality'] as const).forEach((section) => {
      if (!sections.includes(section)) return;
      const config = sectionMap[section];
      payload.append(config.date, toDate(group.get(config.date)?.value));
      if (config.remarks) {
        payload.append(config.remarks, group.get(config.remarks)?.value || '');
      }
      if (section === 'boePassingDate') {
        payload.append('dmBarcode', group.get('dmBarcode')?.value || '');
        payload.append('dpwCargoExtraction', JSON.stringify(group.get('dpwCargoExtraction')?.value || null));
        const dpInvoice = this.getDpInvoiceFile(index);
        if (dpInvoice) payload.append('dpInvoiceDocument', dpInvoice, dpInvoice.name);
      }
      if (section === 'customsClearance') {
        if (this.isCustomClearanceRequired(index)) {
          this.appendCustomsSubmissionDocuments(index, payload);
        }
      }
      if (section === 'municipality') {
        payload.append('municipalityStatus', group.get('municipalityStatus')?.value || 'open');
        payload.append('municipalityStatusComment', group.get('municipalityStatusComment')?.value || '');
        const certificate = this.getMunicipalityCertificateFile(index);
        if (certificate) payload.append('municipalityClearanceCertificate', certificate, certificate.name);
      }
      const file = this.getFile(index, section);
      if (file) payload.append(config.file, file, file.name);
    });

    if (sections.includes('transportation')) {
      const transportationRows = this.getTransportationRows(group);
      transportationRows.markAllAsTouched();
      this.updateDelayHours(index);
      const transportationBooked = this.buildTransportationBookedPayload(group);
      payload.append('transportationBooked', JSON.stringify(transportationBooked));
    }

    return payload;
  }

  private buildTransportationBookedPayload(group: AbstractControl): Array<Record<string, unknown>> {
    const toDate = (val: unknown) => (val ? new Date(val as Date).toISOString().split('T')[0] : '');
    return this.getTransportationRows(group).getRawValue().map((tb: any) => ({
      sn: Number(tb.sn) || 0,
      transactionId: tb.transactionId || '',
      containerSerialNo: tb.containerSerialNo || '',
      transportCompanyName: tb.transportCompanyName || '',
      warehouse: tb.warehouse || '',
      bulkSelected: tb.checked === true,
      bookedDate: toDate(tb.bookedDate),
      bookingTime: this.toTimeString(tb.bookingTime),
      transportDate: toDate(tb.transportDate),
      transportTime: this.toTimeString(tb.transportTime),
      delayHours: tb.delayHours ?? null,
      storageStartDate: toDate(tb.storageStartDate),
      storageEndDate: toDate(tb.storageEndDate),
      tokenReceivedDate: toDate(tb.tokenReceivedDate),
    }));
  }

  readonly extractionMessages = [
    'Uploading Arrival Notice safely',
    'Royal AI is identifying the vessel and date',
    'Extracting free retention data and detention terms',
    'Syncing extraction results with shipment records'
  ];
  readonly extractionMessageIndex = signal(0);
  readonly extractionProgress = signal(18);
  readonly currentExtractionMessage = computed(() => this.extractionMessages[this.extractionMessageIndex()] || this.extractionMessages[0]);
  readonly isExtractingDocument = computed(() =>
    this.extractingArrivalNoticeRowIndex() !== null || this.extractingDpwCargoRowIndex() !== null
  );
  readonly extractionTitle = computed(() =>
    this.extractingDpwCargoRowIndex() !== null
      ? 'Royal AI is extracting DP Invoice details'
      : 'Royal AI is extracting Arrival details'
  );
  private extractionTicker: any = null;

  showPreviewModal = signal(false);
  previewUrl = signal<string | null>(null);
  previewTitle = signal('');
  previewIsImage = signal(false);
  previewZoom = signal(1);
  previewTransformOrigin = signal('center center');
  previewSafeUrl = computed(() => {
    const url = this.previewUrl();
    if (!url || this.previewIsImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  private store = inject(Store);
  private sanitizer = inject(DomSanitizer);
  private shipmentService = inject(ShipmentService);
  private warehouseService = inject(WarehouseService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private notificationService = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);
  private transportationCompanyService = inject(TransportationCompanyService);
  private authService = inject(AuthService);
  private rbacService = inject(RbacService);
  private readonly logisticsPermissionMap: Record<LogisticsSectionKey, { view: string; edit: string }> = {
    portClearance: { view: 'shipment.tab.port_customs.milestone_1.view', edit: 'shipment.tab.port_customs.milestone_1.edit' },
    arrivalNotice: { view: 'shipment.tab.port_customs.milestone_1.view', edit: 'shipment.tab.port_customs.milestone_1.edit' },
    advanceRequest: { view: 'shipment.tab.port_customs.milestone_2.view', edit: 'shipment.tab.port_customs.milestone_2.edit' },
    doReleased: { view: 'shipment.tab.port_customs.milestone_3.view', edit: 'shipment.tab.port_customs.milestone_3.edit' },
    boePassingDate: { view: 'shipment.tab.port_customs.milestone_4.view', edit: 'shipment.tab.port_customs.milestone_4.edit' },
    customsClearance: { view: 'shipment.tab.port_customs.milestone_5.view', edit: 'shipment.tab.port_customs.milestone_5.edit' },
    municipality: { view: 'shipment.tab.port_customs.milestone_6.view', edit: 'shipment.tab.port_customs.milestone_6.edit' },
    customerInspection: { view: 'shipment.tab.port_customs.milestone_6.view', edit: 'shipment.tab.port_customs.milestone_6.edit' },
    transportation: { view: 'shipment.tab.port_customs.transportation.view', edit: 'shipment.tab.port_customs.transportation.edit' },
  };

  /** Options for the Transport Company Name dropdown */
  readonly transportCompanyOptions = signal<Array<{ label: string; value: string }>>([]);

  /**
   * A row is considered "fully submitted" (locked for editing) only when
   * Storage Allocation & Arrival (step 5) has been completed for that row.
   * Until then, Port and Clearance sections remain editable.
   */
  readonly submittedIndices = toSignal(this.store.select(selectSubmittedStep5Indices), { initialValue: [] });
  readonly submittedLogisticsIndices = toSignal(this.store.select(selectSubmittedStep4Indices), { initialValue: [] });
  readonly precedingIndices = toSignal(this.store.select(selectSubmittedStep3Indices), { initialValue: [] });
  readonly submittingRowIndex = toSignal(this.store.select(selectSubmittingRowIndex), { initialValue: null });

  constructor() {
    effect(() => {
      const indices = this.submittedIndices();
      if (!this.formArray) return;
      indices.forEach((idx) => {
        if (!this.formArray.at(idx)) return;
        if (this.canOverrideSubmittedLocks()) {
          this.formArray.at(idx).enable({ emitEvent: false });
          return;
        }
        this.formArray.at(idx).disable({ emitEvent: false });
      });
    });

    // Load active transportation companies for the dropdown
    this.transportationCompanyService.getAll().subscribe({
      next: (companies) => {
        const options = companies
          .filter((c) => c.status === 'Active')
          .map((c) => ({ label: c.name, value: c.name }));
        this.transportCompanyOptions.set(options);
      },
    });

    // Load warehouse options
    this.warehouseService.getWarehouses().subscribe((whs) => {
      const activeWarehouses = whs
        .filter((w: any) => w.status === 'Active')
        .map((w: any) => {
          const codeSuffix = w.code ? ` - ${w.code}` : '';
          const label = `${w.name}${codeSuffix}`;
          return { label, value: label };
        });
      this.warehouseOptions.set(activeWarehouses);
    });

    effect(() => {
      const data = this.shipmentData();
      if (!data || !this.formArray) return;
      
      // 1. Sync all locks first in one atomic update
      this.syncAllSectionLocks();
      
      // 2. Perform updates that don't depend on lockedSections signal
      this.formArray.controls.forEach((_, index) => {
        this.updateDerivedDates(index);
        this.updateDelayHours(index);
        this.setTransportationDefaults(index);
      });
    });

    effect(() => {
      // 3. Apply locks to form controls whenever lockedSections OR submittedIndices change
      this.lockedSections(); 
      this.submittedIndices();
      if (!this.formArray) return;
      this.formArray.controls.forEach((_, index) => {
        this.applySectionLocks(index);
        this.setTransportationDefaults(index);
      });
    });

    effect(() => {
      const shipmentId = this.shipmentData()?.shipment?._id;
      if (!shipmentId || !this.formArray) return;
      this.restoreUiState();
    });
  }

  private setTransportationDefaults(index: number): void {
    const group = this.formArray.at(index);
    if (!group) return;
    const transportation = this.getTransportationRows(group);
    if (!transportation) return;

    const now = new Date();
    transportation.controls.forEach((row) => {
      if (!row.get('bookedDate')?.value) {
        row.get('bookedDate')?.patchValue(now, { emitEvent: false });
      }
      if (!row.get('bookingTime')?.value) {
        row.get('bookingTime')?.patchValue(now, { emitEvent: false });
      }
      if (!row.get('transportDate')?.value) {
        row.get('transportDate')?.patchValue(now, { emitEvent: false });
      }
      if (!row.get('transportTime')?.value) {
        row.get('transportTime')?.patchValue(now, { emitEvent: false });
      }
    });
  }

  ngOnDestroy(): void {
    this.stopExtractionExperience();
  }

  private startExtractionExperience(): void {
    this.stopExtractionExperience();
    this.extractionMessageIndex.set(0);
    this.extractionProgress.set(18);
    this.extractionTicker = setInterval(() => {
      this.extractionMessageIndex.update((index) => (index + 1) % this.extractionMessages.length);
      this.extractionProgress.update((value) => {
        if (value >= 88) return 26;
        return value + 12;
      });
    }, 1600);
  }

  private stopExtractionExperience(): void {
    if (this.extractionTicker) {
      clearInterval(this.extractionTicker);
      this.extractionTicker = null;
    }
  }

  getShipmentNoLabel(index: number): string {
    if (this.formArray?.controls[index] == null) return '–';
    const base = this.shipmentData()?.shipment?.shipmentNo?.replace(/\([^)]*\)/g, '').trim();
    return base?.trim() ? `${base}-${index + 1}` : '–';
  }

  isRowSubmitted(index: number): boolean {
    return this.submittedIndices().includes(index);
  }

  private canOverrideSubmittedLocks(): boolean {
    return this.authService.isAdminLevelRole();
  }

  /**
   * Returns true if the user has explicit view + edit permission for this section.
   * This overrides the row-level submitted lock for that specific section.
   */
  private hasSectionPermission(section: LogisticsSectionKey): boolean {
    const permission = this.logisticsPermissionMap[section];
    return !!permission &&
      this.rbacService.hasPermission(permission.view) &&
      this.rbacService.hasPermission(permission.edit);
  }

  canViewLogisticsSection(section: LogisticsSectionKey): boolean {
    if (this.canOverrideSubmittedLocks()) return true;
    const permission = this.logisticsPermissionMap[section];
    return permission ? this.rbacService.hasPermission(permission.view) : false;
  }

  canEditLogisticsSection(section: LogisticsSectionKey): boolean {
    if (this.canOverrideSubmittedLocks()) return true;
    return this.hasSectionPermission(section);
  }

  getLogisticsSectionLabel(section: LogisticsSectionKey): string {
    return section === 'arrivalNotice'
      ? 'Port and Clearance'
      : section === 'advanceRequest'
        ? 'Advance Received'
        : section === 'doReleased'
          ? 'DO Released'
          : section === 'boePassingDate'
            ? 'BOE Passing / DP Invoice'
            : section === 'customsClearance'
              ? 'Customs Clearance'
              : section === 'municipality'
                ? 'Municipality Clearance Application'
                : 'Transportation Arranged';
  }

  getLogisticsSectionOrder(section: LogisticsSectionKey): number {
    const order: Record<LogisticsSectionKey, number> = {
      portClearance: 1,
      arrivalNotice: 1,
      advanceRequest: 2,
      doReleased: 2,
      boePassingDate: 2,
      municipality: 2,
      customerInspection: 2,
      customsClearance: 3,
      transportation: 4,
    };
    return order[section] || 99;
  }

  getLogisticsMilestoneNumber(section: LogisticsSectionKey): number {
    return this.getLogisticsSectionOrder(section);
  }

  isRowEditLocked(index: number): boolean {
    return this.isRowSubmitted(index) && !this.canOverrideSubmittedLocks();
  }

  /**
   * Returns true if the edit button/action for a specific section should be disabled.
   * If the user has explicit view+edit permission for the section, the row-level
   * submitted lock is bypassed for that section.
   */
  isSectionEditLocked(index: number, section: LogisticsSectionKey): boolean {
    if (this.hasSectionPermission(section)) return false;
    return this.isRowEditLocked(index);
  }

  isPrecedingSubmitted(index: number): boolean {
    return this.isDocumentTrackerComplete(index) || this.precedingIndices().includes(index);
  }

  private isDocumentTrackerComplete(index: number): boolean {
    const shipment = this.shipmentData()?.actual?.[index];
    if (!shipment) return false;

    return isDocumentationCompleteForCurrentFlow(shipment);
  }

  getTransportationRows(group: AbstractControl): FormArray {
    return group.get('transportationBooked') as FormArray;
  }

  getTransportationContainerCount(group: AbstractControl): number {
    return this.getTransportationRows(group).length;
  }

  getVisibleTransportationRows(group: AbstractControl, index: number): AbstractControl[] {
    const rows = this.getTransportationRows(group).controls;
    return this.expandedTransportation()[index] ? rows : rows.slice(0, 5);
  }

  hasHiddenTransportationRows(group: AbstractControl): boolean {
    return this.getTransportationRows(group).length > 5;
  }

  toggleTransportation(index: number): void {
    this.expandedTransportation.update((cur) => ({ ...cur, [index]: !cur[index] }));
  }

  getTransactionGroups(group: AbstractControl): Array<{ transactionId: string; rows: any[] }> {
    const allRows = this.getTransportationRows(group).getRawValue() || [];
    const grouped: Record<string, any[]> = {};
    const order: string[] = [];

    // Only containers that belong to a saved transaction appear. A transaction is created
    // when containers are submitted together via "Manage Shipments" (shared transactionId).
    allRows.forEach((row: any) => {
      const txnId = (row.transactionId || '').trim();
      if (!txnId) return;
      if (!grouped[txnId]) {
        grouped[txnId] = [];
        order.push(txnId);
      }
      grouped[txnId].push(row);
    });

    return order.map((transactionId) => ({ transactionId, rows: grouped[transactionId] }));
  }

  getTransactionDisplayRow(transaction: { transactionId: string; rows: any[] }): any {
    return transaction.rows[0] || {};
  }

  openTransactionDetailModal(transaction: { transactionId: string; rows: any[] }): void {
    this.selectedTransactionData.set(transaction);
    this.transactionDetailModalVisible.set(true);
  }

  closeTransactionDetailModal(): void {
    this.transactionDetailModalVisible.set(false);
    this.selectedTransactionData.set(null);
  }

  getFileSignal(kind: Step5DocKind): ReturnType<typeof signal<Record<number, File | null>>> {
    switch (kind) {
      case 'arrivalNotice':
        return this.arrivalNoticeFile;
      case 'advanceRequest':
        return this.advanceRequestFile;
      case 'doReleased':
        return this.doReleasedFile;
      case 'boePassingDate':
        return this.boePassingDateFile;
      case 'customsClearance':
        return this.customsClearanceFile;
      case 'municipality':
        return this.municipalityFile;
      case 'portClearance':
        return this.commercialDocumentFile;
      case 'customerInspection':
        return this.customerInspectionFile;
    }
  }

  getFile(containerIndex: number, kind: Step5DocKind): File | null {
    return this.getFileSignal(kind)()?.[containerIndex] ?? null;
  }

  clickFileInput(index: number, kind: Step5DocKind): void {
    if (this.isRowEditLocked(index)) return;
    this.pendingFileRow = index;
    this.pendingDocKind = kind;

    const refs: Partial<Record<Step5DocKind, ElementRef<HTMLInputElement> | undefined>> = {
      arrivalNotice: this.arrivalNoticeInputRef,
      advanceRequest: this.advanceRequestInputRef,
      doReleased: this.doReleasedInputRef,
      boePassingDate: this.boePassingDateInputRef,
      customsClearance: this.customsClearanceInputRef,
      municipality: this.municipalityInputRef,
    };
    refs[kind]?.nativeElement?.click();
  }

  onFileInputChange(event: Event, kind: Step5DocKind): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const row = this.pendingFileRow;
    if (row !== null && this.pendingDocKind === kind && file) {
      this.getFileSignal(kind).update((cur) => ({ ...cur, [row]: file }));
      if (kind === 'arrivalNotice') {
        this.extractArrivalNotice(row, file);
      }
    }
    this.pendingFileRow = null;
    this.pendingDocKind = null;
    input.value = '';
  }

  clickDpInvoiceFileInput(index: number): void {
    if (this.isRowEditLocked(index) || this.isLogisticsSectionLocked(index, 'boePassingDate')) return;
    this.pendingFileRow = index;
    this.dpInvoiceInputRef?.nativeElement?.click();
  }

  onDpInvoiceInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const row = this.pendingFileRow;
    if (row !== null && file) {
      this.dpInvoiceFile.update((cur) => ({ ...cur, [row]: file }));
      this.extractDpwCargo(row, file);
    }
    this.pendingFileRow = null;
    input.value = '';
  }

  getDpInvoiceFile(containerIndex: number): File | null {
    return this.dpInvoiceFile()?.[containerIndex] ?? null;
  }

  clearDpInvoiceFile(containerIndex: number): void {
    this.dpInvoiceFile.update((cur) => ({ ...cur, [containerIndex]: null }));
    this.formArray.at(containerIndex)?.patchValue({
      dpwCargoExtraction: null,
    }, { emitEvent: false });
  }

  clickMunicipalityCertificateFileInput(index: number): void {
    if (this.isRowEditLocked(index) || this.isLogisticsSectionLocked(index, 'municipality')) return;
    this.pendingFileRow = index;
    this.municipalityCertificateInputRef?.nativeElement?.click();
  }

  onMunicipalityCertificateInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const row = this.pendingFileRow;
    if (row !== null && file) {
      this.municipalityCertificateFile.update((cur) => ({ ...cur, [row]: file }));
    }
    this.pendingFileRow = null;
    input.value = '';
  }

  getMunicipalityCertificateFile(containerIndex: number): File | null {
    return this.municipalityCertificateFile()?.[containerIndex] ?? null;
  }

  clearMunicipalityCertificateFile(containerIndex: number): void {
    this.municipalityCertificateFile.update((cur) => ({ ...cur, [containerIndex]: null }));
  }

  clearFile(containerIndex: number, kind: Step5DocKind): void {
    this.getFileSignal(kind).update((cur) => ({ ...cur, [containerIndex]: null }));
  }

  getSavedFileUrl(group: AbstractControl, kind: Step5DocKind): string {
    const map: Partial<Record<Step5DocKind, string>> = {
      arrivalNotice: 'arrivalNoticeDocumentUrl',
      advanceRequest: 'advanceRequestDocumentUrl',
      doReleased: 'doReleasedDocumentUrl',
      boePassingDate: 'boePassingDocumentUrl',
      customsClearance: 'customsClearanceDocumentUrl',
      municipality: 'municipalityDocumentUrl',
      portClearance: 'commercialDocumentDocumentUrl',
      customerInspection: 'customerInspectionDocumentUrl',
    };
    return group.get(map[kind] ?? '')?.value || '';
  }

  getSavedFileName(group: AbstractControl, kind: Step5DocKind): string {
    const map: Partial<Record<Step5DocKind, string>> = {
      arrivalNotice: 'arrivalNoticeDocumentName',
      advanceRequest: 'advanceRequestDocumentName',
      doReleased: 'doReleasedDocumentName',
      boePassingDate: 'boePassingDocumentName',
      customsClearance: 'customsClearanceDocumentName',
      municipality: 'municipalityDocumentName',
      portClearance: 'commercialDocumentDocumentName',
      customerInspection: 'customerInspectionDocumentName',
    };
    return group.get(map[kind] ?? '')?.value || '';
  }

  openRemoteDocumentPreview(url: string, title: string): void {
    this.previewUrl.set(url);
    this.previewTitle.set(title);
    this.previewIsImage.set(/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  openDocumentPreview(file: File, title: string): void {
    this.previewUrl.set(URL.createObjectURL(file));
    this.previewTitle.set(title);
    this.previewIsImage.set(file.type.startsWith('image/'));
    this.resetPreviewZoom();
    this.showPreviewModal.set(true);
  }

  closeDocumentPreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.previewTitle.set('');
    this.resetPreviewZoom();
    this.showPreviewModal.set(false);
  }

  onPreviewVisibleChange(visible: boolean): void {
    if (!visible) this.closeDocumentPreview();
  }

  zoomInPreview(): void {
    this.previewZoom.update((zoom) => Math.min(zoom + 0.25, 4));
  }

  zoomOutPreview(): void {
    this.previewZoom.update((zoom) => Math.max(zoom - 0.25, 1));
  }

  resetPreviewZoom(): void {
    this.previewZoom.set(1);
    this.previewTransformOrigin.set('center center');
  }

  onPreviewImageDoubleClick(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.previewTransformOrigin.set(`${x}% ${y}%`);
    this.previewZoom.update((zoom) => (zoom > 1 ? 1 : 2));
  }

  onArrivalDateChange(index: number): void {
    this.updateDerivedDates(index);
  }

  onTransportationTimeChange(index: number): void {
    const group = this.formArray.at(index);
    if (!group) return;
    const transportation = this.getTransportationRows(group);
    
    transportation.controls.forEach((row) => {
      const bookedDate = row.get('bookedDate')?.value;
      const transportDate = row.get('transportDate')?.value;
      
      if (bookedDate && transportDate) {
        const bd = new Date(bookedDate);
        bd.setHours(0, 0, 0, 0);
        const td = new Date(transportDate);
        td.setHours(0, 0, 0, 0);
        
        if (td < bd) {
          this.notificationService.warn('Invalid Date', 'Transportation date cannot be earlier than arranged date.');
          row.get('transportDate')?.patchValue(bookedDate, { emitEvent: false });
        } else if (td.getTime() === bd.getTime()) {
          const bt = row.get('bookingTime')?.value;
          const tt = row.get('transportTime')?.value;
          if (bt && tt) {
            const bTime = new Date(bt).getHours() * 60 + new Date(bt).getMinutes();
            const tTime = new Date(tt).getHours() * 60 + new Date(tt).getMinutes();
            if (tTime < bTime) {
              this.notificationService.warn('Invalid Time', 'Transportation time cannot be earlier than booking time on the same day.');
              row.get('transportTime')?.patchValue(bt, { emitEvent: false });
            }
          }
        }
      }
    });

    this.updateDelayHours(index);
  }

  confirmSubmit(index: number): void {
    const row = this.formArray.at(index);
    if (row.invalid || !this.isPrecedingSubmitted(index)) return;

    this.confirmationService.confirm({
      message: `Submit Port and Clearance for Shipment #${index + 1}?`,
      header: 'Submit Clearance Tracker',
      accept: () => {
        const formValue = row.getRawValue();
        const containerId = formValue['containerId'];
        if (!containerId) return;

        const toDate = (val: unknown) => (val ? new Date(val as Date).toISOString().split('T')[0] : '');

        this.updateDerivedDates(index);
        this.updateDelayHours(index);

        const transportationBooked = this.buildTransportationBookedPayload(row);

        const payload = new FormData();
        payload.append('arrivalOn', toDate(formValue['arrivalOn']));
        payload.append('shipmentFreeRetentionDate', toDate(formValue['shipmentFreeRetentionDate']));
        payload.append('maximumRetentionDate', toDate(formValue['maximumRetentionDate']));
        payload.append('arrivalNoticeDate', toDate(formValue['arrivalNoticeDate']));
        payload.append('arrivalNoticeFreeRetentionDays', String(formValue['arrivalNoticeFreeRetentionDays'] ?? ''));
        payload.append('customClearanceRequired', String(formValue['customClearanceRequired'] === true));
        payload.append('advanceRequestDate', toDate(formValue['advanceRequestDate']));
        payload.append('doReleasedDate', toDate(formValue['doReleasedDate']));
        payload.append('doReleasedRemarks', formValue['doReleasedRemarks'] || '');
        payload.append('boePassingDate', toDate(formValue['boePassingDate']));
        payload.append('boePassingRemarks', formValue['boePassingRemarks'] || '');
        payload.append('dmBarcode', formValue['dmBarcode'] || '');
        payload.append('dpwCargoExtraction', JSON.stringify(formValue['dpwCargoExtraction'] || null));
        payload.append('customsClearanceDate', toDate(formValue['customsClearanceDate']));
        payload.append('customsClearanceRemarks', formValue['customsClearanceRemarks'] || '');
        payload.append('municipalityDate', toDate(formValue['municipalityDate']));
        payload.append('municipalityRemarks', formValue['municipalityRemarks'] || '');
        payload.append('municipalityStatus', formValue['municipalityStatus'] || 'open');
        payload.append('municipalityStatusComment', formValue['municipalityStatusComment'] || '');
        payload.append('transportationBooked', JSON.stringify(transportationBooked));

        const fileMap: Array<[Step5DocKind, string]> = [
          ['arrivalNotice', 'arrivalNoticeDocument'],
          ['advanceRequest', 'advanceRequestDocument'],
          ['doReleased', 'doReleasedDocument'],
          ['boePassingDate', 'boePassingDocument'],
          ['customsClearance', 'customsClearanceDocument'],
          ['municipality', 'municipalityDocument'],
        ];
        fileMap.forEach(([kind, key]) => {
          const file = this.getFile(index, kind);
          if (file) payload.append(key, file, file.name);
        });
        const dpInvoice = this.getDpInvoiceFile(index);
        if (dpInvoice) payload.append('dpInvoiceDocument', dpInvoice, dpInvoice.name);
        const certificate = this.getMunicipalityCertificateFile(index);
        if (certificate) payload.append('municipalityClearanceCertificate', certificate, certificate.name);

        this.store.dispatch(
          ShipmentActions.submitLogistics({
            containerId,
            index,
            payload,
          })
        );
      },
    });
  }

  isSectionSaving(index: number, section: LogisticsSectionKey): boolean {
    return this.sectionSavingKey() === `${section}-${index}`;
  }

  private sectionKey(index: number, section: LogisticsSectionKey): string {
    return `${index}:${section}`;
  }

  isLogisticsSectionLocked(index: number, section: LogisticsSectionKey): boolean {
    // If the user has explicit view+edit permission for this section, the row-level
    // submitted lock does not apply — only the section's own save-lock matters.
    const rowLocked = this.hasSectionPermission(section)
      ? false
      : this.isRowEditLocked(index);
    return rowLocked || !this.canEditLogisticsSection(section) || !!this.lockedSections()[this.sectionKey(index, section)];
  }

  isCustomClearanceRequired(index: number): boolean {
    return this.formArray.at(index)?.get('customClearanceRequired')?.value === true;
  }

  isMunicipalityClosed(group: AbstractControl): boolean {
    return String(group.get('municipalityStatus')?.value || 'open').toLowerCase() === 'closed';
  }

  isPortCustomsLocked(index: number): boolean {
    return this.isLogisticsSectionLocked(index, 'arrivalNotice');
  }

  isTransportationLocked(index: number): boolean {
    return this.isLogisticsSectionLocked(index, 'transportation');
  }

  private getRequiredCustomsDocTypes(): CustomsDocType[] {
    return ['boe', 'do', 'blOriginal', 'invoice', 'packingList'];
  }

  private hasCustomsSubmissionDocument(group: AbstractControl, index: number, docType: CustomsDocType): boolean {
    return !!this.getCustomsDocFile(index, docType) || !!this.getSavedCustomsDocUrl(group, docType);
  }

  private validateCustomsClearanceSection(index: number, group: AbstractControl): string[] {
    const missingFields: string[] = [];
    if (!this.isCustomClearanceRequired(index)) {
      return missingFields;
    }
    if (!group.get('customsClearanceDate')?.value) {
      missingFields.push('Customs Clearance Date');
    }
    return missingFields;
  }

  private validateTransportationSection(group: AbstractControl): string[] {
    const missingFields: string[] = [];
    return missingFields;
  }

  private validateBoePassingSection(index: number, group: AbstractControl): string[] {
    const missingFields: string[] = [];
    // DP Invoice is optional and currently hidden — only enforce it when the upload is shown.
    if (this.showDpInvoiceUpload && !this.getDpInvoiceFile(index) && !String(group.get('dpInvoiceDocumentUrl')?.value || '').trim()) {
      missingFields.push('DP Invoice');
    }
    return missingFields;
  }

  private validateMunicipalitySection(group: AbstractControl): string[] {
    const missingFields: string[] = [];
    if (!group.get('municipalityDate')?.value) {
      missingFields.push('Municipality Clearance Application Date');
    }
    const status = String(group.get('municipalityStatus')?.value || 'open').toLowerCase();
    if (!status) {
      missingFields.push('Status');
    }
    return missingFields;
  }

  private appendCustomsSubmissionDocuments(index: number, payload: FormData): void {
    const docMap: Record<CustomsDocType, string> = {
      boe: 'customsDocBoe',
      do: 'customsDocDo',
      blOriginal: 'customsDocBl',
      invoice: 'customsDocInvoice',
      packingList: 'customsDocPackingList',
      coo: 'customsDocCoo',
    };

    this.getRequiredCustomsDocTypes().forEach((docType) => {
      const file = this.getCustomsDocFile(index, docType);
      if (file) {
        payload.append(docMap[docType], file, file.name);
      }
    });
  }

  unlockLogisticsSection(index: number, section: LogisticsSectionKey): void {
    const rowLocked = this.hasSectionPermission(section) ? false : this.isRowEditLocked(index);
    if (rowLocked || !this.canEditLogisticsSection(section)) return;
    this.lockedSections.update((current) => ({
      ...current,
      [this.sectionKey(index, section)]: false,
    }));
    this.applySectionLocks(index);
  }

  async saveLogisticsSection(index: number, section: LogisticsSectionKey): Promise<void> {
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    if (!group || !containerId || !this.canEditLogisticsSection(section) || this.isLogisticsSectionLocked(index, section)) return;
    this.ensureAccordionOpen(index);

    if (section === 'customsClearance') {
      const missingFields = this.validateCustomsClearanceSection(index, group);
      if (missingFields.length) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    if (section === 'boePassingDate') {
      const missingFields = this.validateBoePassingSection(index, group);
      if (missingFields.length) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    if (section === 'municipality') {
      const missingFields = this.validateMunicipalitySection(group);
      if (missingFields.length) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
    }

    const sectionLabel = section === 'transportation'
      ? 'Transportation Arranged'
      : this.step5DocConfig.find((doc) => doc.kind === section)?.label || section;

    const confirmed = await this.confirmDialog.ask({
      message: `Save ${sectionLabel} for Shipment ${index + 1}?`,
      header: 'Save Section',
      acceptLabel: 'Yes, Save',
    });
    if (!confirmed) return;

    const toDate = (val: unknown) => (val ? new Date(val as Date).toISOString().split('T')[0] : '');
    const payload = new FormData();
    payload.append('sectionKey', section);
    payload.append('customClearanceRequired', String(this.isCustomClearanceRequired(index)));

    if (section === 'portClearance') {
      payload.append('commercialDocumentReceivedDate', toDate(group.get('commercialDocumentReceivedDate')?.value));
      payload.append('arrivalOn', toDate(group.get('arrivalOn')?.value));
      payload.append('freeDetentionDays', String(group.get('freeDetentionDays')?.value ?? 10));
      payload.append('freeStorageDays', String(group.get('freeStorageDays')?.value ?? 14));
      payload.append('clearanceRemarks', group.get('clearanceRemarks')?.value || '');
      const commercialDoc = this.getCommercialDocumentFile(index);
      if (commercialDoc) payload.append('commercialDocument', commercialDoc, commercialDoc.name);
    } else if (section === 'customerInspection') {
      payload.append('customerInspectionDate', toDate(group.get('customerInspectionDate')?.value));
      payload.append('customerInspectionStatus', group.get('customerInspectionStatus')?.value || '');
      payload.append('customerInspectionComments', group.get('customerInspectionComments')?.value || '');
      const inspectionFile = this.getCustomerInspectionFile(index);
      if (inspectionFile) payload.append('customerInspectionDocument', inspectionFile, inspectionFile.name);
    } else if (section === 'transportation') {
      const missingFields = this.validateTransportationSection(group);
      if (missingFields.length) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Required Fields Missing',
          detail: `Please complete: ${missingFields.join(', ')}`,
        });
        return;
      }
      const transportationRows = this.getTransportationRows(group);
      transportationRows.markAllAsTouched();
      if (transportationRows.invalid) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Invalid transportation timing',
          detail: 'Transportation date and time must be the same as or later than the arranged date and booking time.',
        });
        return;
      }

      // Validate that all transport companies are selected
      const transportationData = transportationRows.getRawValue();
      const missingCompany = transportationData.some((tb: any) => !tb.transportCompanyName || tb.transportCompanyName.trim() === '');
      if (missingCompany) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Transport Company Required',
          detail: 'Please select a transport company for all containers before saving.',
        });
        return;
      }

      this.updateDelayHours(index);
      const transportationBooked = this.buildTransportationBookedPayload(group);
      payload.append('transportationBooked', JSON.stringify(transportationBooked));
    } else if (section === 'arrivalNotice') {
      this.updateDerivedDates(index);
      payload.append('arrivalOn', toDate(group.get('arrivalOn')?.value));
      payload.append('shipmentFreeRetentionDate', toDate(group.get('shipmentFreeRetentionDate')?.value));
      payload.append('maximumRetentionDate', toDate(group.get('maximumRetentionDate')?.value));
      payload.append('arrivalNoticeDate', toDate(group.get('arrivalNoticeDate')?.value));
      payload.append('arrivalNoticeFreeRetentionDays', String(group.get('arrivalNoticeFreeRetentionDays')?.value ?? ''));
      const file = this.getFile(index, 'arrivalNotice');
      if (file) payload.append('arrivalNoticeDocument', file, file.name);
    } else if (['advanceRequest', 'doReleased', 'boePassingDate', 'customsClearance', 'municipality'].includes(section)) {
      const sectionMap = {
        advanceRequest: { date: 'advanceRequestDate', remarks: null, file: 'advanceRequestDocument' },
        doReleased: { date: 'doReleasedDate', remarks: 'doReleasedRemarks', file: 'doReleasedDocument' },
        boePassingDate: { date: 'boePassingDate', remarks: 'boePassingRemarks', file: 'boePassingDocument' },
        customsClearance: { date: 'customsClearanceDate', remarks: 'customsClearanceRemarks', file: 'customsClearanceDocument' },
        municipality: { date: 'municipalityDate', remarks: 'municipalityRemarks', file: 'municipalityDocument' },
      } as const;
      const config = (sectionMap as any)[section] as { date: string; remarks: string | null; file: string };
      payload.append(config.date, toDate(group.get(config.date)?.value));
      if (config.remarks) payload.append(config.remarks, group.get(config.remarks)?.value || '');
      if (section === 'boePassingDate') {
        payload.append('dmBarcode', group.get('dmBarcode')?.value || '');
        payload.append('dpwCargoExtraction', JSON.stringify(group.get('dpwCargoExtraction')?.value || null));
        const dpInvoice = this.getDpInvoiceFile(index);
        if (dpInvoice) payload.append('dpInvoiceDocument', dpInvoice, dpInvoice.name);
      }
      if (section === 'customsClearance') {
        if (this.isCustomClearanceRequired(index)) {
          this.appendCustomsSubmissionDocuments(index, payload);
        }
      }
      if (section === 'municipality') {
        payload.append('municipalityStatus', group.get('municipalityStatus')?.value || 'open');
        payload.append('municipalityStatusComment', group.get('municipalityStatusComment')?.value || '');
        payload.append('municipalityReleasedDate', toDate(group.get('municipalityReleasedDate')?.value));
        payload.append('municipalityResponseRemarks', group.get('municipalityResponseRemarks')?.value || '');
        payload.append('municipalityComments', group.get('municipalityComments')?.value || '');
        const certificate = this.getMunicipalityCertificateFile(index);
        if (certificate) payload.append('municipalityClearanceCertificate', certificate, certificate.name);
      }
      if (section === 'doReleased') {
        payload.append('doRemarks', group.get('doRemarks')?.value || '');
      }
      if (section === 'boePassingDate') {
        payload.append('customerInspectionRequired', String(group.get('customerInspectionRequired')?.value === true));
      }
      const file = this.getFile(index, section as Step5DocKind);
      if (file) payload.append(config.file, file, file.name);
    }

    console.log(`📡 [ShipmentArrival] Saving section "${section}" for container ${containerId}`);
    payload.forEach((value, key) => {
      console.log(`   🔸 ${key}:`, value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value);
    });

    this.sectionSavingKey.set(`${section}-${index}`);
    this.shipmentService.submitLogistics(containerId, payload).subscribe({
      next: (response) => {
        this.sectionSavingKey.set(null);
        const actual = response?.container?.actual || null;
        if (actual) {
          this.patchSavedSection(index, section, actual);
        }
        this.clearTransientSectionFiles(index, section);
        this.lockedSections.update((current) => ({
          ...current,
          [this.sectionKey(index, section)]: true,
        }));
        if (actual?.lockedLogisticsSections) {
          this.syncRowSectionLocks(index, actual.lockedLogisticsSections);
        }
        this.applySectionLocks(index);
        if (this.isLogisticsRowComplete(actual || group.getRawValue()) && !this.submittedLogisticsIndices().includes(index)) {
          this.store.dispatch(ShipmentActions.submitLogisticsSuccess({ index }));
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: `${section === 'transportation' ? 'Transportation arranged' : this.step5DocConfig.find((doc) => doc.kind === section)?.label || 'Section'} saved successfully.`,
        });
      },
      error: (error) => {
        this.sectionSavingKey.set(null);
        this.messageService.add({
          severity: 'error',
          summary: 'Save failed',
          detail: error.error?.message || 'Could not save this section.',
        });
      }
    });
  }

  savePortCustomsSection(index: number): void {
    this.saveLogisticsSection(index, 'arrivalNotice');
  }

  saveTransportationSection(index: number): void {
    this.saveLogisticsSection(index, 'transportation');
  }

  private updateDerivedDates(index: number): void {
    const group = this.formArray.at(index);
    const arrivalOn = group?.get('arrivalOn')?.value;
    if (!group || !arrivalOn) {
      group?.get('shipmentFreeRetentionDate')?.patchValue(null, { emitEvent: false });
      group?.get('maximumRetentionDate')?.patchValue(null, { emitEvent: false });
      return;
    }

    const actualData = this.shipmentData()?.actual?.[index];
    const freeDays =
      Number(group.get('arrivalNoticeFreeRetentionDays')?.value ?? 0) ||
      Number(actualData?.freeDetentionDays ?? 0) ||
      0;
    const maxDays = Number(actualData?.maximumDetentionDays ?? 0) || 0;

    // POINT 12: Port Free Retention Date = arrival + free days (from document)
    const freeRetentionDate = this.addDays(arrivalOn, freeDays);
    group.get('shipmentFreeRetentionDate')?.patchValue(freeRetentionDate, { emitEvent: false });

    // POINT 12: Port Free Retention Date (maximumRetentionDate field) = arrival + 10 days (always fixed)
    const portFreeRetentionDate = this.addDays(arrivalOn, 10);
    group.get('maximumRetentionDate')?.patchValue(portFreeRetentionDate, { emitEvent: false });

  }

  private updateDelayHours(index: number): void {
    const group = this.formArray.at(index);
    const storageGroup = (this.shipmentData()?.actual?.[index] as any)?.storageSplits || [];
    this.getTransportationRows(group).controls.forEach((row) => {
      const serial = row.get('containerSerialNo')?.value;
      const storageMatch = storageGroup.find((item: any) => item.containerSerialNo === serial);
      const delayHours = this.calculateDelayHours(
        row.get('transportDate')?.value,
        row.get('transportTime')?.value,
        storageMatch?.receivedOnDate,
        storageMatch?.receivedOnTime
      );
      row.get('delayHours')?.patchValue(delayHours, { emitEvent: false });
      });
  }

  private extractArrivalNotice(index: number, file: File): void {
    const formData = new FormData();
    formData.append('file', file, file.name);
    this.extractingArrivalNoticeRowIndex.set(index);
    this.startExtractionExperience();
    this.shipmentService.extractArrivalNoticeFromDocument(formData).subscribe({
      next: (res) => {
        this.extractingArrivalNoticeRowIndex.set(null);
        this.stopExtractionExperience();
        const group = this.formArray.at(index);
        if (!group) return;

        // POINT 12: Arrival Notice Date = print_date on the document (not arrival_on)
        // print_date is the date the document was printed/issued
        const printDate = res.print_date || res.printed_date || res.issue_date;
        if (printDate) {
          const parsedPrintDate = this.parseApiDate(printDate);
          group.get('arrivalNoticeDate')?.setValue(parsedPrintDate);
        }

        // arrivalOn = actual vessel arrival date (separate from print date)
        if (res.arrival_on) {
          const parsedArrivalOn = this.parseApiDate(res.arrival_on);
          group.get('arrivalOn')?.setValue(parsedArrivalOn);
        }

        if (res.free_retension_days != null) {
          group.get('arrivalNoticeFreeRetentionDays')?.setValue(Number(res.free_retension_days) || 0);
        }
        this.updateDerivedDates(index);
        group.updateValueAndValidity({ emitEvent: false });
        this.messageService.add({
          severity: 'success',
          summary: 'Arrival notice extracted',
          detail: 'Arrival date and free retention days were populated from the uploaded document.'
        });
      },
      error: (err) => {
        this.extractingArrivalNoticeRowIndex.set(null);
        this.stopExtractionExperience();
        this.messageService.add({
          severity: 'warn',
          summary: 'Arrival notice extraction failed',
          detail: err.error?.message || 'We could not extract arrival details from the uploaded document.'
        });
      }
    });
  }

  private extractDpwCargo(index: number, file: File): void {
    const formData = new FormData();
    formData.append('file', file, file.name);
    this.extractingDpwCargoRowIndex.set(index);
    this.startExtractionExperience();
    this.shipmentService.extractDpwCargo(formData).subscribe({
      next: (res) => {
        this.extractingDpwCargoRowIndex.set(null);
        this.stopExtractionExperience();
        const group = this.formArray.at(index);
        if (!group) return;

        group.get('dpwCargoExtraction')?.setValue(res);
        this.activeDpwExtractionRowIndex.set(index);
        this.activeDpwExtraction.set(res);
        this.dpwExtractionDialogVisible.set(true);
        this.messageService.add({
          severity: res.error ? 'warn' : 'success',
          summary: res.error ? 'DP invoice extracted with warnings' : 'DP invoice extracted',
          detail: res.error || 'Review the extracted container storage dates before applying.',
        });
      },
      error: (err) => {
        this.extractingDpwCargoRowIndex.set(null);
        this.stopExtractionExperience();
        const normalized = err.error as ExtractDpwCargoResponse | undefined;
        if (normalized) {
          this.formArray.at(index)?.get('dpwCargoExtraction')?.setValue(normalized);
          this.activeDpwExtractionRowIndex.set(index);
          this.activeDpwExtraction.set(normalized);
          this.dpwExtractionDialogVisible.set(true);
        }
        this.messageService.add({
          severity: 'warn',
          summary: 'DP invoice extraction failed',
          detail: normalized?.error || err.error?.message || 'We could not extract DPW cargo details from the uploaded invoice.',
        });
      }
    });
  }

  openSavedDpwExtraction(index: number): void {
    const extraction = this.formArray.at(index)?.get('dpwCargoExtraction')?.value as ExtractDpwCargoResponse | null;
    if (!extraction) return;
    this.activeDpwExtractionRowIndex.set(index);
    this.activeDpwExtraction.set(extraction);
    this.dpwExtractionDialogVisible.set(true);
  }

  closeDpwExtractionDialog(): void {
    this.dpwExtractionDialogVisible.set(false);
    this.activeDpwExtractionRowIndex.set(null);
    this.activeDpwExtraction.set(null);
  }

  applyActiveDpwExtraction(): void {
    const index = this.activeDpwExtractionRowIndex();
    const extraction = this.activeDpwExtraction();
    if (index === null || !extraction) return;
    const patchedCount = this.applyDpwExtractionToTransportationRows(index, extraction);
    this.closeDpwExtractionDialog();
    this.messageService.add({
      severity: patchedCount > 0 ? 'success' : 'info',
      summary: patchedCount > 0 ? 'Dates applied' : 'No matching containers',
      detail: patchedCount > 0
        ? `${patchedCount} transportation row(s) were updated from the DP invoice.`
        : 'No transportation rows matched the extracted container serial numbers.',
    });
  }

  private applyDpwExtractionToTransportationRows(index: number, extraction: ExtractDpwCargoResponse): number {
    const group = this.formArray.at(index);
    if (!group) return 0;
    const rows = this.getTransportationRows(group);
    const extractedRows = Array.isArray(extraction.containers) ? extraction.containers : [];
    const extractedMap = new Map(
      extractedRows
        .map((row) => [this.normalizeContainerSerial(row.container), row] as const)
        .filter(([serial]) => !!serial)
    );
    let patched = 0;

    rows.controls.forEach((row) => {
      const serial = this.normalizeContainerSerial(row.get('containerSerialNo')?.value);
      const extracted = extractedMap.get(serial);
      if (!extracted) return;

      const storageStartDate = this.parseApiDate(extracted.from || '');
      const storageEndDate = this.parseApiDate(extracted.to || '');
      row.patchValue({
        storageStartDate,
        storageEndDate,
      }, { emitEvent: false });
      patched += 1;
    });

    return patched;
  }

  private normalizeContainerSerial(value: unknown): string {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private parseApiDate(value: string): Date | null {
    if (!value) return null;
    const slashParts = value.split('/').map((part) => Number(part));
    if (slashParts.length === 3 && slashParts.every((part) => Number.isFinite(part))) {
      const [day, month, year] = slashParts;
      return new Date(year, month - 1, day);
    }
    const parts = value.split('-').map((part) => Number(part));
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      const [year, month, day] = parts;
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toTimeString(value: unknown): string {
    if (!value) return '';
    if (value instanceof Date) {
      const hours = String(value.getHours()).padStart(2, '0');
      const minutes = String(value.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    if (typeof value === 'string') return value;
    return '';
  }

  private combineDateTime(dateValue: unknown, timeValue: unknown): Date | null {
    if (!dateValue || !timeValue) return null;
    const date = new Date(dateValue as string | Date);
    if (Number.isNaN(date.getTime())) return null;
    const timeString = this.toTimeString(timeValue);
    const [hours, minutes] = timeString.split(':').map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private calculateDelayHours(
    transportDateValue: unknown,
    transportTimeValue: unknown,
    receivedDateValue: unknown,
    receivedTimeValue: unknown,
  ): number {
    const transportAt = this.combineDateTime(transportDateValue, transportTimeValue);
    const receivedAt = this.combineDateTime(receivedDateValue, receivedTimeValue);
    if (!transportAt || !receivedAt) return 0;
    return Math.max(0, Math.round(((receivedAt.getTime() - transportAt.getTime()) / 3600000) * 100) / 100);
  }

  private addDays(dateValue: unknown, days: number): Date | null {
    if (!dateValue) return null;
    const date = new Date(dateValue as string | Date);
    if (Number.isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + days);
    return date;
  }

  private syncAllSectionLocks(): void {
    const data = this.shipmentData();
    if (!data?.actual || !this.formArray) return;

    console.log('[DEBUG] syncAllSectionLocks - actualData:', data.actual);

    this.lockedSections.update((current) => {
      const next = { ...current };
      data.actual.forEach((actualRow: any, index: number) => {
        const locked = actualRow['lockedLogisticsSections'] || [];
        const sections: (Step5DocKind | 'transportation')[] = [
          'arrivalNotice', 'advanceRequest', 'doReleased', 
          'boePassingDate', 'customsClearance', 'municipality', 'transportation'
        ];
        sections.forEach((s) => {
          const key = this.sectionKey(index, s);
          next[key] = next[key] ?? locked.includes(s);
        });

        // Sync additionalDocuments if they exist in the API response
        const existingDocs = actualRow['additionalDocuments'] || [];
        console.log(`[DEBUG] Row ${index} additionalDocuments from API:`, existingDocs);
        
        if (existingDocs.length > 0) {
          const group = this.formArray.at(index);
          if (group) {
            const docArray = this.getAdditionalDocuments(group);
            const currentDocCount = docArray.length;
            
            console.log(`[DEBUG] Row ${index} current FormArray document count:`, currentDocCount);
            
            // Only repopulate if the counts don't match (avoid unnecessary updates)
            if (currentDocCount !== existingDocs.length) {
              console.log(`[DEBUG] Row ${index} repopulating additionalDocuments FormArray`);
              docArray.clear();
              existingDocs.forEach((doc: any) => {
                docArray.push(new FormGroup({
                  _id: new FormControl(doc._id || null),
                  documentType: new FormControl(doc.documentType || 'General'),
                  description: new FormControl(doc.description || ''),
                  documentUrl: new FormControl(doc.fileUrl || doc.documentUrl || ''),
                  documentName: new FormControl(doc.fileName || doc.documentName || ''),
                  uploadedOn: new FormControl(doc.uploadedAt ? new Date(doc.uploadedAt) : new Date()),
                  uploadedBy: new FormControl(doc.uploadedBy || 'System User'),
                }));
              });
            }
          }
        }

        // Sync warehouse field in transportation rows if they exist
        const transportationBooked = actualRow['transportationBooked'] || [];
        console.log(`[DEBUG] Row ${index} transportationBooked from API:`, transportationBooked);
        
        if (transportationBooked.length > 0) {
          const group = this.formArray.at(index);
          if (group) {
            const transportationRows = this.getTransportationRows(group);
            console.log(`[DEBUG] Row ${index} transportation FormArray row count:`, transportationRows.length);
            
            transportationRows.controls.forEach((row, rowIndex) => {
              const saved = transportationBooked[rowIndex];
              if (saved) {
                const currentWarehouse = row.get('warehouse')?.value;
                const apiWarehouse = saved.warehouse || '';
                
                console.log(`[DEBUG] Row ${index} Container ${rowIndex} - Current warehouse: "${currentWarehouse}", API warehouse: "${apiWarehouse}"`);
                
                // Patch all transportation fields to ensure they're in sync
                if (currentWarehouse !== apiWarehouse || !row.get('transportCompanyName')?.value) {
                  console.log(`[DEBUG] Row ${index} Container ${rowIndex} - Patching transportation data`);
                  row.patchValue({
                    transportCompanyName: saved.transportCompanyName || '',
                    warehouse: apiWarehouse,
                    bookedDate: saved.bookedDate ? new Date(saved.bookedDate) : row.get('bookedDate')?.value,
                    bookingTime: saved.bookingTime || row.get('bookingTime')?.value,
                    transportDate: saved.transportDate ? new Date(saved.transportDate) : row.get('transportDate')?.value,
                    transportTime: saved.transportTime || row.get('transportTime')?.value,
                    delayHours: saved.delayHours ?? row.get('delayHours')?.value ?? 0,
                    storageStartDate: saved.storageStartDate ? new Date(saved.storageStartDate) : row.get('storageStartDate')?.value,
                    storageEndDate: saved.storageEndDate ? new Date(saved.storageEndDate) : row.get('storageEndDate')?.value,
                    tokenReceivedDate: saved.tokenReceivedDate ? new Date(saved.tokenReceivedDate) : row.get('tokenReceivedDate')?.value,
                  }, { emitEvent: false });
                }
              }
            });
          }
        }
      });
      return next;
    });
  }

  private syncRowSectionLocks(index: number, lockedSections: string[]): void {
    const validSections: Array<Step5DocKind | 'transportation'> = [
      'arrivalNotice',
      'advanceRequest',
      'doReleased',
      'boePassingDate',
      'customsClearance',
      'municipality',
      'transportation',
    ];

    this.lockedSections.update((current) => {
      const next = { ...current };
      validSections.forEach((section) => {
        next[this.sectionKey(index, section)] = lockedSections.includes(section);
      });
      return next;
    });
  }

  private clearTransientSectionFiles(index: number, section: Step5DocKind | 'transportation'): void {
    if (section === 'transportation') return;
    this.getFileSignal(section as Step5DocKind).update((current) => ({
      ...current,
      [index]: null,
    }));
    if (section === 'customsClearance') {
      this.getRequiredCustomsDocTypes().forEach((docType) => {
        this.getCustomsDocFileSignal(docType).update((current) => ({
          ...current,
          [index]: null,
        }));
      });
    }
    if (section === 'boePassingDate') {
      this.dpInvoiceFile.update((current) => ({
        ...current,
        [index]: null,
      }));
    }
    if (section === 'municipality') {
      this.municipalityCertificateFile.update((current) => ({
        ...current,
        [index]: null,
      }));
    }
  }

  private patchSavedSection(index: number, section: LogisticsSectionKey, actual: any): void {
    const group = this.formArray.at(index) as AbstractControl | null;
    if (!group) return;

    if (section === 'portClearance') {
      group.patchValue({
        commercialDocumentReceivedDate: actual.commercialDocumentReceivedDate ? new Date(actual.commercialDocumentReceivedDate) : null,
        commercialDocumentDocumentUrl: actual.commercialDocumentDocumentUrl || '',
        commercialDocumentDocumentName: actual.commercialDocumentDocumentName || '',
        arrivalOn: actual.arrivalOn ? new Date(actual.arrivalOn) : null,
        freeDetentionDays: actual.freeDetentionDays ?? 10,
        freeStorageDays: actual.freeStorageDays ?? 14,
        clearanceRemarks: actual.clearanceRemarks || '',
      }, { emitEvent: false });
      return;
    }

    if (section === 'customerInspection') {
      group.patchValue({
        customerInspectionDate: actual.customerInspectionDate ? new Date(actual.customerInspectionDate) : null,
        customerInspectionDocumentUrl: actual.customerInspectionDocumentUrl || '',
        customerInspectionDocumentName: actual.customerInspectionDocumentName || '',
        customerInspectionStatus: actual.customerInspectionStatus || '',
        customerInspectionComments: actual.customerInspectionComments || '',
      }, { emitEvent: false });
      return;
    }

    if (section === 'arrivalNotice') {
      group.patchValue({
        arrivalOn: actual.arrivalOn ? new Date(actual.arrivalOn) : null,
        shipmentFreeRetentionDate: actual.shipmentFreeRetentionDate ? new Date(actual.shipmentFreeRetentionDate) : null,
        portRetentionWithPenaltyDate: actual.portRetentionWithPenaltyDate ? new Date(actual.portRetentionWithPenaltyDate) : null,
        maximumRetentionDate: actual.maximumRetentionDate ? new Date(actual.maximumRetentionDate) : null,
        customClearanceRequired: actual.customClearanceRequired === true,
        arrivalNoticeDate: actual.arrivalNoticeDate ? new Date(actual.arrivalNoticeDate) : null,
        arrivalNoticeFreeRetentionDays: actual.arrivalNoticeFreeRetentionDays ?? null,
        arrivalNoticeDocumentUrl: actual.arrivalNoticeDocumentUrl || '',
        arrivalNoticeDocumentName: actual.arrivalNoticeDocumentName || '',
      }, { emitEvent: false });
      return;
    }

    if (section === 'transportation') {
      const transportation = this.getTransportationRows(group);
      const booked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];
      transportation.controls.forEach((row, rowIndex) => {
        const saved = booked[rowIndex];
        if (!saved) return;
        row.patchValue({
          transactionId: saved.transactionId || '',
          transportCompanyName: saved.transportCompanyName || '',
          warehouse: saved.warehouse || '',
          bookedDate: saved.bookedDate ? new Date(saved.bookedDate) : null,
          bookingTime: saved.bookingTime || '',
          transportDate: saved.transportDate ? new Date(saved.transportDate) : null,
          transportTime: saved.transportTime || '',
          delayHours: saved.delayHours ?? 0,
          storageStartDate: saved.storageStartDate ? new Date(saved.storageStartDate) : null,
          storageEndDate: saved.storageEndDate ? new Date(saved.storageEndDate) : null,
          tokenReceivedDate: saved.tokenReceivedDate ? new Date(saved.tokenReceivedDate) : null,
        }, { emitEvent: false });
      });
      return;
    }

    const patchBySection: Record<Exclude<Step5DocKind, 'arrivalNotice'>, Record<string, unknown>> = {
      advanceRequest: {
        advanceRequestDate: actual.advanceRequestDate ? new Date(actual.advanceRequestDate) : null,
        advanceRequestDocumentUrl: actual.advanceRequestDocumentUrl || '',
        advanceRequestDocumentName: actual.advanceRequestDocumentName || '',
      },
      doReleased: {
        doReleasedDate: actual.doReleasedDate ? new Date(actual.doReleasedDate) : null,
        doReleasedRemarks: actual.doReleasedRemarks || '',
        doRemarks: actual.doRemarks || '',
        doReleasedDocumentUrl: actual.doReleasedDocumentUrl || '',
        doReleasedDocumentName: actual.doReleasedDocumentName || '',
      },
      boePassingDate: {
        boePassingDate: actual.boePassingDate ? new Date(actual.boePassingDate) : null,
        boePassingRemarks: actual.boePassingRemarks || '',
        boePassingDocumentUrl: actual.boePassingDocumentUrl || '',
        boePassingDocumentName: actual.boePassingDocumentName || '',
        dmBarcode: actual.dmBarcode || '',
        dpInvoiceDocumentUrl: actual.dpInvoiceDocumentUrl || '',
        dpInvoiceDocumentName: actual.dpInvoiceDocumentName || '',
        dpwCargoExtraction: actual.dpwCargoExtraction || null,
        customerInspectionRequired: actual.customerInspectionRequired === true,
      },
      customsClearance: {
        customsClearanceDate: actual.customsClearanceDate ? new Date(actual.customsClearanceDate) : null,
        customsClearanceRemarks: actual.customsClearanceRemarks || '',
        customsClearanceDocumentUrl: actual.customsClearanceDocumentUrl || '',
        customsClearanceDocumentName: actual.customsClearanceDocumentName || '',
        customClearanceRequired: actual.customClearanceRequired === true,
        customsDocBoeUrl: actual.customsOriginalDocuments?.boe?.documentUrl || actual.customsOriginalDocuments?.boeDocumentUrl || '',
        customsDocBoeName: actual.customsOriginalDocuments?.boe?.documentName || actual.customsOriginalDocuments?.boeDocumentName || '',
        customsDocDoUrl: actual.customsOriginalDocuments?.do?.documentUrl || actual.customsOriginalDocuments?.doDocumentUrl || '',
        customsDocDoName: actual.customsOriginalDocuments?.do?.documentName || actual.customsOriginalDocuments?.doDocumentName || '',
        customsDocBlOriginalUrl: actual.customsOriginalDocuments?.blOriginal?.documentUrl || actual.customsOriginalDocuments?.blOriginalDocumentUrl || '',
        customsDocBlOriginalName: actual.customsOriginalDocuments?.blOriginal?.documentName || actual.customsOriginalDocuments?.blOriginalDocumentName || '',
        customsDocInvoiceUrl: actual.customsOriginalDocuments?.invoice?.documentUrl || actual.customsOriginalDocuments?.invoiceDocumentUrl || '',
        customsDocInvoiceName: actual.customsOriginalDocuments?.invoice?.documentName || actual.customsOriginalDocuments?.invoiceDocumentName || '',
        customsDocPackingListUrl: actual.customsOriginalDocuments?.packingList?.documentUrl || actual.customsOriginalDocuments?.packingListDocumentUrl || '',
        customsDocPackingListName: actual.customsOriginalDocuments?.packingList?.documentName || actual.customsOriginalDocuments?.packingListDocumentName || '',
      },
      municipality: {
        municipalityDate: actual.municipalityDate ? new Date(actual.municipalityDate) : null,
        municipalityRemarks: actual.municipalityRemarks || '',
        municipalityDocumentUrl: actual.municipalityDocumentUrl || '',
        municipalityDocumentName: actual.municipalityDocumentName || '',
        municipalityStatus: actual.municipalityStatus || 'open',
        municipalityStatusComment: actual.municipalityStatusComment || '',
        municipalityReleasedDate: actual.municipalityReleasedDate ? new Date(actual.municipalityReleasedDate) : null,
        municipalityResponseRemarks: actual.municipalityResponseRemarks || '',
        municipalityComments: actual.municipalityComments || '',
        municipalityClearanceCertificateUrl: actual.municipalityClearanceCertificateUrl || '',
        municipalityClearanceCertificateName: actual.municipalityClearanceCertificateName || '',
      },
      customerInspection: {
        customerInspectionDate: actual.customerInspectionDate ? new Date(actual.customerInspectionDate) : null,
        customerInspectionDocumentUrl: actual.customerInspectionDocumentUrl || '',
        customerInspectionDocumentName: actual.customerInspectionDocumentName || '',
        customerInspectionStatus: actual.customerInspectionStatus || '',
        customerInspectionComments: actual.customerInspectionComments || '',
      },
      portClearance: {
        commercialDocumentReceivedDate: actual.commercialDocumentReceivedDate ? new Date(actual.commercialDocumentReceivedDate) : null,
        commercialDocumentDocumentUrl: actual.commercialDocumentDocumentUrl || '',
        commercialDocumentDocumentName: actual.commercialDocumentDocumentName || '',
        arrivalOn: actual.arrivalOn ? new Date(actual.arrivalOn) : null,
        freeDetentionDays: actual.freeDetentionDays ?? 10,
        freeStorageDays: actual.freeStorageDays ?? 14,
        clearanceRemarks: actual.clearanceRemarks || '',
      },
    };

    if (section in patchBySection) {
      group.patchValue((patchBySection as any)[section], { emitEvent: false });
    }
  }

  private isLogisticsRowComplete(row: any): boolean {
    const locked = new Set(row?.lockedLogisticsSections || []);
    const requiredSections = [
      'arrivalNotice',
      'advanceRequest',
      'doReleased',
      'boePassingDate',
      'municipality',
      'transportation',
    ];
    if (row?.customClearanceRequired === true) {
      requiredSections.push('customsClearance');
    }
    return requiredSections.every((section) => locked.has(section));
  }

  private applySectionLocks(index: number): void {
    const group = this.formArray.at(index);
    if (!group) return;

    const sectionControls: Record<string, string[]> = {
      arrivalNotice: ['arrivalNoticeDate', 'arrivalOn', 'shipmentFreeRetentionDate', 'maximumRetentionDate', 'arrivalNoticeFreeRetentionDays', 'customClearanceRequired'],
      advanceRequest: ['advanceRequestDate'],
      doReleased: ['doReleasedDate', 'doReleasedRemarks'],
      boePassingDate: ['boePassingDate', 'boePassingRemarks', 'dmBarcode', 'dpInvoiceDocumentUrl', 'dpInvoiceDocumentName', 'dpwCargoExtraction'],
      customsClearance: ['customsClearanceDate', 'customsClearanceRemarks'],
      municipality: ['municipalityDate', 'municipalityRemarks', 'municipalityStatus', 'municipalityStatusComment', 'municipalityClearanceCertificateUrl', 'municipalityClearanceCertificateName'],
      transportation: [],
    };

    Object.entries(sectionControls).forEach(([section, controls]) => {
      controls.forEach((controlName) => {
        const control = group.get(controlName);
        if (!control) return;
        const sectionRowLocked = this.hasSectionPermission(section as LogisticsSectionKey)
          ? false
          : this.isRowEditLocked(index);
        if (!this.canEditLogisticsSection(section as LogisticsSectionKey) || this.isLogisticsSectionLocked(index, section as any)) {
          control.disable({ emitEvent: false });
        } else if (!sectionRowLocked) {
          control.enable({ emitEvent: false });
        }
      });
    });

    const transportation = group.get('transportationBooked') as FormArray | null;
    const transportRowLocked = this.hasSectionPermission('transportation')
      ? false
      : this.isRowEditLocked(index);
    transportation?.controls.forEach((row) => {
      if (!this.canEditLogisticsSection('transportation') || this.isLogisticsSectionLocked(index, 'transportation')) {
        row.disable({ emitEvent: false });
      } else if (!transportRowLocked) {
        row.enable({ emitEvent: false });
        row.get('delayHours')?.disable({ emitEvent: false });
      }
    });
  }

  openBulkDateModal(index: number): void {
    if (this.isLogisticsSectionLocked(index, 'transportation')) return;
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const currentTime = new Date();
    currentTime.setSeconds(0, 0);
    this.bulkDateRowIndex.set(index);
    this.bulkDateForm.reset({
      transportCompanyName: null,
      warehouse: null,
      bookedDate: new Date(currentDate),
      bookingTime: new Date(currentTime),
      transportDate: new Date(currentDate),
      transportTime: new Date(currentTime),
    });
    this.clearBulkTransportationSelection(index);
    this.bulkTransportationAttachments.set([]);
    this.bulkContainerSearchFilter.set('');
    this.bulkDateModalVisible.set(true);
  }

  closeBulkDateModal(): void {
    const index = this.bulkDateRowIndex();
    if (index !== null) this.clearBulkTransportationSelection(index);
    this.bulkDateModalVisible.set(false);
    this.bulkDateRowIndex.set(null);
  }

  clearBulkTransportationSelection(index: number): void {
    this.getTransportationRows(this.formArray.at(index)).controls.forEach((row) => {
      row.get('checked')?.patchValue(false, { emitEvent: false });
    });
  }

  /**
   * Transportation rows that have not yet been assigned to a transaction. A container gets a
   * shared transactionId the moment it is submitted via "Manage Shipments" (bulk update), so
   * once assigned it drops out of the selectable list and can't be assigned a second time.
   * Example: 20 containers, assign 2 -> the list now shows 18 remaining, and so on.
   */
  getUnassignedTransportationRows(group: AbstractControl): AbstractControl[] {
    return this.getTransportationRows(group).controls.filter(
      (row) => !String(row.get('transactionId')?.value || '').trim(),
    );
  }

  getUnassignedTransportationCount(group: AbstractControl): number {
    return this.getUnassignedTransportationRows(group).length;
  }

  getSelectedTransportationRows(index: number): AbstractControl[] {
    return this.getUnassignedTransportationRows(this.formArray.at(index)).filter((row) => row.get('checked')?.value === true);
  }

  selectedTransportationCount(index: number): number {
    return this.getSelectedTransportationRows(index).length;
  }

  areAllBulkTransportationRowsSelected(index: number): boolean {
    const rows = this.getUnassignedTransportationRows(this.formArray.at(index));
    return rows.length > 0 && rows.every((row) => row.get('checked')?.value === true);
  }

  toggleAllBulkTransportationRows(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked === true;
    this.getUnassignedTransportationRows(this.formArray.at(index)).forEach((row) => {
      row.get('checked')?.patchValue(checked, { emitEvent: false });
    });
  }

  filterBulkContainers(event: Event): void {
    const searchValue = (event.target as HTMLInputElement).value.toLowerCase().trim();
    this.bulkContainerSearchFilter.set(searchValue);
  }

  isBulkContainerVisible(containerNo: string | undefined): boolean {
    if (!containerNo) return false;
    const filter = this.bulkContainerSearchFilter().toLowerCase();
    if (!filter) return true;
    return containerNo.toLowerCase().includes(filter);
  }

  onBulkAttachmentSelected(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (!files) return;
    const newFiles = Array.from(files);
    this.bulkTransportationAttachments.update(current => [...current, ...newFiles]);
    (event.target as HTMLInputElement).value = '';
  }

  removeBulkAttachment(index: number): void {
    this.bulkTransportationAttachments.update(current => {
      const next = [...current];
      next.splice(index, 1);
      return next;
    });
  }

  saveBulkTransportationSelection(): void {
    const index = this.bulkDateRowIndex();
    if (index === null) return;
    if (this.bulkTransportationSaving()) return;

    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    const shipmentId = this.shipmentData()?.shipment?._id;
    if (!group || !containerId || !shipmentId) return;

    const values = this.bulkDateForm.getRawValue();
    const selectedRows = this.getSelectedTransportationRows(index);

    if (!selectedRows.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No rows selected',
        detail: 'Select one or more containers in the modal before saving.',
      });
      return;
    }

    const patch: Record<string, string | Date> = {};
    const company = String(values.transportCompanyName || '').trim();
    if (company) patch['transportCompanyName'] = company;
    if ((values as any).warehouse) patch['warehouse'] = (values as any).warehouse;
    if (values.bookedDate) patch['bookedDate'] = values.bookedDate;
    if (values.bookingTime) patch['bookingTime'] = values.bookingTime;
    if (values.transportDate) patch['transportDate'] = values.transportDate;
    if (values.transportTime) patch['transportTime'] = values.transportTime;

    if (!Object.keys(patch).length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No bulk values entered',
        detail: 'Enter at least one transport or date value to save.',
      });
      return;
    }

    // One bulk submit = one transaction. Assign a single shared transactionId to all selected rows
    // so they group into a single row in the transaction table.
    patch['transactionId'] = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    selectedRows.forEach((row) => {
      row.patchValue(patch, { emitEvent: false });
      row.markAllAsTouched();
      row.updateValueAndValidity({ emitEvent: false });
    });

    const missingCompany = selectedRows.some((row) => !String(row.get('transportCompanyName')?.value || '').trim());
    if (missingCompany) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Transport Company Required',
        detail: 'Selected containers need a transport company before saving.',
      });
      return;
    }

    this.onTransportationTimeChange(index);
    selectedRows.forEach((row) => row.updateValueAndValidity({ emitEvent: false }));
    if (selectedRows.some((row) => row.invalid)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid transportation timing',
        detail: 'Transportation date and time must be the same as or later than the arranged date and booking time.',
      });
      return;
    }

    const payload = new FormData();
    payload.append('sectionKey', 'transportation');
    payload.append('transportationPartialSave', 'true');
    payload.append('transportationBooked', JSON.stringify(this.buildTransportationBookedPayload(group)));

    // Append attachments if any
    const attachments = this.bulkTransportationAttachments();
    attachments.forEach((file, index) => {
      payload.append(`transportationAttachment_${index}`, file, file.name);
    });

    this.bulkTransportationSaving.set(true);
    this.shipmentService.submitLogistics(containerId, payload).subscribe({
      next: () => {
        this.bulkTransportationSaving.set(false);
        const count = selectedRows.length;
        this.clearBulkTransportationSelection(index);
        this.closeBulkDateModal();
        this.store.dispatch(ShipmentActions.loadShipmentDetail({ id: shipmentId }));
        this.messageService.add({
          severity: 'success',
          summary: 'Transportation Updated',
          detail: `${count} selected container(s) updated and saved.`,
        });
      },
      error: (error) => {
        this.bulkTransportationSaving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Bulk Save Failed',
          detail: error?.error?.message || 'Unable to save selected transportation rows.',
        });
      }
    });
  }

  // ========== Customs Documents Methods ==========

  private pendingCustomsDocFileRow: number | null = null;
  private pendingCustomsDocType: CustomsDocType | null = null;

  clickCustomsDocFileInput(index: number, docType: CustomsDocType): void {
    if (this.isRowEditLocked(index) || this.isLogisticsSectionLocked(index, 'customsClearance')) return;
    this.pendingCustomsDocFileRow = index;
    this.pendingCustomsDocType = docType;

    const refs: Record<CustomsDocType, ElementRef<HTMLInputElement> | undefined> = {
      boe: this.customsDocBoeInputRef,
      do: this.customsDocDoInputRef,
      blOriginal: this.customsDocBlOriginalInputRef,
      invoice: this.customsDocInvoiceInputRef,
      packingList: this.customsDocPackingListInputRef,
      coo: this.customsDocCooInputRef,
    };
    refs[docType]?.nativeElement?.click();
  }

  onCustomsDocFileInputChange(event: Event, docType: CustomsDocType): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const row = this.pendingCustomsDocFileRow;
    if (row !== null && this.pendingCustomsDocType === docType && file) {
      this.getCustomsDocFileSignal(docType).update((cur) => ({ ...cur, [row]: file }));
    }
    this.pendingCustomsDocFileRow = null;
    this.pendingCustomsDocType = null;
    input.value = '';
  }

  private getCustomsDocFileSignal(docType: CustomsDocType) {
    switch (docType) {
      case 'boe':
        return this.customsDocBoeFile;
      case 'do':
        return this.customsDocDoFile;
      case 'blOriginal':
        return this.customsDocBlOriginalFile;
      case 'invoice':
        return this.customsDocInvoiceFile;
      case 'packingList':
        return this.customsDocPackingListFile;
      case 'coo':
        return this.customsDocCooFile;
      default:
        return this.customsDocBoeFile;
    }
  }

  getCustomsDocFile(containerIndex: number, docType: CustomsDocType): File | null {
    return this.getCustomsDocFileSignal(docType)()?.[containerIndex] ?? null;
  }

  clearCustomsDocFile(containerIndex: number, docType: CustomsDocType): void {
    this.getCustomsDocFileSignal(docType).update((cur) => ({ ...cur, [containerIndex]: null }));
  }

  getSavedCustomsDocUrl(group: AbstractControl, docType: CustomsDocType): string {
    const map: Record<CustomsDocType, string> = {
      boe: 'customsDocBoeUrl',
      do: 'customsDocDoUrl',
      blOriginal: 'customsDocBlOriginalUrl',
      invoice: 'customsDocInvoiceUrl',
      packingList: 'customsDocPackingListUrl',
      coo: 'customsDocCooUrl',
    };
    return group.get(map[docType])?.value || '';
  }

  getSavedCustomsDocName(group: AbstractControl, docType: CustomsDocType): string {
    const map: Record<CustomsDocType, string> = {
      boe: 'customsDocBoeName',
      do: 'customsDocDoName',
      blOriginal: 'customsDocBlOriginalName',
      invoice: 'customsDocInvoiceName',
      packingList: 'customsDocPackingListName',
      coo: 'customsDocCooName',
    };
    return group.get(map[docType])?.value || '';
  }

  // ========== Customer Inspection Methods ==========

  clickCustomerInspectionFileInput(index: number): void {
    if (this.isRowEditLocked(index) || this.isLogisticsSectionLocked(index, 'municipality')) return;
    this.pendingFileRow = index;
    this.pendingDocKind = 'arrivalNotice';
  }

  onCustomerInspectionFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const row = this.pendingFileRow;
    if (row !== null && file) {
      this.customerInspectionFile.update((cur) => ({ ...cur, [row]: file }));
    }
    this.pendingFileRow = null;
    input.value = '';
  }

  getCustomerInspectionFile(containerIndex: number): File | null {
    return this.customerInspectionFile()?.[containerIndex] ?? null;
  }

  clearCustomerInspectionFile(containerIndex: number): void {
    this.customerInspectionFile.update((cur) => ({ ...cur, [containerIndex]: null }));
  }

  onCustomerInspectionFileSelected(event: Event, containerIndex: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.customerInspectionFile.update((cur) => ({ ...cur, [containerIndex]: file }));
    }
    input.value = '';
  }

  getSavedCustomerInspectionUrl(group: AbstractControl): string {
    return group.get('customerInspectionDocumentUrl')?.value || '';
  }

  getSavedCustomerInspectionName(group: AbstractControl): string {
    return group.get('customerInspectionDocumentName')?.value || '';
  }

  isCustomerInspectionRequired(index: number): boolean {
    return this.formArray.at(index)?.get('customerInspectionRequired')?.value === true;
  }

  // ========== Repository Documents Methods ==========

  getAdditionalDocuments(group: AbstractControl): FormArray {
    return group.get('additionalDocuments') as FormArray;
  }

  getRepositoryDocumentsCount(group: AbstractControl): number {
    return this.getAdditionalDocuments(group)?.length || 0;
  }

  // ===== Documents milestone (M1) =====
  /** Document types that have their own dedicated row in the Documents milestone. */
  private readonly typedDocumentKinds = ['certificate_of_origin', 'health_certificate'];

  /**
   * Mapped document URLs already captured in the BL Details step. These live on the
   * actual container (the arrival form array does not carry them), so read from there.
   */
  getMappedDocUrl(index: number, kind: 'bl' | 'commercialInvoice' | 'packingList'): string {
    const actual = this.shipmentData()?.actual?.[index] as any;
    if (!actual) return '';
    switch (kind) {
      case 'bl':
        return actual.blDocumentUrl || '';
      case 'commercialInvoice':
        return actual.commercialInvoiceDocumentUrl
          || actual.customsOriginalDocuments?.invoice?.documentUrl
          || actual.customsOriginalDocuments?.invoiceDocumentUrl
          || '';
      case 'packingList':
        return actual.packagingListDocumentUrl
          || actual.packingListDocumentUrl
          || actual.customsOriginalDocuments?.packingList?.documentUrl
          || '';
    }
  }

  getMappedDocName(index: number, kind: 'bl' | 'commercialInvoice' | 'packingList'): string {
    const actual = this.shipmentData()?.actual?.[index] as any;
    if (!actual) return '';
    switch (kind) {
      case 'bl':
        return actual.blDocumentName || '';
      case 'commercialInvoice':
        return actual.commercialInvoiceDocumentName
          || actual.customsOriginalDocuments?.invoice?.documentName
          || actual.customsOriginalDocuments?.invoiceDocumentName
          || '';
      case 'packingList':
        return actual.packagingListDocumentName
          || actual.packingListDocumentName
          || actual.customsOriginalDocuments?.packingList?.documentName
          || '';
    }
  }

  /** Find a repository document by its dedicated documentType (e.g. certificate_of_origin). */
  getRepositoryDocByType(group: AbstractControl, type: string): FormGroup | null {
    const arr = this.getAdditionalDocuments(group);
    if (!arr) return null;
    return (
      (arr.controls.find(
        (c) => String(c.get('documentType')?.value || '').toLowerCase() === type
      ) as FormGroup) || null
    );
  }

  /** Repository docs excluding the ones with dedicated rows — shown under "Other Documents". */
  getOtherRepositoryDocuments(group: AbstractControl): Array<{ control: AbstractControl; index: number }> {
    const arr = this.getAdditionalDocuments(group);
    if (!arr) return [];
    return arr.controls
      .map((control, index) => ({ control, index }))
      .filter(({ control }) =>
        !this.typedDocumentKinds.includes(String(control.get('documentType')?.value || '').toLowerCase())
      );
  }

  getOtherRepositoryDocumentsCount(group: AbstractControl): number {
    return this.getOtherRepositoryDocuments(group).length;
  }

  private pendingTypedDoc: { index: number; type: string; description: string } | null = null;

  clickTypedDocUpload(index: number, type: string, description: string): void {
    if (this.isRowEditLocked(index)) return;
    this.pendingTypedDoc = { index, type, description };
    this.typedDocInputRef?.nativeElement?.click();
  }

  onTypedDocInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const pending = this.pendingTypedDoc;
    input.value = '';
    this.pendingTypedDoc = null;
    if (!file || !pending) return;
    this.uploadTypedRepositoryDocument(pending.index, file, pending.type, pending.description);
  }

  uploadTypedRepositoryDocument(index: number, file: File, documentType: string, description: string): void {
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    if (!containerId || !group || !file) return;

    // Replace any existing doc of this type so the dedicated slot holds a single file.
    const existing = this.getRepositoryDocByType(group, documentType);
    const existingId = existing?.get('_id')?.value;

    this.uploadingRepositoryDocument.set(true);
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('documentType', documentType);
    formData.append('description', description);

    this.shipmentService.uploadAdditionalRepositoryDocument(containerId, formData).subscribe({
      next: (response) => {
        this.uploadingRepositoryDocument.set(false);
        const actual = response?.container?.actual;
        const docs: any[] = actual?.additionalDocuments || [];
        const newDoc = docs[docs.length - 1];
        const docArray = this.getAdditionalDocuments(group);
        // Drop a previous doc of the same type (keep one per dedicated slot).
        if (existingId) {
          const removeAt = docArray.controls.findIndex((c) => c.get('_id')?.value === existingId);
          if (removeAt >= 0) docArray.removeAt(removeAt);
        }
        if (newDoc) {
          docArray.push(new FormGroup({
            _id: new FormControl(newDoc._id || null),
            documentType: new FormControl(newDoc.documentType || documentType),
            description: new FormControl(newDoc.description || description),
            documentUrl: new FormControl(newDoc.fileUrl || newDoc.documentUrl || ''),
            documentName: new FormControl(newDoc.fileName || newDoc.documentName || file.name),
            uploadedOn: new FormControl(new Date(newDoc.uploadedAt || new Date())),
            uploadedBy: new FormControl(newDoc.uploadedBy || 'System User'),
          }));
        }
        if (actual) {
          this.store.dispatch(ShipmentActions.patchActualContainerData({ containerId, actual }));
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Document Uploaded',
          detail: `${description} uploaded successfully.`,
        });
      },
      error: (err) => {
        this.uploadingRepositoryDocument.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Upload Failed',
          detail: err?.error?.message || 'Could not upload document.',
        });
      }
    });
  }

  deleteRepositoryDocument(index: number, docIndex: number): void {
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    if (!containerId || !group) return;

    const docArray = this.getAdditionalDocuments(group);
    const doc = docArray.at(docIndex);
    if (!doc) return;

    const docId = doc.get('_id')?.value || doc.get('id')?.value;
    if (!docId) {
      docArray.removeAt(docIndex);
      return;
    }

    this.confirmDialog.ask({
      message: 'Delete this document from the repository?',
      header: 'Confirm Delete',
      acceptLabel: 'Yes, Delete',
    }).then((confirmed) => {
      if (!confirmed) return;
      this.shipmentService.deleteAdditionalRepositoryDocument(containerId, docId).subscribe({
        next: (response) => {
          docArray.removeAt(docIndex);
          const actual = response?.container?.actual;
          if (actual) {
            this.store.dispatch(ShipmentActions.patchActualContainerData({ containerId, actual }));
          }
          this.messageService.add({
            severity: 'success',
            summary: 'Document Deleted',
            detail: 'Document removed from repository successfully.',
          });
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err?.error?.message || 'Could not delete document.',
          });
        }
      });
    });
  }

  uploadRepositoryDocument(index: number, file: File): void {
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    if (!containerId || !group || !file) return;

    this.uploadingRepositoryDocument.set(true);
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('documentType', 'general');
    formData.append('description', file.name);

    this.shipmentService.uploadAdditionalRepositoryDocument(containerId, formData).subscribe({
      next: (response) => {
        this.uploadingRepositoryDocument.set(false);
        const actual = response?.container?.actual;
        const docs: any[] = actual?.additionalDocuments || [];
        const newDoc = docs[docs.length - 1];
        const docArray = this.getAdditionalDocuments(group);
        if (newDoc) {
          docArray.push(new FormGroup({
            _id: new FormControl(newDoc._id || null),
            documentType: new FormControl(newDoc.documentType || 'general'),
            description: new FormControl(newDoc.description || file.name),
            documentUrl: new FormControl(newDoc.fileUrl || newDoc.documentUrl || ''),
            documentName: new FormControl(newDoc.fileName || newDoc.documentName || file.name),
            uploadedOn: new FormControl(new Date(newDoc.uploadedAt || new Date())),
            uploadedBy: new FormControl(newDoc.uploadedBy || 'System User'),
          }));
        }
        if (actual) {
          this.store.dispatch(ShipmentActions.patchActualContainerData({ containerId, actual }));
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Document Uploaded',
          detail: 'Document added to repository successfully.',
        });
      },
      error: (err) => {
        this.uploadingRepositoryDocument.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Upload Failed',
          detail: err?.error?.message || 'Could not upload document.',
        });
      }
    });
  }

  // ========== Commercial Document Methods ==========

  getCommercialDocumentFile(index: number): File | null {
    return this.commercialDocumentFile()[index] ?? null;
  }

  onCommercialDocumentSelected(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.commercialDocumentFile.update((cur) => ({ ...cur, [index]: file }));
    }
    input.value = '';
  }

  clearCommercialDocumentFile(index: number): void {
    this.commercialDocumentFile.update((cur) => ({ ...cur, [index]: null }));
  }

  // ========== Transportation Transaction Methods ==========

  getTransportationTransactions(group: AbstractControl): FormArray {
    return group.get('transportationTransactions') as FormArray;
  }

  openNewTransactionDialog(index: number): void {
    this.newTransactionRowIndex.set(index);
    this.newTransactionForm.reset({ containerSerials: '', transportCompany: null, warehouse: null, transportDate: null });
    this.newTransactionDialogVisible.set(true);
    this.warehouseService.getWarehouses().subscribe((whs) => {
      const activeWarehouses = whs
        .filter((w: any) => w.status === 'Active')
        .map((w: any) => {
          const codeSuffix = w.code ? ` - ${w.code}` : '';
          const label = `${w.name}${codeSuffix}`;
          return { label, value: label };
        });
      this.warehouseOptions.set(activeWarehouses);
    });
  }

  closeNewTransactionDialog(): void {
    this.newTransactionDialogVisible.set(false);
    this.newTransactionRowIndex.set(null);
    this.newTransactionForm.reset();
  }

  saveNewTransaction(): void {
    const index = this.newTransactionRowIndex();
    if (index === null) return;
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    if (!containerId) {
      this.messageService.add({ severity: 'warn', summary: 'No Container', detail: 'Container ID is missing.' });
      return;
    }
    const val = this.newTransactionForm.value;
    if (!val.transportCompany || !val.warehouse || !val.transportDate) {
      this.messageService.add({ severity: 'warn', summary: 'Required Fields', detail: 'Please fill Transport Company, Warehouse and Transport Date.' });
      return;
    }
    const serials = (val.containerSerials || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (serials.length === 0) {
      this.messageService.add({ severity: 'warn', summary: 'Required Fields', detail: 'Please enter at least one container serial.' });
      return;
    }
    this.savingTransaction.set(true);
    const payload = {
      containerSerials: serials,
      transportCompany: val.transportCompany!,
      warehouse: val.warehouse!,
      transportDate: (val.transportDate as Date).toISOString(),
    };
    this.shipmentService.createTransportationTransaction(containerId, payload).subscribe({
      next: (res) => {
        this.savingTransaction.set(false);
        const txn = res.transaction;
        const txnArray = this.getTransportationTransactions(group);
        txnArray.push(new FormGroup({
          _id: new FormControl(txn._id || null),
          transactionNo: new FormControl(txn.transactionNo || ''),
          containerSerials: new FormControl(txn.containerSerials || []),
          transportCompany: new FormControl(txn.transportCompany || ''),
          warehouse: new FormControl(txn.warehouse || ''),
          transportDate: new FormControl(txn.transportDate ? new Date(txn.transportDate) : null),
          createdAt: new FormControl(txn.createdAt ? new Date(txn.createdAt) : new Date()),
        }));
        this.closeNewTransactionDialog();
        this.messageService.add({ severity: 'success', summary: 'Transaction Created', detail: `Transaction ${txn.transactionNo} created.` });
      },
      error: (err) => {
        this.savingTransaction.set(false);
        this.messageService.add({ severity: 'error', summary: 'Failed', detail: err?.error?.message || 'Could not create transaction.' });
      }
    });
  }

  deleteTransaction(index: number, txnIndex: number): void {
    const group = this.formArray.at(index);
    const containerId = group?.get('containerId')?.value;
    if (!containerId) return;
    const txnArray = this.getTransportationTransactions(group);
    const txn = txnArray.at(txnIndex);
    const txnId = txn?.get('_id')?.value;
    if (!txnId) {
      txnArray.removeAt(txnIndex);
      return;
    }
    this.confirmDialog.ask({
      message: 'Delete this transportation transaction?',
      header: 'Confirm Delete',
      acceptLabel: 'Yes, Delete',
    }).then((confirmed) => {
      if (!confirmed) return;
      this.deletingTransactionId.set(txnId);
      this.shipmentService.deleteTransportationTransaction(containerId, txnId).subscribe({
        next: () => {
          this.deletingTransactionId.set(null);
          txnArray.removeAt(txnIndex);
          this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Transportation transaction deleted.' });
        },
        error: (err) => {
          this.deletingTransactionId.set(null);
          this.messageService.add({ severity: 'error', summary: 'Delete Failed', detail: err?.error?.message || 'Could not delete transaction.' });
        }
      });
    });
  }
}
