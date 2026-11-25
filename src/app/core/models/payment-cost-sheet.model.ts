export interface CostSheetCellStyle {
  b?: 1;
  i?: 1;
  fs?: number;
  fc?: string;
  bg?: string;
  ha?: string;
  va?: string;
  wrap?: 1;
  bd?: { t?: string; r?: string; b?: string; l?: string };
}

export interface CostSheetCell {
  /** 1-based column */
  c: number;
  /** value: number | string | boolean | ISO date string | error code */
  v?: string | number | boolean | null;
  /** n number, s string, d date, b boolean, e error */
  t?: 'n' | 's' | 'd' | 'b' | 'e';
  /** formula text (never evaluated) */
  f?: string;
  nf?: string;
  s?: CostSheetCellStyle;
}

export interface CostSheetRow {
  /** 1-based row */
  r: number;
  h: number | null;
  hidden?: boolean;
  cells: CostSheetCell[];
}

export interface CostSheetSheet {
  name: string;
  /** px per column; 0 = hidden; null = default */
  colWidths: Array<number | null>;
  merges: string[];
  rows: CostSheetRow[];
}

export interface CostSheetSnapshot {
  sheets: CostSheetSheet[];
}

export interface PaymentCostSheetHistoryEntry {
  action: 'import' | 'reimport' | 'edit' | 'submit' | 'unlock';
  at: string;
  by: string;
  fileName: string;
  note: string;
}

/** One numbered cost row. The number of lines comes from the imported sheet (not fixed). */
export interface PaymentCostLine {
  sn: number;
  description: string;
  costDh: number | null;
  billRefNo: string;
  billRefParty: string;
  paymentReference: string;
  remarks: string;
  borneByRhgt: number | null;
  borneBySilal: number | null;
}

export interface PaymentCostTotals {
  count: number;
  costDh: number;
  borneByRhgt: number;
  borneBySilal: number;
}

export interface PaymentCostHistoryPage {
  items: PaymentCostSheetHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentCostSheet {
  _id: string;
  status: 'draft' | 'locked';
  blNo: string;
  snapshot: CostSheetSnapshot;
  stats: { sheets: number; cells: number };
  source: { fileName: string; size: number };
  importedAt: string;
  importedBy: string;
  lockedAt: string | null;
  lockedBy: string;
  unlockedAt: string | null;
  unlockedBy: string;
  unlockReason: string;
  lines: PaymentCostLine[];
  totals: PaymentCostTotals;
  /** Import notes, e.g. a value that could not be read from the file. Present on import responses. */
  warnings: string[];
  linesUpdatedAt: string | null;
  linesUpdatedBy: string;
  historyTotal: number;
}

export interface PaymentCostSheetPermissions {
  canImport: boolean;
  canSubmit: boolean;
  canUnlock: boolean;
}

export interface PaymentCostSheetResponse {
  message?: string;
  sheet: PaymentCostSheet | null;
  permissions: PaymentCostSheetPermissions;
}
