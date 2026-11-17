import { describe, expect, it } from 'vitest';
import { planRemainderRow } from './planned-remainder.util';

describe('planRemainderRow', () => {
  it('RHST-0014: all 100 FCL allocated but a little MT left => no extra row', () => {
    // 9 saved shipments (90 FCL, 2,246.04 MT) + 10th shipment 10 FCL; total 100 FCL / 2,520 MT
    const plan = planRemainderRow({
      totalFcl: 100, totalQtyMT: 2520, allocatedFcl: 100, allocatedQtyMT: 2498.04, hasRemainderRow: false,
    });
    expect(plan).toEqual({ action: 'none' });
  });

  it('removes an existing remainder row once every FCL is allocated', () => {
    const plan = planRemainderRow({
      totalFcl: 100, totalQtyMT: 2520, allocatedFcl: 100, allocatedQtyMT: 2498.04, hasRemainderRow: true,
    });
    expect(plan).toEqual({ action: 'remove' });
  });

  it('adds a remainder row while FCL is still unallocated', () => {
    const plan = planRemainderRow({
      totalFcl: 101, totalQtyMT: 2520, allocatedFcl: 90, allocatedQtyMT: 2246.04, hasRemainderRow: false,
    });
    expect(plan).toEqual({ action: 'upsert', qtyMT: 274, fcl: 11 });
  });

  it('keeps FCL remainder even if MT is already used up (qty never negative)', () => {
    const plan = planRemainderRow({
      totalFcl: 100, totalQtyMT: 2000, allocatedFcl: 90, allocatedQtyMT: 2100, hasRemainderRow: true,
    });
    expect(plan).toEqual({ action: 'upsert', qtyMT: 0, fcl: 10 });
  });

  it('no Total FCL: falls back to the MT rule', () => {
    expect(planRemainderRow({ totalFcl: 0, totalQtyMT: 100, allocatedFcl: 0, allocatedQtyMT: 60, hasRemainderRow: false }))
      .toEqual({ action: 'upsert', qtyMT: 40, fcl: 0 });
    expect(planRemainderRow({ totalFcl: 0, totalQtyMT: 100, allocatedFcl: 0, allocatedQtyMT: 100, hasRemainderRow: true }))
      .toEqual({ action: 'remove' });
  });
});
