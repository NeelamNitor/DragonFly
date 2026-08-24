import { Injectable } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WEBRTC_CONFIG } from '../config/webrtc.config';
import {
  IMediaTransport,
  PeerConnectionStateEvent,
  RemoteStreamEvent,
} from '../interfaces/media-transport.interface';
import { MediaState } from '../models/media-state.model';
import {
  AnswerMessage,
  IceCandidateMessage,
  JoinedMessage,
  OfferMessage,
  ParticipantJoinedMessage,
  ParticipantLeftMessage,
  SignalingMessage,
} from '../models/signaling-message.model';
import { NotificationService } from './notification.service';
import { PeerConnectionFactoryService } from './peer-connection-factory.service';
import { SignalingService } from './signaling.service';

interface PeerEntry {
  id: string;
  pc: RTCPeerConnection;
  /** Perfect-negotiation role, derived deterministically so both sides agree without extra signaling. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  senders: Map<string, RTCRtpSender>;
  pendingCandidates: RTCIceCandidateInit[];
}

/**
 * Full-mesh P2P implementation of {@link IMediaTransport}: one RTCPeerConnection
 * per remote participant, negotiated with the "perfect negotiation" pattern so
 * offer/answer glare between simultaneously-joining peers resolves deterministically.
 *
 * This is the piece that gets swapped for an SFU-backed transport when rooms
 * need to scale past a handful of participants — everything above this service
 * (state store, components) only ever talks to the `IMediaTransport` contract.
 */
@Injectable({ providedIn: 'root' })
export class WebRtcSessionService implements IMediaTransport {
  private readonly remoteStreamSubject = new Subject<RemoteStreamEvent>();
  private readonly participantJoinedSubject = new Subject<{ participantId: string; displayName: string; mediaState: MediaState }>();
  private readonly participantLeftSubject = new Subject<string>();
  private readonly participantMediaStateSubject = new Subject<{ participantId: string; mediaState: MediaState }>();
  private readonly connectionStateChangeSubject = new Subject<PeerConnectionStateEvent>();

  readonly remoteStream$ = this.remoteStreamSubject.asObservable();
  readonly participantJoined$ = this.participantJoinedSubject.asObservable();
  readonly participantLeft$ = this.participantLeftSubject.asObservable();
  readonly participantMediaState$ = this.participantMediaStateSubject.asObservable();
  readonly connectionStateChange$ = this.connectionStateChangeSubject.asObservable();

  private readonly peers = new Map<string, PeerEntry>();
  private readonly disconnectWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();
  private messageSub: Subscription | null = null;

  private selfId: string | null = null;
  private localStream: MediaStream | null = null;

  constructor(
    private readonly signaling: SignalingService,
    private readonly pcFactory: PeerConnectionFactoryService,
    private readonly notifications: NotificationService,
  ) {}

  async connect(roomId: string, participantId: string, displayName: string, localStream: MediaStream): Promise<void> {
    this.selfId = participantId;
    this.localStream = localStream;

    this.messageSub?.unsubscribe();
    this.messageSub = this.signaling.message$.subscribe((message) => this.handleMessage(message));

    this.signaling.connect(environment.signalingUrl);
    this.signaling.join({ type: 'join', roomId, participantId, displayName });
  }

  async replaceLocalTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null): Promise<void> {
    await Promise.all(
      Array.from(this.peers.values()).map(async (entry) => {
        const sender = entry.senders.get(kind);
        if (sender) {
          await sender.replaceTrack(track);
        } else if (track && this.localStream) {
          entry.senders.set(kind, entry.pc.addTrack(track, this.localStream));
        }
      }),
    );
  }

  broadcastMediaState(state: MediaState): void {
    if (!this.selfId) return;
    this.signaling.send({ type: 'media-state', from: this.selfId, mediaState: state });
  }

  async getStatsForParticipant(participantId: string): Promise<RTCStatsReport | null> {
    const entry = this.peers.get(participantId);
    return entry ? entry.pc.getStats() : null;
  }

  getAllPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  async disconnect(): Promise<void> {
    this.messageSub?.unsubscribe();
    this.messageSub = null;

    this.disconnectWatchdogs.forEach((timer) => clearTimeout(timer));
    this.disconnectWatchdogs.clear();

    this.peers.forEach((entry) => {
      this.stopPeerMedia(entry);
      entry.pc.close();
    });
    this.peers.clear();

    this.signaling.disconnect();
    this.selfId = null;
    this.localStream = null;
  }

  // -- signaling message routing -----------------------------------------

  private handleMessage(message: SignalingMessage): void {
    switch (message.type) {
      case 'joined':
        this.handleJoined(message);
        break;
      case 'participant-joined':
        this.handleParticipantJoined(message);
        break;
      case 'participant-left':
        this.handleParticipantLeft(message);
        break;
      case 'offer':
        if (message.to === this.selfId) void this.handleOffer(message);
        break;
      case 'answer':
        if (message.to === this.selfId) void this.handleAnswer(message);
        break;
      case 'ice-candidate':
        if (message.to === this.selfId) void this.handleIceCandidate(message);
        break;
      case 'media-state':
        this.participantMediaStateSubject.next({ participantId: message.from, mediaState: message.mediaState });
        break;
      case 'error':
        this.notifications.error(message.message);
        break;
    }
  }

  private handleJoined(message: JoinedMessage): void {
    for (const participant of message.participants) {
      this.participantJoinedSubject.next({
        participantId: participant.participantId,
        displayName: participant.displayName,
        mediaState: participant.mediaState,
      });
      this.createPeer(participant.participantId);
    }
  }

