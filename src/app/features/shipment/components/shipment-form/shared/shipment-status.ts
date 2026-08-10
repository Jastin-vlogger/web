export type ShipmentStatusSeverity = 'success' | 'warn' | 'info' | 'secondary';

function hasMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function hasAssignedWarehouse(actualRow: any): boolean {
  const storageRows = [
    ...(Array.isArray(actualRow?.storageSplits) ? actualRow.storageSplits : []),
    ...(Array.isArray(actualRow?.storageAllocations) ? actualRow.storageAllocations : []),
  ];
  return storageRows.some((row) => hasMeaningfulValue(row?.warehouse));
}

// How many physical containers/items this row is actually expected to split across — mirrors
// backend's getExpectedContainerSerialCount (shipment-preamble.helpers.js). Needed because a
// container can have storageSplits rows for only SOME of its items (the rest never split yet);
// checking only the rows that exist would false-positive "fully delivered" on a mostly-pending
// shipment.
function getExpectedContainerSerialCount(actualRow: any): number {
  const booked = Array.isArray(actualRow?.transportationBooked) ? actualRow.transportationBooked.length : 0;
  if (booked) return booked;
  const packing = Array.isArray(actualRow?.packagingList?.containerInfo) ? actualRow.packagingList.containerInfo.length : 0;
  if (packing) return packing;
  const extracted = Array.isArray(actualRow?.extractedContainers) ? actualRow.extractedContainers.length : 0;
  return extracted;
}

// "Delivered WH" only once EVERY container in the split is recorded — a single recorded row
// must never flip the whole shipment to Delivered WH while the rest are still Pending.
// "Recorded" = GRN + batch both present, same definition the Status column uses
// (shipment-storage.component.ts) — NOT receivedOnDate/receivedOnTime, which auto-prefill to
// "now" client-side even on untouched rows and would false-positive a still-pending row.
// Also requires storageRows.length to cover the EXPECTED count (not just the rows that happen
// to exist) — same fix already applied backend-side in hasSavedStorageArrivalData, ported here
// so a container with 2 of 10 items split (and those 2 fully filled) doesn't show "Delivered WH".
export function hasWarehouseReceipt(actualRow: any): boolean {
  const storageRows = Array.isArray(actualRow?.storageSplits) ? actualRow.storageSplits : [];
  if (!storageRows.length || !storageRows.every((row: any) =>
    hasMeaningfulValue(row?.grn) && hasMeaningfulValue(row?.batch)
  )) {
    return false;
  }
  const expected = getExpectedContainerSerialCount(actualRow);
  return expected === 0 || storageRows.length >= expected;
}

export function hasTransitActualMilestone(actualRow: any): boolean {
  return [
    actualRow?.BLNo,
    actualRow?.commercialInvoiceNo,
    actualRow?.shipOnBoardDate,
    actualRow?.updatedETD,
    actualRow?.updatedETA,
  ].every(hasMeaningfulValue);
}

export function hasPortOfDischargeMilestone(actualRow: any): boolean {
  return hasMeaningfulValue(actualRow?.portOfDischarge);
}

export function hasExplicitShipmentArrival(actualRow: any): boolean {
  return String(actualRow?.shipmentArrived || '').trim().toLowerCase() === 'yes' || hasMeaningfulValue(actualRow?.shipmentArrivedOn);
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isOnOrBeforeToday(date: Date | null): boolean {
  if (!date) return false;
  const today = startOfLocalDay(new Date());
  return startOfLocalDay(date).getTime() <= today.getTime();
}

function getEtdDate(plannedRow: any, actualRow: any): Date | null {
  return toDateOrNull(actualRow?.updatedETD || plannedRow?.etd);
}

function hasArrivedAtPortOfDischarge(actualRow: any): boolean {
  return hasExplicitShipmentArrival(actualRow);
}

function hasOnTransitStatus(plannedRow: any, actualRow: any): boolean {
  if (hasArrivedAtPortOfDischarge(actualRow)) return false;
  const etd = getEtdDate(plannedRow, actualRow);
  if (!hasTransitActualMilestone(actualRow)) return false;
  return isOnOrBeforeToday(etd);
}

export function getComputedShipmentStatus(params: {
  shipmentCurrentStage?: string | null;
  plannedRow?: any;
  actualRow?: any;
  isPlannedLocked?: boolean;
  fallbackStageLabel?: string | null;
}): string {
  const actualRow = params.actualRow;
  const plannedRow = params.plannedRow;

  if (hasWarehouseReceipt(actualRow)) {
    return 'Delivered WH';
  }

  if (hasArrivedAtPortOfDischarge(actualRow)) {
    return 'At Port of Discharge';
  }

  if (hasOnTransitStatus(plannedRow, actualRow)) {
    return 'On Transit';
  }

  // "ETA yet to Due" only once THIS row's own actual documentation (BL/CI/ship-on-board/
  // ETD/ETA) has actually been saved but the ETD hasn't passed yet. Before that, a row must
  // never borrow the PARENT shipment's planned ETD just because one exists somewhere on the
  // LPO — that produced identical "ETA yet to Due" for a fully-documented row (SCG07/08) and
  // a completely untouched one (SCG09/10), which is wrong on two counts: it hid that no actual
  // data exists yet, and it can fire even when that planned ETD has already passed.
  const plannedEtd = plannedRow?.etd ? new Date(plannedRow.etd) : null;
  if (plannedEtd && !Number.isNaN(plannedEtd.getTime()) && hasTransitActualMilestone(actualRow)) {
    return 'ETA yet to Due';
  }

  // No actual data captured for this row at all — "Shipment Not Scheduled" regardless of the
  // PARENT shipment's overall workflow stage (which can already be well past Shipment Entry
  // once other rows on the same LPO have progressed further).
  if (!hasTransitActualMilestone(actualRow)) {
    return 'Shipment Not Scheduled';
  }

  const fallback = String(params.fallbackStageLabel || params.shipmentCurrentStage || 'Shipment Entry').trim();
  if (fallback === 'Port & Customs') return 'Port and Clearance';
  if (fallback === 'Planned Split') return 'Shipment Split';
  return fallback === 'Shipment Entry' ? 'Shipment Not Scheduled' : fallback;
}

export function getShipmentStatusSeverity(status: string): ShipmentStatusSeverity {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'reached wh' || normalized === 'delivered wh') return 'success';
  if (normalized === 'at port of discharge') return 'warn';
  if (normalized === 'on transit') return 'info';
  if (normalized === 'eta yet to due' || normalized === 'etd yet to due' || normalized === 'shipment not scheduled') return 'secondary';
  if (normalized === 'payment & costing' || normalized === 'quality') return 'success';
  if (normalized === 'shipment tracker' || normalized === 'shipment split') return 'info';
  return 'warn';
}
