import { Observable } from 'rxjs';
import { MediaState } from '../models/media-state.model';
import { PeerConnectionLifecycleState } from '../models/connection-state.model';

/**
 * Transport-agnostic contract for exchanging media with the rest of a room.
 *
 * `WebRtcSessionService` implements this today as a full-mesh P2P transport,
 * where every participant holds one RTCPeerConnection per remote peer. When a
 * room needs to scale beyond a handful of participants, a new
 * `SfuTransportService` can implement the same interface against a media
 * server (mediasoup, Janus, LiveKit, ...) — a single upstream RTCPeerConnection
 * instead of N-1 — without any change to the UI or state layer, which only
 * ever depends on this interface.
 */
export interface RemoteStreamEvent {
  participantId: string;
  stream: MediaStream;
}

export interface PeerConnectionStateEvent {
  participantId: string;
  state: PeerConnectionLifecycleState;
}

export interface IMediaTransport {
  readonly remoteStream$: Observable<RemoteStreamEvent>;
  readonly participantJoined$: Observable<{ participantId: string; displayName: string; mediaState: MediaState }>;
  readonly participantLeft$: Observable<string>;
  readonly participantMediaState$: Observable<{ participantId: string; mediaState: MediaState }>;
  readonly connectionStateChange$: Observable<PeerConnectionStateEvent>;

  connect(roomId: string, participantId: string, displayName: string, localStream: MediaStream): Promise<void>;
  replaceLocalTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void>;
  broadcastMediaState(state: MediaState): void;
  getStatsForParticipant(participantId: string): Promise<RTCStatsReport | null>;
  getAllPeerIds(): string[];
  disconnect(): Promise<void>;
}
