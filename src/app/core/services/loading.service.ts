import { Injectable, computed, signal } from '@angular/core';

/**
 * Point 24: tracks in-flight HTTP requests so a single global loader can be shown while
 * any (non-background) API call is pending. The loading interceptor increments on request
 * start and decrements on completion.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly activeRequests = signal(0);

  /** True while at least one tracked request is in flight. */
  readonly isLoading = computed(() => this.activeRequests() > 0);

  start(): void {
    this.activeRequests.update((count) => count + 1);
  }

  stop(): void {
    this.activeRequests.update((count) => Math.max(0, count - 1));
  }
}
