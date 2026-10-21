import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ShipmentCostResponse } from '../../../core/models/shipment-cost.model';

@Injectable({
  providedIn: 'root'
})
export class ShipmentCostService {
  private apiUrl = 'shipment/reports/shipment-cost';

  constructor(private http: HttpClient) { }

  getData(): Observable<ShipmentCostResponse> {
    return this.http.get<ShipmentCostResponse>(`${this.apiUrl}/data`);
  }

  downloadExcel(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/excel`, { responseType: 'blob' });
  }
}
