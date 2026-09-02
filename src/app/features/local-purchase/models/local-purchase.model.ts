// TS interfaces for the Local Purchase feature — independent of core/models/shipment.model.ts,
// mirrors backend/src/models/local-purchase.model.js field-for-field.

export interface LocalPurchaseStorageSplit {
  containerSerialNo?: string;
  bags?: number;
  warehouse?: string;
  block?: string;
  storageAvailability?: number;
  receivedOnDate?: string | null;
  receivedOnTime?: string;
  customsInspection?: string;
  grn?: string;
  batch?: string;
  productionDate?: string | null;
  expiryDate?: string | null;
  hsCode?: string;
  grossWeight?: string;
  netWeight?: string;
  shortageBags?: number;
  remarks?: string;
  documentUrl?: string;
  documentName?: string;
}

export interface LocalPurchaseQualityRow {
  sn?: number;
  sampleNo?: string;
  phase?: string;
  date?: string | null;
  inhouseReportNo?: string;
  inhouseReportDate?: string | null;
  inhouseReportDocumentUrl?: string;
  inhouseReportDocumentName?: string;
  strategicReportNo?: string;
  strategicReportDate?: string | null;
  strategicReportDocumentUrl?: string;
  strategicReportDocumentName?: string;
  thirdPartyReportNo?: string;
  thirdPartyReportDate?: string | null;
  thirdPartyReportDocumentUrl?: string;
  thirdPartyReportDocumentName?: string;
  remarks?: string;
  attachmentDocumentUrl?: string;
  attachmentDocumentName?: string;
}

export interface LocalPurchasePayment {
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid';
}

// Mirrors backend/src/models/local-purchase.model.js's storageAllocationDecision — single
// destination warehouse only (LP is always one item/one quantity, no per-item×warehouse matrix
// like the real Shipment flow's storageAllocationDecision).
export interface LocalPurchaseStorageAllocationDecision {
  warehouse: string;
}

export type LocalPurchaseApprovalUser = { _id: string; name: string; email: string } | string | null;

// Mirrors container.model.js's storageAllocationApprovalStateSchema field-for-field.
export interface LocalPurchaseStorageAllocationApproval {
  status: 'draft' | 'pending_warehouse_manager' | 'approved';
  submittedAt?: string | null;
  submittedBy?: LocalPurchaseApprovalUser;
  lastUpdatedAt?: string | null;
  lastUpdatedBy?: LocalPurchaseApprovalUser;
  warehouseManagerApprovedAt?: string | null;
  warehouseManagerApprovedBy?: LocalPurchaseApprovalUser;
}

export type LocalPurchaseStage = 'Local Purchase Entry' | 'Storage Allocation' | 'Storage & Arrival' | 'Quality' | 'Completed';

export interface LocalPurchase {
  _id: string;
  lpNumber: string;
  year: number;
  supplierId?: { _id: string; name: string } | string | null;
  supplierName: string;
  supplierEmail: string;
  itemId?: { _id: string; description: string } | string | null;
  itemCode?: string;
  itemDescription?: string;
  commodity?: string;
  countryOfOrigin?: string;
  brandName?: string;
  barcode?: string;
  variant?: string;
  hsCode?: string;
  packing?: string;
  orderDate: string;
  plannedQtyMT: number;
  buyunit?: string;
  fcPerUnit?: number;
  totalFC?: number;
  amountAED?: number;
  paymentTerms?: string;
  incoterms?: string;
  advanceAmount?: number;
  advanceAmountDate?: string | null;
  bankName?: string;
  lpoDocumentName?: string;
  lpoDocumentUrl?: string;
  s1QualityReportName?: string;
  s1QualityReportUrl?: string;
  proformaDocumentName?: string;
  proformaDocumentUrl?: string;
  payment: LocalPurchasePayment;
  currentStage: LocalPurchaseStage;
  storageAllocationDecision?: LocalPurchaseStorageAllocationDecision;
  storageAllocationApproval?: LocalPurchaseStorageAllocationApproval;
  storageSplits: LocalPurchaseStorageSplit[];
  qualityRows: LocalPurchaseQualityRow[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalPurchaseListResponse {
  items: LocalPurchase[];
  page: number;
  totalRecords: number;
  totalPages: number;
}

export interface CreateLocalPurchasePayload {
  orderDate: string;
  supplierId?: string;
  supplierName: string;
  supplierEmail: string;
  itemId?: string;
  itemCode?: string;
  itemDescription?: string;
  commodity?: string;
  countryOfOrigin?: string;
  brandName?: string;
  barcode?: string;
  variant?: string;
  hsCode?: string;
  packing?: string;
  plannedQtyMT: string;
  buyunit: string;
  fcPerUnit?: string;
  totalFC?: string;
  amountAED?: string;
  paymentTerms: string;
  incoterms?: string;
  advanceAmount?: string;
  advanceAmountDate?: string;
  bankName?: string;
}

export interface ExtractedLocalPurchaseData {
  supplierName?: string;
  supplierEmail?: string;
  itemDescription?: string;
  commodity?: string;
  countryOfOrigin?: string;
  brandName?: string;
  hsCode?: string;
  plannedQtyMT?: string | number;
  fcPerUnit?: string | number;
  totalFC?: string | number;
}
