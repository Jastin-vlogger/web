import { Routes } from '@angular/router';
import { settingsPermissionGuard } from '../../core/guards/settings-permission.guard';

export const SETTINGS_ROUTES: Routes = [
  { path: '', redirectTo: 'warehouses', pathMatch: 'full' },
  {
    path: 'warehouses',
    canActivate: [settingsPermissionGuard],
    data: { permissionKey: 'settings.tab.warehouses.view' },
    loadComponent: () => import('./warehouse-management/warehouse-management.component').then(m => m.WarehouseManagementComponent)
  },
  {
    path: 'item-codes',
    canActivate: [settingsPermissionGuard],
    data: { permissionKey: 'settings.tab.item_codes.view' },
    loadComponent: () => import('./item-code-management/item-code-management.component').then(m => m.ItemCodeManagementComponent)
  },
  {
    path: 'transportation',
    canActivate: [settingsPermissionGuard],
    data: { permissionKey: 'settings.tab.transportation.view' },
    loadComponent: () => import('./transportation-management/transportation-management.component').then(m => m.TransportationManagementComponent)
  },
  {
    path: 'exchange-rates',
    canActivate: [settingsPermissionGuard],
    data: { permissionKey: 'settings.tab.exchange_rates.view' },
    loadComponent: () => import('./exchange-rate-management/exchange-rate-management.component').then(m => m.ExchangeRateManagementComponent)
  }
];
