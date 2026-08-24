import { Routes } from '@angular/router';

export const CONFERENCE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/lobby/lobby.component').then((m) => m.LobbyComponent),
    title: 'Join a meeting',
  },
  {
    path: 'room/:roomId',
    loadComponent: () => import('./pages/room/room.component').then((m) => m.RoomComponent),
    title: 'Meeting',
  },
];
