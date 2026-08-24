import { Injectable, signal } from '@angular/core';
import { generateId } from '../../core/utils/id.util';

const STORAGE_KEY = 'webrtc-conference.display-name';

/** Small cross-page bridge for lobby -> room hand-off (display name, self id). */
@Injectable({ providedIn: 'root' })
export class SessionPrefsService {
  readonly displayName = signal<string>(this.readStoredName());
  readonly participantId = generateId();

  setDisplayName(name: string): void {
    const trimmed = name.trim();
    this.displayName.set(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // storage may be unavailable (private mode); non-fatal
    }
  }

  private readStoredName(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }
}
