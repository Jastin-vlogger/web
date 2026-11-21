import { describe, expect, it } from 'vitest';
import { CostSheetSheet } from '../../../../../core/models/payment-cost-sheet.model';
import { buildSheetGrid, columnLettersToNumber, formatCellText } from './cost-sheet-grid.util';

const sheet: CostSheetSheet = {
  name: 'COST-40',
  colWidths: [40, 200, 90, null],
  merges: ['A1:C1', 'D2:D3'],
  rows: [
    { r: 1, h: 24, cells: [{ c: 1, v: 'ROYAL HORIZON', t: 's', s: { b: 1, bg: 'DDEEFF', ha: 'center' } }] },
    { r: 2, h: null, cells: [
      { c: 1, v: 1, t: 'n' },
      { c: 2, v: 'Invoice Attestation', t: 's' },
      { c: 3, v: 1302.5, t: 'n', nf: '#,##0.00' },
      { c: 4, v: 'merged down', t: 's' },
    ] },
    { r: 4, h: null, cells: [{ c: 3, v: 877.15, t: 'n', f: 'SUM(C2:C3)', nf: '_(* #,##0.00_);_(* "-"??_)' }] },
  ],
};

describe('cost sheet grid', () => {
  it('converts column letters', () => {
    expect(columnLettersToNumber('A')).toBe(1);
    expect(columnLettersToNumber('M')).toBe(13);
    expect(columnLettersToNumber('AA')).toBe(27);
  });

  it('keeps merges as colspan/rowspan and drops covered cells', () => {
    const grid = buildSheetGrid(sheet);
    const row1 = grid.rows.find((r) => r.r === 1)!;
    expect(row1.cells).toHaveLength(2); // A1 (colspan 3) + D1
    expect(row1.cells[0]).toMatchObject({ colspan: 3, rowspan: 1, text: 'ROYAL HORIZON', bold: true, background: '#DDEEFF', align: 'center' });
    const row2 = grid.rows.find((r) => r.r === 2)!;
    expect(row2.cells.at(-1)).toMatchObject({ c: 4, rowspan: 2 });
    const row3 = grid.rows.find((r) => r.r === 3)!;
    expect(row3.cells.some((c) => c.c === 4)).toBe(false); // covered by D2:D3
  });

  it('keeps blank rows so the vertical structure is preserved, and row heights', () => {
    const grid = buildSheetGrid(sheet);
    expect(grid.rows.map((r) => r.r)).toEqual([1, 2, 3, 4]);
    expect(grid.rows[0].heightPx).toBe(32);
  });

  it('formats numbers by their Excel format and keeps formulas', () => {
    const grid = buildSheetGrid(sheet);
    const row2 = grid.rows.find((r) => r.r === 2)!;
    expect(row2.cells.find((c) => c.c === 3)!.text).toBe('1,302.50');
    expect(row2.cells.find((c) => c.c === 3)!.align).toBe('right');
    const total = grid.rows.find((r) => r.r === 4)!.cells.find((c) => c.c === 3)!;
    expect(total.text).toBe('877.15');
    expect(total.formula).toBe('SUM(C2:C3)');
  });

  it('formats zero in accounting formats as a dash, percentages, dates and errors', () => {
    expect(formatCellText({ c: 1, v: 0, t: 'n', nf: '_(* #,##0.00_);_(* "-"??_)' })).toBe('-');
    expect(formatCellText({ c: 1, v: 0.5410429, t: 'n', nf: '0.0%' })).toBe('54.1%');
    expect(formatCellText({ c: 1, v: '2026-07-22T00:00:00.000Z', t: 'd', nf: 'mm-dd-yy' })).toBe('22/07/2026');
    expect(formatCellText({ c: 1, v: '#DIV/0!', t: 'e' })).toBe('#DIV/0!');
    expect(formatCellText({ c: 1, v: 13, t: 'n' })).toBe('13');
    expect(formatCellText(undefined)).toBe('');
  });

  it('lets unmerged left-aligned text overflow over empty neighbours (titles, signature names)', () => {
    const grid = buildSheetGrid({
      name: 'T',
      colWidths: [40, 40, 40, 40],
      merges: [],
      rows: [
        { r: 1, h: null, cells: [{ c: 1, v: 'ROYAL HORIZON GENERAL TRADING', t: 's' }] },
        { r: 2, h: null, cells: [{ c: 1, v: 'Marian Pena', t: 's' }, { c: 3, v: 'Rayees', t: 's' }] },
        { r: 3, h: null, cells: [{ c: 1, v: 'Boxed', t: 's' }, { c: 2, t: 's', s: { bd: { l: 'thin' } } }] },
        { r: 4, h: null, cells: [{ c: 1, v: 42, t: 'n' }] },
      ],
    });
    const cell = (r: number, c: number) => grid.rows.find((x) => x.r === r)!.cells.find((x) => x.c === c)!;
    expect(cell(1, 1).colspan).toBe(4);
    expect(cell(2, 1).colspan).toBe(2); // stops before "Rayees"
    expect(cell(2, 3).colspan).toBe(2);
    expect(cell(3, 1).colspan).toBe(1); // neighbour has a border: not absorbed
    expect(cell(4, 1).colspan).toBe(1); // numbers never overflow
  });

  it('drops trailing rows that are completely blank', () => {
    const grid = buildSheetGrid({
      name: 'T',
      colWidths: [40, 40],
      merges: [],
      rows: [
        { r: 1, h: null, cells: [{ c: 1, v: 'x', t: 's' }] },
        { r: 5, h: 20, cells: [] },
        { r: 6, h: 20, cells: [] },
      ],
    });
    expect(grid.rows.map((r) => r.r)).toEqual([1]);
  });
});
