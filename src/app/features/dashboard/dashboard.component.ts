import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData } from 'chart.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DashboardArrivalSummary,
  DashboardMonthlyTrend,
  DashboardStageBreakdown,
  DashboardShippingStatusMetric,
  DashboardStatusPivot,
  DashboardSummaryResponse,
  DashboardPendingCompletedTile,
  StorekeeperWarehouseRow,
} from '../../core/models/shipment.model';
import { DashboardService } from './services/dashboard.service';
import { RbacService } from '../../core/services/rbac.service';
import { ShipmentService } from '../../core/services/shipment.service';
import { getShipmentStatusSeverity } from '../shipment/components/shipment-form/shared/shipment-status';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private rbacService = inject(RbacService);
  private shipmentService = inject(ShipmentService);

  dashboard = signal<DashboardSummaryResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  orderStatusFilter = signal('All');
  readonly canCreateShipment = computed(() =>
    this.rbacService.hasPermission('shipment.screen.create_shipment.view')
  );

  readonly activeDrillDownTile = signal<DashboardPendingCompletedTile | null>(null);

  openDrillDown(tile: DashboardPendingCompletedTile): void {
    this.activeDrillDownTile.set(tile);
  }

  // Per-tile drill-down destination — most tiles land on Document Tracker; Clearing Advance and
  // Payment Costing jump straight into the relevant BL Details sub-tab instead.
  private readonly DRILL_DOWN_SUB_TAB_BY_TILE_KEY: Record<string, 'cost' | 'payment_costing'> = {
    pendingClearingAdvanceProcessApproval: 'cost',
    pendingPaymentCosting: 'payment_costing',
  };

  getDrillDownQueryParams(tileKey: string, shipmentIndex: number | null | undefined): Record<string, any> {
    const subTab = this.DRILL_DOWN_SUB_TAB_BY_TILE_KEY[tileKey];
    if (subTab && shipmentIndex != null) {
      return { tab: 'bl_details', shipmentIndex, subTab };
    }
    return { tab: 'document_tracker' };
  }

  getDrillDownStatusClasses(status: string | null | undefined): string {
    const severity = getShipmentStatusSeverity(status || '');
    if (severity === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (severity === 'info') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (severity === 'warn') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

  closeDrillDown(): void {
    this.activeDrillDownTile.set(null);
  }

  openStorekeeperPendingDrillDown(row: StorekeeperWarehouseRow): void {
    // Reuses the same drill-down modal as the FAS/Logistics tiles — it only ever reads
    // `label` and `pendingShipments` from the tile, so a lightweight compatible object is enough.
    this.openDrillDown({
      key: `storekeeper-pending-${row.warehouse}`,
      label: `Pending Receiving — ${row.warehouse}`,
      pending: row.pendingReceiving,
      completed: row.received,
      pendingShipments: row.pendingShipments,
    });
  }

  openStageOverviewDrillDown(stage: 'cad' | 'murabaha' | 'finalContract'): void {
    const f = this.dashboard()?.fasDashboard?.stageOverview;
    if (!f) return;
    const configByStage = {
      cad: { label: 'Cash Against Document (CAD) — Pending', pending: f.cadPending, completed: f.cadCompleted, pendingShipments: f.cadPendingShipments },
      murabaha: { label: 'Murabaha Through — Pending', pending: f.murabahaPending, completed: f.murabahaCompleted, pendingShipments: f.murabahaPendingShipments },
      finalContract: { label: 'Final Contract — Pending', pending: Math.max((f.totalBank ?? 0) - (f.finalContract ?? 0), 0), completed: f.finalContract, pendingShipments: f.finalContractPendingShipments },
    };
    const cfg = configByStage[stage];
    this.openDrillDown({
      key: `stage-overview-${stage}`,
      label: cfg.label,
      pending: cfg.pending ?? 0,
      completed: cfg.completed ?? 0,
      pendingShipments: cfg.pendingShipments ?? [],
    });
  }

  canViewDashboardSection(permissionKey: string): boolean {
    if (!this.rbacService.hasPermissionDefinition('dashboard.section.')) {
      return this.rbacService.hasPermission('menu.dashboard.view');
    }
    return this.rbacService.hasPermission(permissionKey);
  }

  canViewDashboardPermission(permissionKey: string | null | undefined): boolean {
    if (!permissionKey) return true;
    if (!this.rbacService.hasPermissionDefinition('dashboard.')) {
      return this.rbacService.hasPermission('menu.dashboard.view');
    }
    return this.rbacService.hasPermission(permissionKey);
  }

  // New Chart Implementation Setup
  selectedChartType = signal('qtyMapping');

  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    }
  };

  statusPivotChartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${this.formatPivotNumber(Number(context.raw || 0))} MT`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value) => this.formatPivotNumber(Number(value)),
        },
      },
      y: {
        stacked: true,
      },
    },
  };

  readonly statCards = computed(() => {
    const summary = this.dashboard();
    if (!summary) return [];

    return [
      {
        label: 'Total Shipments',
        value: summary.kpis.totalShipments,
        tone: 'slate',
        icon: 'pi pi-box'
      },
      {
        label: 'Completed',
        value: summary.kpis.completedShipments,
        tone: 'emerald',
        icon: 'pi pi-check-circle'
      },
      {
        label: 'In Progress',
        value: summary.kpis.inProgressShipments,
        tone: 'blue',
        icon: 'pi pi-sync'
      },
      {
        label: 'Under Clearance',
        value: summary.kpis.underClearanceShipments,
        tone: 'amber',
        icon: 'pi pi-globe'
      },
      {
        label: summary.rolePending?.label || 'Pending For Your Role',
        value: summary.rolePending?.count || 0,
        tone: 'rose',
        icon: 'pi pi-hourglass'
      }
    ];
  });

  readonly arrivalMetrics = computed(() => {
    const arrival = this.dashboard()?.arrivalSummary;
    if (!arrival) return [];

    return [
      { label: 'Arrived Containers', value: arrival.arrivedContainers, tone: 'emerald' },
      { label: 'Pending Arrival', value: arrival.pendingArrivalContainers, tone: 'blue' },
      { label: 'Due This Week', value: arrival.dueThisWeekShipments, tone: 'amber' },
      { label: 'Overdue ETA', value: arrival.overdueShipments, tone: 'rose' }
    ];
  });

  readonly stageMax = computed(() =>
    Math.max(...(this.dashboard()?.stageBreakdown ?? []).map((item) => item.count), 0)
  );

  readonly monthlyMax = computed(() =>
    Math.max(...(this.dashboard()?.monthlyTrend ?? []).map((item) => item.count), 0)
  );

  readonly orderStatusOptions = computed(() => {
    const orders = this.dashboard()?.shippingStatus?.orders ?? [];
    const statuses = new Set(orders.map((s) => s.orderStatus).filter(Boolean));
    return ['All', ...Array.from(statuses)];
  });

  readonly filteredOrders = computed(() => {
    const rows = this.dashboard()?.shippingStatus?.orders ?? [];
    const selected = this.orderStatusFilter();
    if (selected === 'All') return rows;
    return rows.filter((row) => (row.orderStatus || '').toLowerCase() === selected.toLowerCase());
  });

  /**
   * Status Snapshot table rows (STATUS / QUANTITY / FCL / MT), ordered to match the
   * operations dashboard design. Each entry maps one or more backend metric labels to a
   * display label + icon; rows the user can't view (by permission) are dropped.
   */
  private readonly STATUS_SNAPSHOT_CONFIG: { match: string[]; label: string; icon: string; section: 'lpo' | 'shipment' }[] = [
    { match: ['total lpo', 'total lpos'], label: 'Total LPOs', icon: 'pi pi-clipboard', section: 'lpo' },
    { match: ['completed lpo', 'completed'], label: 'Completed', icon: 'pi pi-box', section: 'lpo' },
    { match: ['open lpo', 'open'], label: 'Open', icon: 'pi pi-inbox', section: 'lpo' },
    { match: ['total shipments', 'no. of shipments', 'no of shipments'], label: 'No. of Shipments', icon: 'pi pi-server', section: 'shipment' },
    { match: ['delivered wh', 'delivered to wh', 'delivered to warehouse'], label: 'Delivered to WH', icon: 'pi pi-warehouse', section: 'shipment' },
    { match: ['at the port', 'at port'], label: 'At the Port', icon: 'pi pi-compass', section: 'shipment' },
    { match: ['on transit'], label: 'On Transit', icon: 'pi pi-truck', section: 'shipment' },
    { match: ['etd yet to due', 'eta yet to due'], label: 'ETD Yet To Due', icon: 'pi pi-calendar', section: 'shipment' },
    { match: ['etd yet to be confirmed'], label: 'Shipment Not Scheduled', icon: 'pi pi-question-circle', section: 'shipment' },
  ];

  readonly statusSnapshotRows = computed(() => {
    const metrics = this.dashboard()?.shippingStatus?.volumeToday ?? [];
    const byLabel = new Map<string, DashboardShippingStatusMetric>();
    for (const metric of metrics) {
      byLabel.set(String(metric.label || '').trim().toLowerCase(), metric);
    }

    return this.STATUS_SNAPSHOT_CONFIG
      .map((config) => {
        const metric = config.match.map((key) => byLabel.get(key)).find((found) => !!found);
        if (!metric || !this.canViewDashboardPermission(metric.permissionKey)) return null;
        return {
          label: config.label,
          icon: config.icon,
          section: config.section,
          quantity: metric.quantity ?? metric.value ?? 0,
          fcl: metric.fcl ?? 0,
          mt: metric.mt ?? 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  });

  // "Shipment Movement Tracker" card: real per-container shipments currently at the port or
  // on transit (shipment no + commercial invoice no), from the dashboard's own shipmentMovement
  // field — not derived from the Status Snapshot aggregate counts.
  readonly shipmentMovement = computed(() => this.dashboard()?.shipmentMovement ?? { atPort: [], onTransit: [] });

  readonly inventoryRows = computed(() => {
    const inventory = this.dashboard()?.shippingStatus?.inventory ?? [];
    if (inventory.length) return inventory;
    return (this.dashboard()?.recentShipments ?? []).slice(0, 5).map((row) => ({
      category: 'Shipment',
      product: row.item || row.shipmentNo,
      sku: row._id?.slice(-6).toUpperCase(),
      inStock: row.totalAmount ? Math.max(Math.round(row.totalAmount / 10000), 1) : 0,
    }));
  });

  readonly performanceRows = computed(() => {
    const rows = this.dashboard()?.shippingStatus?.financialPerformance ?? [];
    if (rows.length) return rows;

    const trend = this.dashboard()?.monthlyTrend ?? [];
    const labels = ['NA', 'EUR', 'Asia', 'SA'];
    return labels.map((label, index) => {
      const entry = trend[index % Math.max(trend.length, 1)];
      const count = entry?.count ?? 0;
      return {
        label,
        cashToCash: Math.max(count * 3 - 10, -15),
        accountRec: Math.max(count * 2, 5),
        inventoryDays: Math.max(count * 2 + 4, 8),
        payableDays: Math.max(count * 3 + 6, 12),
      };
    });
  });

  readonly kpiMonthlyRows = computed(() => {
    const rows = this.dashboard()?.shippingStatus?.monthlyKpis ?? [];
    if (rows.length) return rows;

    const trend = this.dashboard()?.monthlyTrend ?? [];
    return trend.slice(-4).map((entry, index, arr) => {
      const prev = arr[index - 1]?.count ?? entry.count ?? 1;
      const change = prev ? ((entry.count - prev) / prev) * 100 : 0;
      return {
        metric: `${entry.label} ${entry.year}`,
        thisMonth: entry.count,
        pastMonth: prev,
        change,
      };
    });
  });

  readonly recentShipments = computed(() => {
    return this.dashboard()?.recentShipments ?? [];
  });

  readonly statusPivot = computed(() => this.dashboard()?.statusPivot ?? null);
  readonly statusPivotByItem = computed(() => this.dashboard()?.statusPivotByItem ?? null);

  private buildStatusPivotChartConfig(pivot: DashboardStatusPivot | null): ChartData<'bar'> {
    if (!pivot || !pivot.rows.length || !pivot.columns.length) {
      return { labels: [], datasets: [] };
    }

    const colors = ['#10b981', '#f59e0b', '#3b82f6', '#64748b', '#8b5cf6', '#06b6d4'];
    return {
      labels: pivot.rows.map((row) => row.supplier),
      datasets: pivot.columns.map((column, index) => ({
        label: column,
        data: pivot.rows.map((row) => Number(row.values[column] || 0)),
        backgroundColor: colors[index % colors.length],
        borderColor: '#ffffff',
        borderWidth: 1,
      })),
    };
  }

  readonly statusPivotChartConfig = computed<ChartData<'bar'>>(() => this.buildStatusPivotChartConfig(this.statusPivot()));
  readonly statusPivotByItemChartConfig = computed<ChartData<'bar'>>(() => this.buildStatusPivotChartConfig(this.statusPivotByItem()));

  // ── Department charts (Warehouse / FAS / Logistics) ─────────────────────────
  doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { display: false },
    },
  };

  private buildDoughnut(values: number[], colors: string[], labels: string[]): ChartData<'doughnut'> {
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }

  readonly warehouseChartStats = computed(() => {
    const w = this.dashboard()?.departmentCharts?.warehouse;
    return [
      { label: 'Arrived', value: w?.arrived ?? 0, tone: 'emerald' },
      { label: 'Pending', value: w?.pending ?? 0, tone: 'amber' },
      { label: 'In Transit', value: w?.inTransit ?? 0, tone: 'blue' },
    ];
  });

  readonly warehouseChartConfig = computed<ChartData<'doughnut'>>(() => {
    const w = this.dashboard()?.departmentCharts?.warehouse;
    return this.buildDoughnut(
      [w?.arrived ?? 0, w?.pending ?? 0, w?.inTransit ?? 0],
      ['#10b981', '#f59e0b', '#3b82f6'],
      ['Arrived', 'Pending', 'In Transit']
    );
  });

  readonly fasChartStats = computed(() => {
    const f = this.dashboard()?.departmentCharts?.fas;
    return [
      { label: 'Submitted', value: f?.submitted ?? 0, tone: 'blue' },
      { label: 'Pending', value: f?.pending ?? 0, tone: 'amber' },
      { label: 'Approved', value: f?.approved ?? 0, tone: 'emerald' },
    ];
  });

  readonly fasChartConfig = computed<ChartData<'doughnut'>>(() => {
    const f = this.dashboard()?.departmentCharts?.fas;
    return this.buildDoughnut(
      [f?.submitted ?? 0, f?.pending ?? 0, f?.approved ?? 0],
      ['#3b82f6', '#f59e0b', '#10b981'],
      ['Submitted', 'Pending', 'Approved']
    );
  });

  readonly fasReceiverTypeChartConfig = computed<ChartData<'doughnut'>>(() => {
    const f = this.dashboard()?.fasDashboard?.receiverType;
    return this.buildDoughnut(
      [f?.bank ?? 0, f?.direct ?? 0],
      ['#10b981', '#3b82f6'],
      ['Bank Receiver', 'Direct Receiver']
    );
  });

  // ── Warehouse Manager dashboard ───────────────────────────────────────────
  readonly warehouseDashboard = computed(() => this.dashboard()?.warehouseDashboard ?? null);

  readonly warehouseAllocationStatusChartConfig = computed<ChartData<'doughnut'>>(() => {
    const a = this.warehouseDashboard()?.allocationStatus;
    return this.buildDoughnut(
      [a?.allocated ?? 0, a?.pendingAllocation ?? 0],
      ['#10b981', '#f59e0b'],
      ['Allocated', 'Pending Allocation']
    );
  });

  readonly warehouseReceivingStatusChartConfig = computed<ChartData<'doughnut'>>(() => {
    const r = this.warehouseDashboard()?.receivingStatus;
    return this.buildDoughnut(
      [r?.received ?? 0, r?.pendingReceiving ?? 0],
      ['#10b981', '#f59e0b'],
      ['Received', 'Pending Receiving']
    );
  });

  // Progress ring (conic-gradient) for a per-warehouse row.
  warehouseProgressRing(progress: number): string {
    const p = Math.max(0, Math.min(Number(progress) || 0, 100));
    return `conic-gradient(#10b981 ${p}%, #e2e8f0 ${p}% 100%)`;
  }

  // Width % for the received portion of a warehouse's allocated bar.
  warehouseReceivedWidth(row: { allocated: number; received: number }): string {
    const allocated = Number(row?.allocated) || 0;
    if (allocated <= 0) return '0%';
    return `${Math.max(0, Math.min((Number(row?.received) || 0) / allocated * 100, 100))}%`;
  }

  // ── Storekeeper dashboard ─────────────────────────────────────────────────
  readonly storekeeperDashboard = computed(() => this.dashboard()?.storekeeperDashboard ?? null);

  readonly storekeeperReceivingStatusChartConfig = computed<ChartData<'doughnut'>>(() => {
    const s = this.storekeeperDashboard()?.receivingStatus;
    return this.buildDoughnut(
      [s?.received ?? 0, s?.pendingReceiving ?? 0],
      ['#10b981', '#f59e0b'],
      ['Received', 'Pending Receiving']
    );
  });

  readonly storekeeperReceivingTimelineChartConfig = computed<ChartData<'line'>>(() => {
    const timeline = this.storekeeperDashboard()?.receivingTimeline ?? [];
    return {
      labels: timeline.map((p) => p.label),
      datasets: [
        {
          label: 'Received (FCL)',
          data: timeline.map((p) => p.received),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
        {
          label: 'Pending (FCL)',
          data: timeline.map((p) => p.pending),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.06)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    };
  });

  readonly lineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
    scales: {
      x: { ticks: { font: { size: 9 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { font: { size: 9 }, precision: 0 }, grid: { color: 'rgba(0,0,0,0.04)' } },
    },
  };

  storekeeperProgressRing(progress: number): string {
    const p = Math.max(0, Math.min(Number(progress) || 0, 100));
    return `conic-gradient(#10b981 ${p}%, #e2e8f0 ${p}% 100%)`;
  }

  storekeeperReceivedWidth(row: StorekeeperWarehouseRow): string {
    const allocated = Number(row?.allocated) || 0;
    if (allocated <= 0) return '0%';
    return `${Math.max(0, Math.min((Number(row?.received) || 0) / allocated * 100, 100))}%`;
  }

  readonly fasStatusBreakdownChartConfig = computed<ChartData<'doughnut'>>(() => {
    const f = this.dashboard()?.fasDashboard?.statusBreakdown;
    return this.buildDoughnut(
      [f?.completed ?? 0, f?.inProgress ?? 0, f?.pending ?? 0, f?.overdue ?? 0],
      ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
      ['Completed', 'In Progress', 'Pending', 'Overdue']
    );
  });

  readonly fasStageOverviewChartConfig = computed<ChartData<'bar'>>(() => {
    const f = this.dashboard()?.fasDashboard?.stageOverview;
    const totalBank = f?.totalBank ?? 0;
    const labels = [
      'Cash Against Document (CAD)',
      'Murabaha Through',
      'Final Contract (Include CAD & Murabaha)'
    ];
    const completedData = [
      f?.cadCompleted ?? 0,
      f?.murabahaCompleted ?? 0,
      f?.finalContract ?? 0
    ];
    // CAD and Murabaha Through each have their own denominator (containers that skipped
    // Murabaha vs. didn't) — only Final Contract's pending is "everything else out of totalBank".
    const pendingData = [
      f?.cadPending ?? 0,
      f?.murabahaPending ?? 0,
      Math.max(totalBank - (f?.finalContract ?? 0), 0)
    ];

    return {
      labels,
      datasets: [
        {
          label: 'Completed',
          data: completedData,
          backgroundColor: '#10b981',
          stack: 'stack0'
        },
        {
          label: 'Pending',
          data: pendingData,
          backgroundColor: '#e2e8f0',
          stack: 'stack0'
        }
      ]
    };
  });

  readonly fasProviderWiseChartConfig = computed<ChartData<'bar'>>(() => {
    // providerWise is now a dynamic array of { label, value } — real free-text courier names
    // (e.g. "Kara Express company"), not a fixed DHL/Aramex/UPS/TNT set. See buildDashboardStatusPivot's
    // palette below for the same cyclical-color pattern used elsewhere on this dashboard.
    const colors = ['#10b981', '#f59e0b', '#3b82f6', '#64748b', '#8b5cf6', '#06b6d4', '#ef4444', '#f97316'];
    const providers: Array<{ label: string; value: number }> = this.dashboard()?.fasDashboard?.providerWise || [];
    return {
      labels: providers.map((provider) => provider.label),
      datasets: [
        {
          data: providers.map((provider) => provider.value),
          backgroundColor: providers.map((_, index) => colors[index % colors.length])
        }
      ]
    };
  });

  // Enough height per provider bar for its label to render legibly — a fixed short height
  // is what caused Chart.js to silently drop labels for a real (variable-length) provider list.
  readonly providerChartHeight = computed(() => {
    const count = (this.dashboard()?.fasDashboard?.providerWise || []).length;
    return Math.max(110, count * 28);
  });

  horizontalBarChartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { grid: { display: false } },
      // autoSkip (Chart.js default: true) silently drops category labels when there isn't
      // enough vertical space per bar — with a dynamic, real provider list (not a fixed
      // 4-name set) this was hiding 2 of 5 names outright. Every category must show its label.
      y: { grid: { display: false }, ticks: { autoSkip: false } }
    }
  };

  horizontalStackedBarChartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' }
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: { stacked: true, grid: { display: false } }
    }
  };

  readonly logisticsChartStats = computed(() => {
    const l = this.dashboard()?.departmentCharts?.logistics;
    return [
      { label: 'Cleared', value: l?.cleared ?? 0, tone: 'emerald' },
      { label: 'Not Cleared', value: l?.notCleared ?? 0, tone: 'rose' },
    ];
  });

  readonly logisticsChartConfig = computed<ChartData<'doughnut'>>(() => {
    const l = this.dashboard()?.departmentCharts?.logistics;
    return this.buildDoughnut(
      [l?.cleared ?? 0, l?.notCleared ?? 0],
      ['#10b981', '#ef4444'],
      ['Cleared', 'Not Cleared']
    );
  });

  readonly hasDepartmentChartData = computed(() => !!this.dashboard()?.departmentCharts);

  formatPivotNumber(value: number | null | undefined): string {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  getPivotFclTotal(pivot: DashboardStatusPivot, column: string): number {
    return Number(pivot.totalsFCL?.[column] || 0);
  }

  getStatusSeverity(status: string | null | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const s = String(status || '').trim().toLowerCase();
    if (!s) return 'secondary';
    if (s.includes('reached wh')) return 'success';
    if (s.includes('at port of discharge')) return 'warn';
    if (s.includes('on transit')) return 'info';
    if (s.includes('etd yet to due')) return 'secondary';
    if (s.includes('completed')) return 'success';
    if (s.includes('delayed') || s.includes('error')) return 'danger';
    return 'secondary';
  }

  readonly chartDataConfig = computed<ChartData<'bar'>>(() => {
    const data = this.dashboard()?.chartData;
    if (!data) return { labels: [], datasets: [] };

    const type = this.selectedChartType();
    let matrix: any[] = [];
    if (type === 'qtyMapping') matrix = data.qtyMapping;
    else if (type === 'valueMapping') matrix = data.valueMapping;
    else if (type === 'yearlyQtyMapping') matrix = data.yearlyQtyMapping;
    else if (type === 'supplierAvgFc') matrix = data.supplierAvgFc;
    else if (type === 'supplierYearlyQty') matrix = data.supplierYearlyQty;

    if (!matrix || matrix.length === 0) return { labels: [], datasets: [] };

    const labels = matrix.map(row => row.rowLabel);
    
    // Collect all columns across all rows excluding 'rowLabel'
    const columnsSet = new Set<string>();
    matrix.forEach(row => {
      Object.keys(row).forEach(k => {
        if (k !== 'rowLabel') columnsSet.add(k);
      });
    });
    
    // To match excel, we might hardcode or let it be dynamic
    const columns = Array.from(columnsSet);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    const datasets = columns.map((col, index) => {
      return {
        data: matrix.map(row => Number(row[col]) || 0),
        label: col,
        backgroundColor: colors[index % colors.length]
      };
    });

    return { labels, datasets };
  });

  readonly comparisonChartConfig = computed<ChartData<'bar'>>(() => {
    const data = this.dashboard()?.chartData;
    if (!data || !data.supplierAvgFc || data.supplierAvgFc.length === 0) return { labels: [], datasets: [] };

    const matrix = data.supplierAvgFc;
    const labels = matrix.map((row: any) => row.rowLabel);
    
    // Collect all columns across all rows excluding 'rowLabel'
    const columnsSet = new Set<string>();
    matrix.forEach((row: any) => {
      Object.keys(row).forEach(k => {
        if (k !== 'rowLabel') columnsSet.add(k);
      });
    });
    
    const columns = Array.from(columnsSet);
    // Use alternate palette to differentiate from primary chart
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

    const datasets = columns.map((col, index) => {
      return {
        data: matrix.map((row: any) => Number(row[col]) || 0),
        label: col,
        backgroundColor: colors[index % colors.length]
      };
    });

    return { labels, datasets };
  });

  // PO-wise "Average FC per Unit" — same chart shape as comparisonChartConfig above, but rows
  // are PO numbers instead of items (pre-aggregated server-side across ALL POs at once — no
  // dropdown/selection needed, every PO's bar renders directly with its PO number as the axis
  // label underneath, same as any other bar chart).
  readonly poAvgFcChartConfig = computed<ChartData<'bar'>>(() => {
    const matrix = this.dashboard()?.chartData?.supplierAvgFcByPo ?? [];
    if (!matrix.length) return { labels: [], datasets: [] };

    const labels = matrix.map((row: any) => row.rowLabel);
    const columnsSet = new Set<string>();
    matrix.forEach((row: any) => {
      Object.keys(row).forEach(k => {
        if (k !== 'rowLabel') columnsSet.add(k);
      });
    });

    const columns = Array.from(columnsSet);
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

    const datasets = columns.map((col, index) => ({
      data: matrix.map((row: any) => Number(row[col]) || 0),
      label: col,
      backgroundColor: colors[index % colors.length]
    }));

    return { labels, datasets };
  });

  // ===== Point 7: per-chart Excel/PDF export =====
  readonly EXPORTABLE_CHARTS: { key: string; label: string }[] = [
    { key: 'statusSnapshot', label: 'Status Snapshot' },
    { key: 'documentsReceived', label: 'Documents Received By' },
    { key: 'shipmentMovement', label: 'New Shipments' },
    { key: 'provider', label: 'Provider' },
    { key: 'statusPivotSupplier', label: 'Shipment Status as of the date' },
    { key: 'statusPivotItem', label: 'Shipment Status as of the date - By Item' },
    { key: 'dynamicMetrics', label: 'Dynamic Metrics Explorer' },
    { key: 'avgFcSupplier', label: 'Average FC per Unit by Supplier' },
    { key: 'avgFcPoWise', label: 'Average FC per Unit by Supplier - PO Wise' },
    { key: 'storekeeperSummary', label: 'Storekeeper Dashboard' },
    { key: 'warehouseSummary', label: 'Warehouse Manager Dashboard' },
  ];

  // Canvas element id for each chart-bearing card (matches [id]="'chart-' + key" set on the
  // <canvas baseChart> in the template) — used to grab the LIVE rendered chart at export time via
  // Chart.getChart(), so export reproduces the same graphic the user sees, not just its numbers.
  // Cards not listed here have no canvas (Status Snapshot etc. are plain tables) — export falls
  // back to their table data alone.
  private readonly CHART_CANVAS_KEYS = new Set([
    'documentsReceived', 'provider', 'statusPivotSupplier', 'statusPivotItem',
    'dynamicMetrics', 'avgFcSupplier', 'avgFcPoWise',
  ]);

  readonly openExportMenuKey = signal<string>('');
  readonly exportingChartKey = signal<string>('');
  readonly exportError = signal<string>('');

  toggleExportMenu(key: string): void {
    this.openExportMenuKey.set(this.openExportMenuKey() === key ? '' : key);
  }

  @HostListener('document:click')
  closeExportMenus(): void {
    this.openExportMenuKey.set('');
  }

  private getChartImage(key: string): string | null {
    if (!this.CHART_CANVAS_KEYS.has(key)) return null;
    const canvas = document.getElementById(`chart-${key}`) as HTMLCanvasElement | null;
    const chart = canvas ? Chart.getChart(canvas) : undefined;
    return chart ? chart.toBase64Image() : null;
  }

  private numOrEmpty(value: unknown): string | number {
    return typeof value === 'number' ? value : (value ?? '') as string;
  }

  private buildMatrixExportPayload(
    title: string,
    matrix: any[],
    firstColumnLabel: string
  ): { title: string; columns: string[]; rows: (string | number)[][] } | null {
    if (!matrix || !matrix.length) return null;
    const columnsSet = new Set<string>();
    matrix.forEach((row) => Object.keys(row).forEach((k) => { if (k !== 'rowLabel') columnsSet.add(k); }));
    const columns = Array.from(columnsSet);
    return {
      title,
      columns: [firstColumnLabel, ...columns],
      rows: matrix.map((row) => [row.rowLabel, ...columns.map((c) => this.numOrEmpty(row[c]))]),
    };
  }

  private getExportPayload(chartKey: string): { title: string; columns: string[]; rows: (string | number)[][] } | null {
    switch (chartKey) {
      case 'statusSnapshot': {
        const rows = this.statusSnapshotRows();
        if (!rows.length) return null;
        return {
          title: 'Status Snapshot',
          columns: ['Status', 'Numbers', 'FCL', 'MT'],
          rows: rows.map((r) => [r.label, r.quantity, r.fcl, r.mt]),
        };
      }
      case 'documentsReceived': {
        const d = this.dashboard()?.fasDashboard?.receiverType;
        if (!d) return null;
        return {
          title: 'Documents Received By',
          columns: ['Type', 'Count'],
          rows: [['Bank', d.bank ?? 0], ['Direct', d.direct ?? 0]],
        };
      }
      case 'shipmentMovement': {
        const movement = this.shipmentMovement();
        const rows = [
          ...movement.atPort.map((s) => ['At the Port', s.shipmentNo, s.commercialInvoiceNo ?? '']),
          ...movement.onTransit.map((s) => ['On Transit', s.shipmentNo, s.commercialInvoiceNo ?? '']),
        ];
        if (!rows.length) return null;
        return {
          title: 'New Shipments',
          columns: ['Status', 'Shipment No.', 'Commercial Invoice No.'],
          rows,
        };
      }
      case 'provider': {
        const providers: Array<{ label: string; value: number }> = this.dashboard()?.fasDashboard?.providerWise || [];
        if (!providers.length) return null;
        return {
          title: 'Provider',
          columns: ['Provider', 'Count'],
          rows: providers.map((p) => [p.label, p.value]),
        };
      }
      case 'statusPivotSupplier': {
        const pivot = this.statusPivot();
        if (!pivot || !pivot.rows?.length) return null;
        return {
          title: 'Shipment Status as of the date',
          columns: [pivot.rowLabel || 'Supplier', ...pivot.columns, 'Grand Total'],
          rows: pivot.rows.map((r) => [r.supplier, ...pivot.columns.map((c) => r.values[c] ?? 0), r.grandTotal]),
        };
      }
      case 'statusPivotItem': {
        const pivot = this.statusPivotByItem();
        if (!pivot || !pivot.rows?.length) return null;
        return {
          title: 'Shipment Status as of the date - By Item',
          columns: [pivot.rowLabel || 'Item', ...pivot.columns, 'Grand Total'],
          rows: pivot.rows.map((r) => [r.supplier, ...pivot.columns.map((c) => r.values[c] ?? 0), r.grandTotal]),
        };
      }
      case 'dynamicMetrics': {
        const type = this.selectedChartType();
        const matrix: any[] = (this.dashboard()?.chartData as any)?.[type] || [];
        return this.buildMatrixExportPayload(`Dynamic Metrics Explorer (${type})`, matrix, 'Item');
      }
      case 'avgFcSupplier': {
        const matrix = this.dashboard()?.chartData?.supplierAvgFc || [];
        return this.buildMatrixExportPayload('Average FC per Unit by Supplier', matrix, 'Item');
      }
      case 'avgFcPoWise': {
        const matrix = this.dashboard()?.chartData?.supplierAvgFcByPo || [];
        return this.buildMatrixExportPayload('Average FC per Unit by Supplier - PO Wise', matrix, 'PO Number');
      }
      case 'storekeeperSummary': {
        const rows = this.storekeeperDashboard()?.byWarehouse || [];
        if (!rows.length) return null;
        return {
          title: 'Storekeeper Dashboard',
          columns: ['Warehouse', 'Total Assigned (FCL)', 'Received (FCL)', 'Pending Receiving (FCL)', 'Progress %'],
          rows: rows.map((r: any) => [r.warehouse, r.allocated, r.received, r.pendingReceiving, r.progress]),
        };
      }
      case 'warehouseSummary': {
        const rows = this.warehouseDashboard()?.byWarehouse || [];
        if (!rows.length) return null;
        return {
          title: 'Warehouse Manager Dashboard',
          columns: ['Warehouse', 'Allocated (FCL)', 'Received (FCL)', 'Pending (FCL)', 'Progress %'],
          rows: rows.map((r: any) => [r.warehouse, r.allocated, r.received, r.pendingReceiving, r.progress]),
        };
      }
      default:
        return null;
    }
  }

  // Per-card export: click the card's own download icon → pick Excel or PDF from the small
  // menu that opens right there. Chart-bearing cards export the ACTUAL rendered chart image
  // (same graphic on screen) via getChartImage(); table-only cards fall back to their data.
  exportCard(key: string, format: 'excel' | 'pdf'): void {
    this.openExportMenuKey.set('');
    const payload = this.getExportPayload(key);
    const imageBase64 = this.getChartImage(key);
    if (!payload && !imageBase64) return;

    const title = payload?.title ?? this.EXPORTABLE_CHARTS.find((c) => c.key === key)?.label ?? key;
    const filenameBase = title.replace(/[^a-z0-9_-]/gi, '_');

    if (format === 'pdf') {
      this.exportToPdf(title, payload, imageBase64);
      return;
    }

    this.exportingChartKey.set(key);
    this.shipmentService
      .exportDashboardChartExcel({ title, columns: payload?.columns, rows: payload?.rows, imageBase64: imageBase64 ?? undefined })
      .subscribe({
        next: (blob) => {
          this.exportingChartKey.set('');
          this.downloadBlob(blob, `${filenameBase}.xlsx`);
        },
        error: () => {
          this.exportingChartKey.set('');
          this.exportError.set(`Export failed for ${title}.`);
        }
      });
  }

  private exportToPdf(
    title: string,
    payload: { columns: string[]; rows: (string | number)[][] } | null,
    imageBase64: string | null
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Royal Horizon Group', 28, 24);
    doc.setFontSize(10);
    doc.text(title, 28, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 28, 50);
    doc.setTextColor(0);

    let nextY = 58;
    if (imageBase64) {
      // Same chart the user sees — embedded as-is, sized to fit the page width.
      const imgWidth = 540;
      const imgHeight = 300;
      doc.addImage(imageBase64, 'PNG', 28, nextY, imgWidth, imgHeight);
      nextY += imgHeight + 16;
    }

    if (payload && payload.rows.length) {
      autoTable(doc, {
        startY: nextY,
        head: [payload.columns],
        body: payload.rows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontStyle: 'bold' },
      });
    }

    doc.save(`${title.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  ngOnInit(): void {
    this.dashboardService.getSummary().subscribe({
      next: (summary) => {
        this.dashboard.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load dashboard data right now.');
        this.loading.set(false);
      }
    });
  }

  getStageWidth(entry: DashboardStageBreakdown): string {
    const max = this.stageMax();
    if (!max) return '0%';
    return `${Math.max((entry.count / max) * 100, 8)}%`;
  }

  getTrendHeight(entry: DashboardMonthlyTrend): string {
    const max = this.monthlyMax();
    if (!max) return '12%';
    return `${Math.max((entry.count / max) * 100, 12)}%`;
  }

  getArrivalWidth(value: number, summary: DashboardArrivalSummary | undefined): string {
    const total = summary
      ? Math.max(
          summary.arrivedContainers,
          summary.pendingArrivalContainers,
          summary.dueThisWeekShipments,
          summary.overdueShipments,
          1
        )
      : 1;

    return `${Math.max((value / total) * 100, 10)}%`;
  }

  onOrderStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || 'All';
    this.orderStatusFilter.set(value);
  }

  onChartTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || 'qtyMapping';
    this.selectedChartType.set(value);
  }

  getStagePieGradient(): string {
    const stages = this.dashboard()?.stageBreakdown ?? [];
    const total = stages.reduce((sum, item) => sum + item.count, 0);
    if (!total) {
      return 'conic-gradient(#e2e8f0 0 100%)';
    }

    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    let cursor = 0;
    const slices = stages.map((item, index) => {
      const share = (item.count / total) * 100;
      const start = cursor;
      cursor += share;
      return `${palette[index % palette.length]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${slices.join(',')})`;
  }

  getPerfBarHeight(value: number): string {
    const max = Math.max(
      ...this.performanceRows().flatMap((row) => [row.cashToCash, row.accountRec, row.inventoryDays, row.payableDays]),
      1
    );
    const normalized = ((value + 20) / (max + 20)) * 100;
    return `${Math.max(8, Math.min(normalized, 100))}%`;
  }
}
