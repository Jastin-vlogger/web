import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppNotification, NotificationListResponse, NotificationUnreadCountResponse } from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationInboxService {
  private http = inject(HttpClient);

  // Point 24: background fetches opt out of the global loader to avoid flicker.
  private readonly skipLoaderOptions = { headers: { 'X-Skip-Loader': '1' } };

  list(): Observable<NotificationListResponse> {
    return this.http.get<NotificationListResponse>('notifications', this.skipLoaderOptions);
  }

  unreadCount(): Observable<NotificationUnreadCountResponse> {
    return this.http.get<NotificationUnreadCountResponse>('notifications/unread-count', this.skipLoaderOptions);
  }

  markAsRead(id: string): Observable<{ message: string; notification: AppNotification; unreadCount: number }> {
    return this.http.patch<{ message: string; notification: AppNotification; unreadCount: number }>(`notifications/${id}/read`, {});
  }
}
