import { Injectable, computed, signal } from '@angular/core';
import { ConnectionQuality, PeerConnectionLifecycleState } from '../../../core/models/connection-state.model';
import { MediaState } from '../../../core/models/media-state.model';
import { createParticipant, Participant } from '../../../core/models/participant.model';

/**
 * Room-scoped reactive state. Provided per-`RoomComponent` instance (see its
 * `providers` array) so state is guaranteed fresh on every room visit and
 * torn down automatically when the component is destroyed — no manual reset.
 */
@Injectable()
export class ConferenceStore {
  private readonly participantsMap = signal<Map<string, Participant>>(new Map());

  readonly roomId = signal<string | null>(null);
  readonly selfId = signal<string | null>(null);
  readonly activeSpeakerId = signal<string | null>(null);
  readonly isStatsPanelOpen = signal(false);

  readonly participants = computed(() => Array.from(this.participantsMap().values()));

  readonly remoteParticipants = computed(() => this.participants().filter((p) => !p.isLocal));

  readonly localParticipant = computed(() => this.participants().find((p) => p.isLocal) ?? null);

  readonly participantCount = computed(() => this.participants().length);

  ensureParticipant(id: string, displayName: string, isLocal: boolean): Participant {
    const existing = this.participantsMap().get(id);
    if (existing) return existing;
    const participant = createParticipant(id, displayName, isLocal);
    this.updateMap((map) => map.set(id, participant));
    return participant;
  }

  removeParticipant(id: string): void {
    this.updateMap((map) => map.delete(id));
  }

  setStream(id: string, stream: MediaStream | null): void {
    this.patchParticipant(id, { stream });
  }

  setMediaState(id: string, mediaState: MediaState): void {
    this.patchParticipant(id, { mediaState });
  }

  setConnectionState(id: string, connectionState: PeerConnectionLifecycleState): void {
    this.patchParticipant(id, { connectionState });
  }

  setConnectionQuality(id: string, connectionQuality: ConnectionQuality): void {
    this.patchParticipant(id, { connectionQuality });
  }

  setActiveSpeaker(id: string | null): void {
    this.activeSpeakerId.set(id);
    const current = this.participantsMap();
    const next = new Map(current);
    let changed = false;
    for (const [pid, participant] of current) {
      const shouldBeActive = pid === id;
      if (participant.isActiveSpeaker !== shouldBeActive) {
        next.set(pid, { ...participant, isActiveSpeaker: shouldBeActive });
        changed = true;
      }
    }
    if (changed) this.participantsMap.set(next);
  }

  private patchParticipant(id: string, patch: Partial<Participant>): void {
    const current = this.participantsMap().get(id);
    if (!current) return;
    this.updateMap((map) => map.set(id, { ...current, ...patch }));
  }

  private updateMap(mutate: (map: Map<string, Participant>) => void): void {
    const next = new Map(this.participantsMap());
    mutate(next);
    this.participantsMap.set(next);
  }
}
