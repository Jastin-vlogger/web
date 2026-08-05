import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RhStatusSummaryResponse } from '../../../core/models/rh-status-summary.model';

@Injectable({
  providedIn: 'root'
})
export class RhStatusSummaryService {
  private apiUrl = 'shipment/reports/rh-status-summary';

  constructor(private http: HttpClient) { }

  getData(): Observable<RhStatusSummaryResponse> {
    return this.http.get<RhStatusSummaryResponse>(`${this.apiUrl}/data`);
  }

  downloadExcel(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/excel`, { responseType: 'blob' });
  }
}
