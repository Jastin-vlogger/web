// Turns a cost-sheet snapshot into a render-ready grid (rows of cells with rowspan/colspan, text and
// CSS), so the screen and the PDF show the sheet with the same structure as the original Excel file.

import { CostSheetCell, CostSheetSheet } from '../../../../../core/models/payment-cost-sheet.model';

export interface GridCell {
  c: number;
  rowspan: number;
  colspan: number;
  text: string;
  numeric: boolean;
  bold: boolean;
  italic: boolean;
  fontPx: number | null;
  color: string | null;
  background: string | null;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  borders: { t?: string; r?: string; b?: string; l?: string };
  formula: string | null;
}

export interface GridRow {
  r: number;
  heightPx: number | null;
  cells: GridCell[];
}

export interface SheetGrid {
  name: string;
  colCount: number;
  colWidths: number[];
  rows: GridRow[];
}

const DEFAULT_COL_PX = 64;

export function columnLettersToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRange(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = /^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/.exec(range);
  if (!m) return null;
  return { c1: columnLettersToNumber(m[1]), r1: Number(m[2]), c2: columnLettersToNumber(m[3]), r2: Number(m[4]) };
}

function decimalsOf(nf: string): number | null {
  const m = /\.(0+)/.exec(nf);
  return m ? m[1].length : null;
}

/** Display text for one cell, honouring the Excel number format for the common cases. */
export function formatCellText(cell: CostSheetCell | undefined): string {
  if (!cell || cell.v == null || cell.v === '') return '';
  const nf = cell.nf || '';
  if (cell.t === 'e') return String(cell.v);
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  if (cell.t === 'd') {
    const d = new Date(String(cell.v));
    if (Number.isNaN(d.getTime())) return String(cell.v);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return /h/i.test(nf) && /m/i.test(nf) && /hh/i.test(nf) ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
  }
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const value = cell.v;
    if (nf.includes('"-"') && value === 0) return '-';
    if (nf.includes('%')) {
      const dp = decimalsOf(nf) ?? 0;
      return `${(value * 100).toFixed(dp)}%`;
    }
    const dp = decimalsOf(nf);
    const grouped = nf.includes(',');
    if (dp !== null || /[0#]/.test(nf)) {
      const digits = dp ?? 0;
      return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouped });
    }
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  }
  return String(cell.v);
}

const BORDER_CSS: Record<string, string> = {
  thin: '1px solid #444',
  hair: '1px solid #888',
  medium: '2px solid #222',
  thick: '3px solid #111',
  dashed: '1px dashed #444',
  dotted: '1px dotted #444',
  double: '3px double #222',
};

export function borderCss(style: string | undefined): string | null {
  return style ? (BORDER_CSS[style] ?? '1px solid #444') : null;
}

export function buildSheetGrid(sheet: CostSheetSheet): SheetGrid {
  const rowsByNumber = new Map(sheet.rows.map((row) => [row.r, row]));
  let colCount = sheet.colWidths.length;
  let rowCount = 0;
  sheet.rows.forEach((row) => {
    rowCount = Math.max(rowCount, row.r);
    row.cells.forEach((cell) => { colCount = Math.max(colCount, cell.c); });
  });

  // merge map: top-left -> span, covered cells -> skip
  const spans = new Map<string, { rowspan: number; colspan: number }>();
  const covered = new Set<string>();
  sheet.merges.forEach((range) => {
    const m = parseRange(range);
    if (!m) return;
    rowCount = Math.max(rowCount, m.r2);
    colCount = Math.max(colCount, m.c2);
    spans.set(`${m.r1}:${m.c1}`, { rowspan: m.r2 - m.r1 + 1, colspan: m.c2 - m.c1 + 1 });
    for (let r = m.r1; r <= m.r2; r += 1) {
      for (let c = m.c1; c <= m.c2; c += 1) {
        if (r !== m.r1 || c !== m.c1) covered.add(`${r}:${c}`);
      }
    }
  });

  const colWidths = Array.from({ length: colCount }, (_, i) => {
    const w = sheet.colWidths[i];
    return w === 0 ? 0 : (w || DEFAULT_COL_PX);
  });

  const rows: GridRow[] = [];
  for (let r = 1; r <= rowCount; r += 1) {
    const source = rowsByNumber.get(r);
    if (source?.hidden) continue;
    const cellsByCol = new Map((source?.cells ?? []).map((cell) => [cell.c, cell]));
    const cells: GridCell[] = [];
    for (let c = 1; c <= colCount; c += 1) {
      if (colWidths[c - 1] === 0) continue; // hidden column
      if (covered.has(`${r}:${c}`)) continue;
      const cell = cellsByCol.get(c);
      const span = spans.get(`${r}:${c}`) ?? { rowspan: 1, colspan: 1 };
      const s = cell?.s ?? {};
      const numeric = cell?.t === 'n' || cell?.t === 'd';
      const align = (s.ha === 'center' || s.ha === 'right' || s.ha === 'left') ? s.ha : (numeric ? 'right' : 'left');
      cells.push({
        c,
        rowspan: span.rowspan,
        colspan: span.colspan,
        text: formatCellText(cell),
        numeric,
        bold: !!s.b,
        italic: !!s.i,
        fontPx: s.fs ? Math.round(s.fs * 1.333) : null,
        color: s.fc ? `#${s.fc}` : null,
        background: s.bg ? `#${s.bg}` : null,
        align,
        valign: s.va === 'top' ? 'top' : s.va === 'bottom' ? 'bottom' : 'middle',
        wrap: !!s.wrap,
        borders: s.bd ?? {},
        formula: cell?.f ?? null,
      });
    }
    // Excel lets non-wrapping left-aligned text overflow into empty neighbouring cells (titles, names).
    // Reproduce that by widening the text cell over the empty, unstyled cells to its right.
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const source = cellsByCol.get(cell.c);
      if (!cell.text || cell.wrap || cell.align !== 'left' || source?.t !== 's' || cell.rowspan > 1) continue;
      for (;;) {
        const next = cells[i + 1];
        const hasBorders = !!next && Object.keys(next.borders).length > 0;
        if (!next || next.c !== cell.c + cell.colspan || next.text || next.background || hasBorders || next.rowspan > 1 || next.colspan > 1) break;
        cell.colspan += 1;
        cells.splice(i + 1, 1);
      }
    }
    rows.push({ r, heightPx: source?.h ? Math.round(source.h * 1.333) : null, cells });
  }

  // Trailing rows that only carry a height (no text, fill or border) would just add blank space/pages.
  const isVisibleCell = (cell: GridCell) => !!cell.text || !!cell.background || Object.keys(cell.borders).length > 0;
  while (rows.length && !rows[rows.length - 1].cells.some(isVisibleCell)) rows.pop();

  return { name: sheet.name, colCount, colWidths, rows };
}
