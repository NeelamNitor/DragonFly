import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/conference/conference.routes').then((m) => m.CONFERENCE_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
