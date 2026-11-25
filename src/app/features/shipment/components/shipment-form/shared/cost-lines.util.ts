import { PaymentCostLine, PaymentCostTotals } from '../../../../../core/models/payment-cost-sheet.model';

// Pure helpers for the editable Payment Costing lines. They work for any number of lines.

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** '1,234.5' -> 1234.5; '' -> null; garbage -> null. */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? round2(raw) : null;
  const text = String(raw).replace(/,/g, '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? round2(n) : null;
}

export function computeTotals(lines: readonly PaymentCostLine[]): PaymentCostTotals {
  const sum = (pick: (l: PaymentCostLine) => number | null) => round2(lines.reduce((acc, l) => acc + (pick(l) ?? 0), 0));
  return {
    count: lines.length,
    costDh: sum((l) => l.costDh),
    borneByRhgt: sum((l) => l.borneByRhgt),
    borneBySilal: sum((l) => l.borneBySilal),
  };
}

/** Cost changed: RHGT keeps its share (default: all of it), Silal gets the rest. */
export function withCost(line: PaymentCostLine, cost: number | null): PaymentCostLine {
  if (cost === null) return { ...line, costDh: null, borneByRhgt: line.borneByRhgt === null ? null : 0, borneBySilal: 0 };
  const hadSplit = line.costDh !== null && line.borneByRhgt !== null && line.borneByRhgt !== line.costDh;
  // Untouched default (RHGT bears everything) follows the new cost; a deliberate split keeps RHGT's amount.
  const rhgt = hadSplit ? Math.min(line.borneByRhgt as number, cost) : cost;
  return { ...line, costDh: cost, borneByRhgt: round2(rhgt), borneBySilal: round2(cost - rhgt) };
}

/** RHGT's share edited: Silal gets the remainder of the cost. */
export function withRhgt(line: PaymentCostLine, rhgt: number | null): PaymentCostLine {
  const r = rhgt ?? 0;
  return { ...line, borneByRhgt: rhgt, borneBySilal: round2((line.costDh ?? 0) - r) };
}

/** Silal's share edited: RHGT gets the remainder of the cost. */
export function withSilal(line: PaymentCostLine, silal: number | null): PaymentCostLine {
  const s = silal ?? 0;
  return { ...line, borneBySilal: silal, borneByRhgt: round2((line.costDh ?? 0) - s) };
}

const FIELDS: ReadonlyArray<keyof PaymentCostLine> = [
  'description', 'costDh', 'billRefNo', 'billRefParty', 'paymentReference', 'remarks', 'borneByRhgt', 'borneBySilal',
];

/** SNs of lines that differ from the saved version. */
export function changedSns(saved: readonly PaymentCostLine[], current: readonly PaymentCostLine[]): number[] {
  const bySn = new Map(saved.map((l) => [l.sn, l]));
  return current.filter((l) => {
    const old = bySn.get(l.sn);
    return !old || FIELDS.some((f) => old[f] !== l[f]);
  }).map((l) => l.sn);
}

/** True when the split does not add up to the cost (the server rejects such a save). */
export function splitMismatch(line: PaymentCostLine): boolean {
  if (line.borneByRhgt === null && line.borneBySilal === null) return false;
  return Math.abs((line.costDh ?? 0) - ((line.borneByRhgt ?? 0) + (line.borneBySilal ?? 0))) > 0.01;
}

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
