import { describe, expect, it } from 'vitest';
import { PaymentCostLine } from '../../../../../core/models/payment-cost-sheet.model';
import { changedSns, computeTotals, formatAmount, parseAmount, splitMismatch, withCost, withRhgt, withSilal } from './cost-lines.util';

const line = (sn: number, over: Partial<PaymentCostLine> = {}): PaymentCostLine => ({
  sn, description: `Charge ${sn}`, costDh: 100, billRefNo: '', billRefParty: '', paymentReference: '', remarks: '',
  borneByRhgt: 100, borneBySilal: 0, ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => line(i + 1));

describe('cost-lines util', () => {
  it('parses amounts with thousand separators and rejects garbage', () => {
    expect(parseAmount('1,234.567')).toBe(1234.57);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(5)).toBe(5);
  });

  it('totals any number of lines (36, 37, 0)', () => {
    expect(computeTotals(many(36))).toEqual({ count: 36, costDh: 3600, borneByRhgt: 3600, borneBySilal: 0 });
    expect(computeTotals(many(37)).count).toBe(37);
    expect(computeTotals(many(37)).costDh).toBe(3700);
    expect(computeTotals([])).toEqual({ count: 0, costDh: 0, borneByRhgt: 0, borneBySilal: 0 });
  });

  it('treats blank amounts as zero in totals', () => {
    const lines = [line(1, { costDh: null, borneByRhgt: null, borneBySilal: null }), line(2)];
    expect(computeTotals(lines).costDh).toBe(100);
  });

  it('cost change: default RHGT bears everything and follows the cost', () => {
    const out = withCost(line(1), 250);
    expect(out.borneByRhgt).toBe(250);
    expect(out.borneBySilal).toBe(0);
  });

  it('cost change keeps a deliberate split (RHGT amount) and caps it at the new cost', () => {
    const split = line(1, { costDh: 100, borneByRhgt: 30, borneBySilal: 70 });
    expect(withCost(split, 200)).toMatchObject({ costDh: 200, borneByRhgt: 30, borneBySilal: 170 });
    expect(withCost(split, 20)).toMatchObject({ costDh: 20, borneByRhgt: 20, borneBySilal: 0 });
  });

  it('editing one share fills the other so they always add up', () => {
    const a = withRhgt(line(1), 40);
    expect(a.borneBySilal).toBe(60);
    expect(splitMismatch(a)).toBe(false);
    const b = withSilal(line(1), 25.5);
    expect(b.borneByRhgt).toBe(74.5);
    expect(splitMismatch(b)).toBe(false);
    expect(splitMismatch(line(1, { borneByRhgt: 1, borneBySilal: 1 }))).toBe(true);
  });

  it('finds changed lines by SN', () => {
    const saved = many(37);
    const current = saved.map((l) => ({ ...l }));
    expect(changedSns(saved, current)).toEqual([]);
    current[36].remarks = 'x';
    current[2].description = 'renamed';
    expect(changedSns(saved, current)).toEqual([3, 37]);
  });

  it('formats amounts', () => {
    expect(formatAmount(1234.5)).toBe('1,234.50');
    expect(formatAmount(null)).toBe('');
  });
});
