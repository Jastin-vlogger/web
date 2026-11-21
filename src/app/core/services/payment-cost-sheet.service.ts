import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PaymentCostSheetResponse } from '../models/payment-cost-sheet.model';

// Payment Costing cost sheet (Excel import, import log, submit-lock, Admin unlock).
@Injectable({ providedIn: 'root' })
export class PaymentCostSheetService {
  private apiUrl = 'shipment/payment-cost-sheet/container';

  constructor(private http: HttpClient) {}

  get(containerId: string): Observable<PaymentCostSheetResponse> {
    return this.http.get<PaymentCostSheetResponse>(`${this.apiUrl}/${containerId}`);
  }

  import(containerId: string, file: File): Observable<PaymentCostSheetResponse> {
    const form = new FormData();
    form.append('costSheet', file, file.name);
    return this.http.post<PaymentCostSheetResponse>(`${this.apiUrl}/${containerId}/import`, form);
  }

  submit(containerId: string): Observable<PaymentCostSheetResponse> {
    return this.http.post<PaymentCostSheetResponse>(`${this.apiUrl}/${containerId}/submit`, {});
  }

  unlock(containerId: string, reason: string): Observable<PaymentCostSheetResponse> {
    return this.http.post<PaymentCostSheetResponse>(`${this.apiUrl}/${containerId}/unlock`, { reason });
  }

  downloadExcel(containerId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${containerId}/excel`, { responseType: 'blob' });
  }
}
