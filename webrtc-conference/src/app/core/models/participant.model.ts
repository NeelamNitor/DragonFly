import { ConnectionQuality, PeerConnectionLifecycleState } from './connection-state.model';
import { DEFAULT_MEDIA_STATE, MediaState } from './media-state.model';

export interface Participant {
  id: string;
  displayName: string;
  isLocal: boolean;
  stream: MediaStream | null;
  mediaState: MediaState;
  connectionState: PeerConnectionLifecycleState;
  connectionQuality: ConnectionQuality;
  isActiveSpeaker: boolean;
  joinedAt: number;
}

export function createParticipant(id: string, displayName: string, isLocal: boolean): Participant {
  return {
    id,
    displayName,
    isLocal,
    stream: null,
    mediaState: { ...DEFAULT_MEDIA_STATE },
    connectionState: 'idle',
    connectionQuality: 'unknown',
    isActiveSpeaker: false,
    joinedAt: Date.now(),
  };
}
