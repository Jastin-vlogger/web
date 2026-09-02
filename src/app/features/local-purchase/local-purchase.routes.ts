import { Routes } from '@angular/router';
import { userDataResolver } from '../../core/resolvers/user-data.resolver';
import { LocalPurchaseListComponent } from './local-purchase.component';
import { CreateLocalPurchaseComponent } from './components/create-local-purchase/create-local-purchase.component';
import { LocalPurchaseTrackerComponent } from './components/local-purchase-tracker/local-purchase-tracker.component';

export const LOCAL_PURCHASE_ROUTES: Routes = [
  { path: '', component: LocalPurchaseListComponent, resolve: { user: userDataResolver } },
  { path: 'create', component: CreateLocalPurchaseComponent, resolve: { user: userDataResolver } },
  { path: 'track/:id', component: LocalPurchaseTrackerComponent, resolve: { user: userDataResolver } },
];
