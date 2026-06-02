import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { RbacService } from '../services/rbac.service';
import { EffectivePermissionsResponse } from '../models/access-control.model';

const SETTINGS_TABS = [
  { route: '/settings/warehouses', permissionKey: 'settings.tab.warehouses.view' },
  { route: '/settings/item-codes', permissionKey: 'settings.tab.item_codes.view' },
  { route: '/settings/transportation', permissionKey: 'settings.tab.transportation.view' },
  { route: '/settings/exchange-rates', permissionKey: 'settings.tab.exchange_rates.view' },
];

function resolveSettingsAccess(
  permissionKey: string,
  permissions: EffectivePermissionsResponse | null,
  rbacService: RbacService,
  authService: AuthService,
  router: Router
): boolean | UrlTree {
  if (authService.isAdminLevelRole() || rbacService.hasPermission(permissionKey)) {
    return true;
  }

  const allowedTab = SETTINGS_TABS.find((tab) => permissions?.permissionKeys?.includes(tab.permissionKey));
  return router.parseUrl(allowedTab?.route || '/forbidden');
}

export const settingsPermissionGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const rbacService = inject(RbacService);
  const permissionKey = route.data?.['permissionKey'] as string | undefined;

  if (!permissionKey) return true;

  return rbacService.permissions$.pipe(
    take(1),
    switchMap((permissions) => {
      if (permissions) return of(permissions);
      return rbacService.loadEffectivePermissions();
    }),
    map((permissions) =>
      resolveSettingsAccess(permissionKey, permissions, rbacService, authService, router)
    )
  );
};
