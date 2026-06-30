import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../services/loading.service';

/**
 * Point 24: drives the global loader from HTTP activity. Add the `X-Skip-Loader` header to a
 * request to opt out (e.g. background polling like notifications) so the screen doesn't flicker.
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const skip = req.headers.has('X-Skip-Loader');
  if (skip) {
    const cleaned = req.clone({ headers: req.headers.delete('X-Skip-Loader') });
    return next(cleaned);
  }

  const loadingService = inject(LoadingService);
  loadingService.start();
  return next(req).pipe(finalize(() => loadingService.stop()));
};
