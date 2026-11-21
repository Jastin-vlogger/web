import { Component, Input, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentCostSheet, PaymentCostSheetPermissions, PaymentCostSheetResponse } from '../../../../../../core/models/payment-cost-sheet.model';
import { PaymentCostSheetService } from '../../../../../../core/services/payment-cost-sheet.service';
import { NotificationService } from '../../../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../../../core/services/confirm-dialog.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { SheetGrid, borderCss, buildSheetGrid } from '../../shared/cost-sheet-grid.util';
import { downloadCostSheetPdf } from '../../shared/cost-sheet-pdf';

// Payment Costing: import the Accounts Excel cost sheet, review it exactly as imported, submit to lock it.
// Permissions come from the server (it also enforces them); this component only shows/hides buttons.
@Component({
  selector: 'app-payment-cost-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  readonly busy = signal<'import' | 'submit' | 'unlock' | 'excel' | null>(null);
  readonly sheet = signal<PaymentCostSheet | null>(null);
  readonly permissions = signal<PaymentCostSheetPermissions>({ canImport: false, canSubmit: false, canUnlock: false });
  readonly activeSheet = signal(0);
  readonly showHistory = signal(false);
  readonly unlockOpen = signal(false);
  unlockReason = '';

  readonly isLocked = computed(() => this.sheet()?.status === 'locked');
  readonly grids = computed<SheetGrid[]>(() => (this.sheet()?.snapshot?.sheets ?? []).map(buildSheetGrid));
  readonly currentGrid = computed(() => this.grids()[this.activeSheet()] ?? null);
  readonly tableWidth = computed(() => (this.currentGrid()?.colWidths ?? []).reduce((sum, w) => sum + w, 0));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['containerId'] && this.containerId) this.load();
  }

  private apply(res: PaymentCostSheetResponse): void {
    this.sheet.set(res.sheet);
    this.permissions.set(res.permissions);
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

  downloadExcel(): void {
    this.busy.set('excel');
    this.service.downloadExcel(this.containerId).subscribe({
      next: (blob) => {
        this.busy.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.fileStem().replace(/[^a-z0-9_-]/gi, '_')}.xlsx`;
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
    downloadCostSheetPdf(sheet.snapshot, {
      fileStem: this.fileStem(),
      importedLine: `Imported by ${sheet.importedBy || 'unknown'} on ${this.formatDate(sheet.importedAt)} | ${sheet.source.fileName}`,
      downloadedBy: user?.name || '',
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
    return ({ import: 'Imported', reimport: 'Re-imported', submit: 'Submitted & locked', unlock: 'Unlocked' } as Record<string, string>)[action] ?? action;
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
