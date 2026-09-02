import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  LocalPurchase,
  LocalPurchaseListResponse,
} from '../models/local-purchase.model';

// Independent of ShipmentService — its own base path, its own endpoints, mirrors the method
// shapes of shipment.service.ts's create/extract/list/detail methods where useful, nothing
// shared/imported from there (per the plan's independence requirement).
@Injectable({ providedIn: 'root' })
export class LocalPurchaseService {
  private apiUrl = 'local-purchase';

  constructor(private http: HttpClient) {}

  getList(page: number = 1, limit: number = 20, search: string = ''): Observable<LocalPurchaseListResponse> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (search) params = params.set('search', search);
    return this.http.get<LocalPurchaseListResponse>(`${this.apiUrl}`, { params });
  }

  getById(id: string): Observable<{ data: LocalPurchase }> {
    return this.http.get<{ data: LocalPurchase }>(`${this.apiUrl}/${id}`);
  }

  extractLpo(formData: FormData): Observable<{ message: string; data: any }> {
    return this.http.post<{ message: string; data: any }>(`${this.apiUrl}/extract-lpo`, formData);
  }

  create(formData: FormData): Observable<{ message: string; data: LocalPurchase }> {
    return this.http.post<{ message: string; data: LocalPurchase }>(`${this.apiUrl}/create`, formData);
  }

  updateAllocation(id: string, warehouse: string): Observable<{ message: string; data: LocalPurchase }> {
    return this.http.patch<{ message: string; data: LocalPurchase }>(`${this.apiUrl}/${id}/storage-allocation`, { warehouse });
  }

  approveAllocation(id: string): Observable<{ message: string; data: LocalPurchase }> {
    return this.http.patch<{ message: string; data: LocalPurchase }>(`${this.apiUrl}/${id}/storage-allocation/approve`, {});
  }

  updateStorage(id: string, formData: FormData): Observable<{ message: string; data: LocalPurchase }> {
    return this.http.patch<{ message: string; data: LocalPurchase }>(`${this.apiUrl}/${id}/storage`, formData);
  }

  updateQuality(id: string, formData: FormData): Observable<{ message: string; data: LocalPurchase }> {
    return this.http.patch<{ message: string; data: LocalPurchase }>(`${this.apiUrl}/${id}/quality`, formData);
  }
}
