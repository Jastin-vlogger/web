import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import {
  DashboardArrivalSummary,
  DashboardMonthlyTrend,
  DashboardStageBreakdown,
  DashboardShippingStatusMetric,
  DashboardStatusPivot,
  DashboardSummaryResponse,
  StorekeeperWarehouseRow,
} from '../../core/models/shipment.model';
import { DashboardService } from './services/dashboard.service';
import { RbacService } from '../../core/services/rbac.service';

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

  dashboard = signal<DashboardSummaryResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  orderStatusFilter = signal('All');
  readonly canCreateShipment = computed(() =>
    this.rbacService.hasPermission('shipment.screen.create_shipment.view')
  );

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
  private readonly STATUS_SNAPSHOT_CONFIG: { match: string[]; label: string; icon: string }[] = [
    { match: ['total lpo', 'total lpos'], label: 'Total LPOs', icon: 'pi pi-clipboard' },
    { match: ['completed lpo', 'completed'], label: 'Completed', icon: 'pi pi-box' },
    { match: ['open lpo', 'open'], label: 'Open', icon: 'pi pi-inbox' },
    { match: ['total shipments', 'no. of shipments', 'no of shipments'], label: 'No. of Shipments', icon: 'pi pi-server' },
    { match: ['at the port', 'at port'], label: 'At the Port', icon: 'pi pi-compass' },
    { match: ['on transit'], label: 'On Transit', icon: 'pi pi-truck' },
    { match: ['etd yet to due', 'eta yet to due'], label: 'ETA Yet To Due', icon: 'pi pi-calendar' },
    { match: ['etd yet to be confirmed'], label: 'ETD Yet To Be Confirmed', icon: 'pi pi-question-circle' },
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
          quantity: metric.quantity ?? metric.value ?? 0,
          fcl: metric.fcl ?? 0,
          mt: metric.mt ?? 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  });

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
      'DA Received',
      'Submitted to Bank',
      'DA Signed & Stamped',
      'Murabaha Required',
      'Murabaha Submitted to Bank',
      'Final Contract Submitted'
    ];
    const completedData = [
      f?.daReceived ?? 0,
      f?.submittedToBank ?? 0,
      f?.daSigned ?? 0,
      f?.murabahaRequired ?? 0,
      f?.murabahaSubmitted ?? 0,
      f?.finalContract ?? 0
    ];
    const pendingData = completedData.map(v => Math.max(totalBank - v, 0));

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
    const p = this.dashboard()?.fasDashboard?.providerWise || {};
    const allProviders = [
      { label: 'DHL', value: p.DHL ?? 0, color: '#3b82f6' },
      { label: 'Aramex', value: p.Aramex ?? 0, color: '#10b981' },
      { label: 'UPS', value: p.UPS ?? 0, color: '#f59e0b' },
      { label: 'TNT', value: p.TNT ?? 0, color: '#ef4444' },
    ];
    const providers = allProviders.filter((provider) => provider.value > 0);
    return {
      labels: providers.map((provider) => provider.label),
      datasets: [
        {
          data: providers.map((provider) => provider.value),
          backgroundColor: providers.map((provider) => provider.color)
        }
      ]
    };
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
      y: { grid: { display: false } }
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