  private handleParticipantJoined(message: ParticipantJoinedMessage): void {
    const { participant } = message;
    this.participantJoinedSubject.next({
      participantId: participant.participantId,
      displayName: participant.displayName,
      mediaState: participant.mediaState,
    });
    this.createPeer(participant.participantId);
  }

  private handleParticipantLeft(message: ParticipantLeftMessage): void {
    this.closePeer(message.participantId);
    this.participantLeftSubject.next(message.participantId);
  }

  private async handleOffer(message: OfferMessage): Promise<void> {
    const entry = this.peers.get(message.from) ?? this.createPeer(message.from);
    const pc = entry.pc;

    const offerCollision = pc.signalingState !== 'stable' || entry.makingOffer;
    entry.ignoreOffer = !entry.polite && offerCollision;
    if (entry.ignoreOffer) return;

    try {
      if (offerCollision) {
        await Promise.all([pc.setLocalDescription({ type: 'rollback' }), pc.setRemoteDescription(message.sdp)]);
      } else {
        await pc.setRemoteDescription(message.sdp);
      }
      await pc.setLocalDescription();
      this.signaling.send({ type: 'answer', from: this.selfId!, to: message.from, sdp: pc.localDescription! });
      await this.flushPendingCandidates(entry);
    } catch (err) {
      console.error('[webrtc] failed to handle offer', err);
    }
  }

  private async handleAnswer(message: AnswerMessage): Promise<void> {
    const entry = this.peers.get(message.from);
    if (!entry) return;
    try {
      await entry.pc.setRemoteDescription(message.sdp);
      await this.flushPendingCandidates(entry);
    } catch (err) {
      console.error('[webrtc] failed to handle answer', err);
    }
  }

  private async handleIceCandidate(message: IceCandidateMessage): Promise<void> {
    const entry = this.peers.get(message.from);
    if (!entry) return;
    if (!entry.pc.remoteDescription) {
      entry.pendingCandidates.push(message.candidate);
      return;
    }
    try {
      await entry.pc.addIceCandidate(message.candidate);
    } catch (err) {
      if (!entry.ignoreOffer) console.error('[webrtc] failed to add ICE candidate', err);
    }
  }

  // -- peer connection lifecycle -------------------------------------------

  private createPeer(remoteId: string): PeerEntry {
    const existing = this.peers.get(remoteId);
    if (existing) return existing;

    const pc = this.pcFactory.create();
    const entry: PeerEntry = {
      id: remoteId,
      pc,
      polite: (this.selfId ?? '') > remoteId,
      makingOffer: false,
      ignoreOffer: false,
      senders: new Map(),
      pendingCandidates: [],
    };
    this.peers.set(remoteId, entry);

    this.localStream?.getTracks().forEach((track) => {
      entry.senders.set(track.kind, pc.addTrack(track, this.localStream!));
    });

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.signaling.send({ type: 'offer', from: this.selfId!, to: remoteId, sdp: pc.localDescription! });
      } catch (err) {
        console.error('[webrtc] negotiation failed', err);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signaling.send({ type: 'ice-candidate', from: this.selfId!, to: remoteId, candidate: candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      this.remoteStreamSubject.next({ participantId: remoteId, stream: stream ?? new MediaStream([event.track]) });
    };

    pc.onconnectionstatechange = () => {
      this.connectionStateChangeSubject.next({ participantId: remoteId, state: pc.connectionState });
      if (pc.connectionState === 'failed') {
        void this.attemptIceRestart(remoteId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected') {
        this.scheduleDisconnectWatchdog(remoteId);
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.clearWatchdog(remoteId);
      }
    };

    return entry;
  }

  private closePeer(remoteId: string): void {
    const entry = this.peers.get(remoteId);
    if (!entry) return;
    this.clearWatchdog(remoteId);
    this.stopPeerMedia(entry);
    entry.pc.close();
    this.peers.delete(remoteId);
  }

  /** Explicitly stops inbound tracks so remote audio/video can never keep playing
   *  past a peer connection close, regardless of how quickly the UI removes the tile. */
  private stopPeerMedia(entry: PeerEntry): void {
    entry.pc.getReceivers().forEach((receiver) => {
      try {
        receiver.track?.stop();
      } catch {
        // already stopped/ended — ignore
      }
    });
  }

  private async attemptIceRestart(remoteId: string): Promise<void> {
    const entry = this.peers.get(remoteId);
    if (!entry) return;
    try {
      entry.makingOffer = true;
      const offer = await entry.pc.createOffer({ iceRestart: true });
      await entry.pc.setLocalDescription(offer);
      this.signaling.send({ type: 'offer', from: this.selfId!, to: remoteId, sdp: entry.pc.localDescription! });
    } catch (err) {
      console.error('[webrtc] ICE restart failed', err);
    } finally {
      entry.makingOffer = false;
    }
  }

  private scheduleDisconnectWatchdog(remoteId: string): void {
    this.clearWatchdog(remoteId);
    const timer = setTimeout(() => {
      const entry = this.peers.get(remoteId);
      const state = entry?.pc.iceConnectionState;
      if (entry && (state === 'disconnected' || state === 'failed')) {
        void this.attemptIceRestart(remoteId);
      }
    }, WEBRTC_CONFIG.ice.restartAfterDisconnectedMs);
    this.disconnectWatchdogs.set(remoteId, timer);
  }

  private clearWatchdog(remoteId: string): void {
    const timer = this.disconnectWatchdogs.get(remoteId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectWatchdogs.delete(remoteId);
    }
  }

  private async flushPendingCandidates(entry: PeerEntry): Promise<void> {
    const candidates = entry.pendingCandidates;
    entry.pendingCandidates = [];
    for (const candidate of candidates) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch (err) {
        console.error('[webrtc] failed to add queued ICE candidate', err);
      }
    }
  }
}
