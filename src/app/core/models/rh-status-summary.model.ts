export interface RhStatusSummaryRow {
  slNo: number;
  shipmentNo: string;
  supplier: string;
  itemDescription: string;
  fcl: string | number;
  bag: string | number;
  ton: string | number;
  comInNo: string;
  blNo: string;
  grn: string;
  qty: string | number;
  wh: string;
  batch: string;
  pDate: string;
  eDate: string;
  status: 'Arrived' | 'Port' | 'HOLD';
}

export interface RhStatusSummaryResponse {
  rows: RhStatusSummaryRow[];
  generatedAt: string;
}
