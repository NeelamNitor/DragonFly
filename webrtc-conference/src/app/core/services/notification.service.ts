import { Injectable, signal } from '@angular/core';
import { generateId } from '../utils/id.util';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  text: string;
}

/** App-wide, non-blocking user notifications (device errors, connection issues, ...). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<ToastMessage[]>([]);

  show(text: string, type: ToastType = 'info', durationMs = 5000): void {
    const toast: ToastMessage = { id: generateId(), type, text };
    this.toasts.update((list) => [...list, toast]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(toast.id), durationMs);
    }
  }

  error(text: string): void {
    this.show(text, 'error', 8000);
  }

  dismiss(id: string): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
