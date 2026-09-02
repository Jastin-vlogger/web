import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LocalPurchaseService } from '../../services/local-purchase.service';
import { LocalPurchase } from '../../models/local-purchase.model';
import { RbacService } from '../../../../core/services/rbac.service';
import { LpEntryComponent } from './steps/lp-entry/lp-entry.component';
import { LpAllocationComponent } from './steps/lp-allocation/lp-allocation.component';
import { LpStorageComponent } from './steps/lp-storage/lp-storage.component';
import { LpQualityComponent } from './steps/lp-quality/lp-quality.component';

type LpTabKey = 'entry' | 'storage_allocation' | 'storage_arrival' | 'quality';

interface LpStepConfig {
  tabKey: LpTabKey;
  label: string;
  viewPermissionKey: string;
  editPermissionKey: string;
  approvePermissionKey?: string;
}

// 4-stage tracker orchestrator — reuses the *pattern* of shipment-form.component.ts's
// canViewStep/isStepReadOnly/maxEnabledStep (RBAC-gated steps, prerequisite-based unlocking),
// keyed off the local_purchase.tab.* permissions. No shared code with shipment-form.component.ts.
@Component({
  selector: 'app-local-purchase-tracker',
  standalone: true,
  imports: [CommonModule, LpEntryComponent, LpAllocationComponent, LpStorageComponent, LpQualityComponent],
  templateUrl: './local-purchase-tracker.component.html',
})
export class LocalPurchaseTrackerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private localPurchaseService = inject(LocalPurchaseService);
  private rbacService = inject(RbacService);

  readonly steps: LpStepConfig[] = [
    { tabKey: 'entry', label: 'Local Purchase Entry', viewPermissionKey: 'local_purchase.tab.entry.view', editPermissionKey: 'local_purchase.tab.entry.view' },
    { tabKey: 'storage_allocation', label: 'Storage Allocation', viewPermissionKey: 'local_purchase.tab.storage_allocation.view', editPermissionKey: 'local_purchase.tab.storage_allocation.edit', approvePermissionKey: 'local_purchase.tab.storage_allocation.approve_warehouse_manager' },
    { tabKey: 'storage_arrival', label: 'Storage Arrival', viewPermissionKey: 'local_purchase.tab.storage_arrival.view', editPermissionKey: 'local_purchase.tab.storage_arrival.edit' },
    { tabKey: 'quality', label: 'Quality', viewPermissionKey: 'local_purchase.tab.quality.view', editPermissionKey: 'local_purchase.tab.quality.edit' },
  ];

  localPurchaseId = signal<string>('');
  localPurchase = signal<LocalPurchase | null>(null);
  loading = signal(true);
  currentStepIndex = signal(0);

  readonly accessibleSteps = computed(() => this.steps.filter((s) => this.canViewStep(s)));

  // Entry (0) is a read-only recap of what was submitted at creation — there's nothing to
  // "complete" on it, so Storage Allocation (1) must always be reachable once the LP exists
  // (unlike the real Shipment flow, where Storage sits behind an earlier step — Port &
  // Clearance — that genuinely has data to submit first). Storage Arrival (2) unlocks once an
  // allocation has been saved at least once (not necessarily approved — the real flow doesn't
  // block Storage Arrival on BL Details approval either). Quality (3) unlocks once Storage
  // Arrival has actually been saved once.
  readonly maxEnabledStepIndex = computed(() => {
    const lp = this.localPurchase();
    if (!lp) return 0;
    if (lp.currentStage === 'Local Purchase Entry') return 1;
    if (lp.currentStage === 'Storage Allocation') return 2;
    return 3; // Storage & Arrival, Quality, or Completed — all unlock the Quality step
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.localPurchaseId.set(id);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.localPurchaseService.getById(this.localPurchaseId()).subscribe({
      next: (res) => {
        this.localPurchase.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading Local Purchase:', err);
        this.loading.set(false);
      },
    });
  }

  canViewStep(step: LpStepConfig): boolean {
    return this.rbacService.hasPermission(step.viewPermissionKey);
  }

  canEditStep(step: LpStepConfig): boolean {
    return this.rbacService.hasPermission(step.editPermissionKey);
  }

  canApproveStep(step: LpStepConfig): boolean {
    return !!step.approvePermissionKey && this.rbacService.hasPermission(step.approvePermissionKey);
  }

  isStepLocked(index: number): boolean {
    return index > this.maxEnabledStepIndex();
  }

  goToStep(index: number): void {
    if (this.isStepLocked(index)) return;
    this.currentStepIndex.set(index);
  }

  hasPreviousStep(): boolean {
    return this.currentStepIndex() > 0;
  }

  prevStep(): void {
    if (!this.hasPreviousStep()) return;
    this.currentStepIndex.update((i) => i - 1);
  }

  nextStepLabel(): string {
    const nextIndex = this.currentStepIndex() + 1;
    if (nextIndex >= this.accessibleSteps().length || this.isStepLocked(nextIndex)) return '';
    return this.accessibleSteps()[nextIndex]?.label || '';
  }

  nextStep(): void {
    const nextIndex = this.currentStepIndex() + 1;
    if (this.isStepLocked(nextIndex)) return;
    this.currentStepIndex.set(nextIndex);
  }

  onDataChanged(): void {
    this.load();
  }

  backToList(): void {
    this.router.navigate(['/local-purchase']);
  }
}
