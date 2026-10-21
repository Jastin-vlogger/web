export interface ShipmentCostRow {
  slNo: number;
  shipmentNo: string;
  supplier: string;
  blNo: string;
  description: string;
  actualPaid: number;
}

export interface ShipmentCostResponse {
  rows: ShipmentCostRow[];
  totalActualPaid: number;
  generatedAt: string;
}
