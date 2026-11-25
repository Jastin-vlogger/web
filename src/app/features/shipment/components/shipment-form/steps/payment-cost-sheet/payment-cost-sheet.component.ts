import { Component, Input, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import {
  PaymentCostLine, PaymentCostSheet, PaymentCostSheetHistoryEntry, PaymentCostSheetPermissions, PaymentCostSheetResponse,
} from '../../../../../../core/models/payment-cost-sheet.model';
import { PaymentCostSheetService } from '../../../../../../core/services/payment-cost-sheet.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { SheetGrid, borderCss, buildSheetGrid } from '../../shared/cost-sheet-grid.util';
import { downloadCostLinesPdf } from '../../shared/cost-lines-pdf';
import {
  changedSns, computeTotals, formatAmount, parseAmount, splitMismatch, withCost, withRhgt, withSilal,
} from '../../shared/cost-lines.util';

type TextField = 'description' | 'billRefNo' | 'billRefParty' | 'paymentReference' | 'remarks';

// Payment Costing: import the Accounts Excel cost sheet, edit its numbered cost lines (any number of them,
// saved in MongoDB), view the original Excel via the eye icon, submit to lock it.
// Permissions come from the server (it also enforces them); this component only shows/hides buttons.
@Component({
  selector: 'app-payment-cost-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, PaginatorModule, InputNumberModule, InputTextModule],
  templateUrl: './payment-cost-sheet.component.html',
})
export class PaymentCostSheetComponent implements OnChanges {
  @Input({ required: true }) containerId!: string;
  /** Used in file names, e.g. the shipment number. */
  @Input() shipmentLabel = '';

  private service = inject(PaymentCostSheetService);
  private notifications = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);
  private authService = inject(AuthService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<'import' | 'submit' | 'unlock' | 'excel' | 'save' | null>(null);
  readonly sheet = signal<PaymentCostSheet | null>(null);
  readonly permissions = signal<PaymentCostSheetPermissions>({ canImport: false, canSubmit: false, canUnlock: false });
  readonly activeSheet = signal(0);
  readonly unlockOpen = signal(false);
  unlockReason = '';

  // Editable lines: `lines` is what the user sees/edits, `saved` is the last version stored in MongoDB.
  readonly lines = signal<PaymentCostLine[]>([]);
  readonly saved = signal<PaymentCostLine[]>([]);
  readonly warnings = signal<string[]>([]);
  readonly totals = computed(() => computeTotals(this.lines()));
  readonly changed = computed(() => changedSns(this.saved(), this.lines()));
  readonly dirty = computed(() => this.changed().length > 0);

  // Original Excel viewer and Import Log modals.
  readonly viewOpen = signal(false);
  readonly logOpen = signal(false);
  readonly logLoading = signal(false);
  readonly logError = signal<string | null>(null);
  readonly logItems = signal<PaymentCostSheetHistoryEntry[]>([]);
  readonly logTotal = signal(0);
  readonly logPage = signal(1);
  readonly logPageSize = signal(10);
  readonly logFirst = computed(() => (this.logPage() - 1) * this.logPageSize());

  readonly isLocked = computed(() => this.sheet()?.status === 'locked');
  readonly canEdit = computed(() => !this.isLocked() && this.permissions().canImport);
  /** Submit / re-import / exports wait for unsaved edits so nothing stale is locked or downloaded. */
  readonly blocked = computed(() => this.busy() !== null || this.dirty());
  readonly grids = computed<SheetGrid[]>(() => (this.sheet()?.snapshot?.sheets ?? []).map(buildSheetGrid));
  readonly currentGrid = computed(() => this.grids()[this.activeSheet()] ?? null);
  readonly tableWidth = computed(() => (this.currentGrid()?.colWidths ?? []).reduce((sum, w) => sum + w, 0));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['containerId'] && this.containerId) this.load();
  }

  private apply(res: PaymentCostSheetResponse): void {
    this.sheet.set(res.sheet);
    this.permissions.set(res.permissions);
    const lines = res.sheet?.lines ?? [];
    this.lines.set(lines.map((l) => ({ ...l })));
    this.saved.set(lines.map((l) => ({ ...l })));
    this.warnings.set(res.sheet?.warnings ?? []);
    if (this.activeSheet() >= (res.sheet?.snapshot?.sheets?.length ?? 0)) this.activeSheet.set(0);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get(this.containerId).subscribe({
      next: (res) => { this.apply(res); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.status === 403
          ? 'You do not have access to the Payment Costing sheet.'
          : 'Unable to load the Payment Costing sheet right now.');
      },
    });
  }

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      this.notifications.error('Wrong file type', 'Choose an Excel (.xlsx) cost sheet.');
      return;
    }
    this.busy.set('import');
    this.service.import(this.containerId, file).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.apply(res);
        this.notifications.success('Imported', res.message || 'Cost sheet imported.');
      },
      error: (err) => {
        this.busy.set(null);
        this.notifications.error('Import failed', err?.error?.message || 'Could not import the cost sheet.');
      },
    });
  }

  async submit(): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      message: 'Submit this cost sheet? It will be locked and only an Admin can unlock it for corrections.',
      header: 'Submit and Lock',
      acceptLabel: 'Yes, Submit and Lock',
      rejectLabel: 'Cancel',
      icon: 'pi pi-lock',
      severity: 'warning',
    });
    if (!confirmed) return;
    this.busy.set('submit');
    this.service.submit(this.containerId).subscribe({
      next: (res) => { this.busy.set(null); this.apply(res); this.notifications.success('Locked', res.message || 'Cost sheet locked.'); },
      error: (err) => { this.busy.set(null); this.notifications.error('Submit failed', err?.error?.message || 'Could not submit the cost sheet.'); },
    });
  }

  unlock(): void {
    const reason = this.unlockReason.trim();
    if (reason.length < 3) {
      this.notifications.error('Reason required', 'Enter a reason for unlocking the cost sheet.');
      return;
    }
    this.busy.set('unlock');
    this.service.unlock(this.containerId, reason).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.unlockOpen.set(false);
        this.unlockReason = '';
        this.apply(res);
        this.notifications.success('Unlocked', res.message || 'Cost sheet unlocked.');
      },
      error: (err) => { this.busy.set(null); this.notifications.error('Unlock failed', err?.error?.message || 'Could not unlock the cost sheet.'); },
    });
  }

  private fileStem(): string {
    return `payment-costing-${this.shipmentLabel || this.sheet()?.blNo || 'sheet'}`;
  }

  downloadExcel(source: 'edited' | 'original' = 'edited'): void {
    this.busy.set('excel');
    this.service.downloadExcel(this.containerId, source).subscribe({
      next: (blob) => {
        this.busy.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.fileStem().replace(/[^a-z0-9_-]/gi, '_')}${source === 'original' ? '-original' : ''}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.busy.set(null); this.notifications.error('Download failed', 'Could not download the Excel file.'); },
    });
  }

  downloadPdf(): void {
    const sheet = this.sheet();
    if (!sheet) return;
    const user = this.authService.getCurrentUser();
    downloadCostLinesPdf(this.lines(), this.totals(), {
      fileStem: this.fileStem(),
      subtitle: [this.shipmentLabel, sheet.blNo ? `BL ${sheet.blNo}` : ''].filter(Boolean).join(' | '),
      downloadedBy: user?.name || '',
    });
  }

  // ---- editing -------------------------------------------------------------------------------

  private patch(index: number, fn: (line: PaymentCostLine) => PaymentCostLine): void {
    this.lines.update((all) => all.map((l, i) => (i === index ? fn(l) : l)));
  }

  setText(index: number, field: TextField, value: string): void {
    this.patch(index, (l) => ({ ...l, [field]: value }));
  }

  setCost(index: number, raw: string): void { this.patch(index, (l) => withCost(l, parseAmount(raw))); }
  setRhgt(index: number, raw: string): void { this.patch(index, (l) => withRhgt(l, parseAmount(raw))); }
  setSilal(index: number, raw: string): void { this.patch(index, (l) => withSilal(l, parseAmount(raw))); }

  isMismatch(line: PaymentCostLine): boolean { return splitMismatch(line); }
  fmt(value: number | null | undefined): string { return formatAmount(value); }

  discard(): void {
    this.lines.set(this.saved().map((l) => ({ ...l })));
  }

  save(): void {
    if (!this.dirty() || this.busy() !== null) return;
    if (this.lines().some(splitMismatch)) {
      this.notifications.error('Check the amounts', 'Borne By RHGT + Borne by Silal must equal Cost DH on every line.');
      return;
    }
    this.busy.set('save');
    this.service.saveLines(this.containerId, this.lines()).subscribe({
      next: (res) => { this.busy.set(null); this.apply(res); this.notifications.success('Saved', res.message || 'Changes saved.'); },
      error: (err) => { this.busy.set(null); this.notifications.error('Save failed', err?.error?.message || 'Could not save the changes.'); },
    });
  }

  // ---- original Excel viewer -----------------------------------------------------------------

  openViewer(): void { this.viewOpen.set(true); }

  // ---- Import Log (modal, paginated) ---------------------------------------------------------

  openLog(): void {
    this.logOpen.set(true);
    this.loadLog(1, this.logPageSize());
  }

  onLogPage(event: PaginatorState): void {
    this.loadLog((event.page ?? 0) + 1, event.rows ?? this.logPageSize());
  }

  private loadLog(page: number, pageSize: number): void {
    this.logLoading.set(true);
    this.logError.set(null);
    this.service.getHistory(this.containerId, page, pageSize).subscribe({
      next: (res) => {
        this.logItems.set(res.items);
        this.logTotal.set(res.total);
        this.logPage.set(res.page);
        this.logPageSize.set(res.pageSize);
        this.logLoading.set(false);
      },
      error: () => { this.logLoading.set(false); this.logError.set('Unable to load the import log right now.'); },
    });
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '–';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '–';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  actionLabel(action: string): string {
    return ({ import: 'Imported', reimport: 'Re-imported', edit: 'Edited', submit: 'Submitted & locked', unlock: 'Unlocked' } as Record<string, string>)[action] ?? action;
  }

  cellStyle(cell: SheetGrid['rows'][number]['cells'][number], rowHeight: number | null): Record<string, string> {
    const style: Record<string, string> = {
      textAlign: cell.align,
      verticalAlign: cell.valign,
      whiteSpace: cell.wrap ? 'normal' : 'nowrap',
      overflow: 'hidden',
      textOverflow: 'clip',
      padding: '2px 5px',
      fontSize: `${cell.fontPx ?? 12}px`,
      borderTop: borderCss(cell.borders.t) ?? '1px solid #eceff3',
      borderRight: borderCss(cell.borders.r) ?? '1px solid #eceff3',
      borderBottom: borderCss(cell.borders.b) ?? '1px solid #eceff3',
      borderLeft: borderCss(cell.borders.l) ?? '1px solid #eceff3',
    };
    if (cell.bold) style['fontWeight'] = '700';
    if (cell.italic) style['fontStyle'] = 'italic';
    if (cell.color) style['color'] = cell.color;
    if (cell.background) style['backgroundColor'] = cell.background;
    if (rowHeight) style['height'] = `${rowHeight}px`;
    return style;
  }
}
