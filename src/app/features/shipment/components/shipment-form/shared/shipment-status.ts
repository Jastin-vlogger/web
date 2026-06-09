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

export function hasWarehouseReceipt(actualRow: any): boolean {
  const storageRows = Array.isArray(actualRow?.storageSplits) ? actualRow.storageSplits : [];
  return storageRows.some((row: any) =>
    hasMeaningfulValue(row?.receivedOnDate) ||
    hasMeaningfulValue(row?.receivedOnTime) ||
    hasMeaningfulValue(row?.grn) ||
    hasMeaningfulValue(row?.batch) ||
    hasMeaningfulValue(row?.documentUrl)
  );
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

  const plannedEtd = plannedRow?.etd ? new Date(plannedRow.etd) : null;
  if (plannedEtd && !Number.isNaN(plannedEtd.getTime())) {
    return 'ETA yet to due';
  }

  const fallback = String(params.fallbackStageLabel || params.shipmentCurrentStage || 'Shipment Entry').trim();
  return fallback === 'Shipment Entry' ? 'ETD yet to be confirmed' : fallback;
}

export function getShipmentStatusSeverity(status: string): ShipmentStatusSeverity {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'reached wh' || normalized === 'delivered wh') return 'success';
  if (normalized === 'at port of discharge') return 'warn';
  if (normalized === 'on transit') return 'info';
  if (normalized === 'eta yet to due' || normalized === 'etd yet to due' || normalized === 'etd yet to be confirmed') return 'secondary';
  if (normalized === 'payment & costing' || normalized === 'quality') return 'success';
  if (normalized === 'shipment tracker' || normalized === 'shipment split') return 'info';
  return 'warn';
}
