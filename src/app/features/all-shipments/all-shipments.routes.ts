import { Routes } from '@angular/router';
import { AllShipmentsComponent } from './all-shipments.component';
import { userDataResolver } from '../../core/resolvers/user-data.resolver';

export const ALL_SHIPMENTS_ROUTES: Routes = [
  {
    path: '',
    component: AllShipmentsComponent,
    resolve: { user: userDataResolver },
  },
];
