// Decides whether the Scheduled Shipments table needs an auto-added "remainder" row.
//
// When the shipment has a Total FCL, the remainder is driven by FCL: a row is only needed while
// containers are still unallocated. (It used to be driven by MT, so a few MT left over after
// every FCL was already allocated spawned a stray extra shipment row.) Only shipments with no
// Total FCL keep the old MT-based rule.

export interface RemainderPlanInput {
  totalFcl: number;
  totalQtyMT: number;
  /** FCL / MT of every non-remainder row (saved and unsaved). */
  allocatedFcl: number;
  allocatedQtyMT: number;
  hasRemainderRow: boolean;
}

export type RemainderPlan =
  | { action: 'none' }
  | { action: 'remove' }
  | { action: 'upsert'; qtyMT: number; fcl: number };

export function planRemainderRow(input: RemainderPlanInput): RemainderPlan {
  const remainderMT = Math.round((Number(input.totalQtyMT) || 0) - (Number(input.allocatedQtyMT) || 0));
  const totalFcl = Number(input.totalFcl) || 0;

  if (totalFcl > 0) {
    const remainderFcl = totalFcl - (Number(input.allocatedFcl) || 0);
    if (remainderFcl > 0) {
      return { action: 'upsert', qtyMT: Math.max(remainderMT, 0), fcl: remainderFcl };
    }
    return input.hasRemainderRow ? { action: 'remove' } : { action: 'none' };
  }

  if (remainderMT > 0) return { action: 'upsert', qtyMT: remainderMT, fcl: 0 };
  return input.hasRemainderRow ? { action: 'remove' } : { action: 'none' };
}
