import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MediaState } from '../../../../core/models/media-state.model';
import { ActiveSpeakerService } from '../../../../core/services/active-speaker.service';
import { MediaDeviceService } from '../../../../core/services/media-device.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SignalingService } from '../../../../core/services/signaling.service';
import { StatsMonitorService } from '../../../../core/services/stats-monitor.service';
import { WebRtcSessionService } from '../../../../core/services/webrtc-session.service';
import { SessionPrefsService } from '../../../../shared/services/session-prefs.service';
import { ControlsBarComponent } from '../../components/controls-bar/controls-bar.component';
import { StatsPanelComponent } from '../../components/stats-panel/stats-panel.component';
import { VideoGridComponent } from '../../components/video-grid/video-grid.component';
import { ConferenceStore } from '../../state/conference.store';

@Component({
  selector: 'app-room',
  imports: [VideoGridComponent, ControlsBarComponent, StatsPanelComponent],
  providers: [ConferenceStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './room.component.html',
  styleUrl: './room.component.scss',
})
export class RoomComponent implements OnInit {
  protected readonly store = inject(ConferenceStore);
  protected readonly media = inject(MediaDeviceService);
  protected readonly stats = inject(StatsMonitorService);
  protected readonly signalingConnection = inject(SignalingService).connectionState;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly prefs = inject(SessionPrefsService);
  private readonly webRtcSession = inject(WebRtcSessionService);
  private readonly activeSpeaker = inject(ActiveSpeakerService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly selfId = this.prefs.participantId;
  private hasLeft = false;
  private screenShareSyncInFlight = false;

  constructor() {
    effect(() => this.store.setActiveSpeaker(this.activeSpeaker.activeSpeakerId()));

    effect(() => {
      const statsMap = this.stats.statsByParticipant();
      statsMap.forEach((stat, participantId) => {
        this.store.setConnectionQuality(participantId, StatsMonitorService.classifyQuality(stat));
      });
    });

    effect(() => {
      const sharing = this.media.isScreenSharing();
      void this.syncScreenShare(sharing);
    });

    this.destroyRef.onDestroy(() => this.leaveRoom(false));
  }

  async ngOnInit(): Promise<void> {
    const roomId = this.route.snapshot.paramMap.get('roomId');
    const displayName = this.prefs.displayName();

    if (!roomId || !displayName) {
      await this.router.navigate(['/']);
      return;
    }

    this.store.roomId.set(roomId);
    this.store.selfId.set(this.selfId);

    let localStream = this.media.localStream();
    if (!localStream) {
      try {
        localStream = await this.media.initialize();
      } catch {
        await this.router.navigate(['/']);
        return;
      }
    }

    this.store.ensureParticipant(this.selfId, displayName, true);
    this.store.setStream(this.selfId, localStream);
    this.store.setMediaState(this.selfId, {
      audioEnabled: this.media.audioEnabled(),
      videoEnabled: this.media.videoEnabled(),
      screenSharing: false,
    });

    this.wireTransportEvents();
    this.activeSpeaker.start();
    this.stats.start();

    try {
      await this.webRtcSession.connect(roomId, this.selfId, displayName, localStream);
    } catch {
      this.notifications.error('Failed to join the meeting. Please try again.');
    }
  }

  protected toggleAudio(): void {
    this.applyLocalMediaStatePatch({ audioEnabled: this.media.toggleAudio() });
  }

  protected toggleVideo(): void {
    this.applyLocalMediaStatePatch({ videoEnabled: this.media.toggleVideo() });
  }

  protected toggleScreenShare(): void {
    if (this.media.isScreenSharing()) {
      this.media.stopScreenShare();
    } else {
      void this.media.startScreenShare();
    }
  }

  protected toggleStats(): void {
    this.store.isStatsPanelOpen.update((open) => !open);
  }

  protected async leave(): Promise<void> {
    this.leaveRoom(true);
    // Browsers only allow a page to close a tab it opened itself via script
    // (e.g. window.open()); a tab reached by typing/clicking a normal link
    // can't be force-closed and this silently no-ops there — the navigate
    // below is what actually runs in that (common) case.
    window.close();
    await this.router.navigate(['/']);
  }

  private wireTransportEvents(): void {
    this.webRtcSession.participantJoined$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ participantId, displayName, mediaState }) => {
        this.store.ensureParticipant(participantId, displayName, false);
        this.store.setMediaState(participantId, mediaState);
      });

    this.webRtcSession.participantLeft$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((participantId) => {
      this.activeSpeaker.unregisterStream(participantId);
      this.store.removeParticipant(participantId);
    });

    this.webRtcSession.remoteStream$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ participantId, stream }) => {
        this.store.ensureParticipant(participantId, participantId, false);
        this.store.setStream(participantId, stream);
        this.activeSpeaker.registerStream(participantId, stream);
      });

    this.webRtcSession.participantMediaState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ participantId, mediaState }) => this.store.setMediaState(participantId, mediaState));

    this.webRtcSession.connectionStateChange$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ participantId, state }) => this.store.setConnectionState(participantId, state));
  }

  /** Keeps the outgoing video track and the local preview in sync with screen-share state,
   *  whether it was toggled from our own button or ended via the browser's native "Stop sharing" UI. */
  private async syncScreenShare(sharing: boolean): Promise<void> {
    if (this.screenShareSyncInFlight) return;
    const participant = this.store.localParticipant();
    if (!participant || participant.mediaState.screenSharing === sharing) return;

    this.screenShareSyncInFlight = true;
    try {
      const track = sharing
        ? (this.media.screenStream()?.getVideoTracks()[0] ?? null)
        : (this.media.localStream()?.getVideoTracks()[0] ?? null);

      await this.webRtcSession.replaceLocalTrack('video', track);

      const nextState: MediaState = { ...participant.mediaState, screenSharing: sharing };
      this.store.setMediaState(this.selfId, nextState);
      this.store.setStream(this.selfId, sharing ? this.media.screenStream() : this.media.localStream());
      this.webRtcSession.broadcastMediaState(nextState);
    } finally {
      this.screenShareSyncInFlight = false;
    }
  }

  private applyLocalMediaStatePatch(patch: Partial<MediaState>): void {
    const participant = this.store.localParticipant();
    if (!participant) return;
    const next: MediaState = { ...participant.mediaState, ...patch };
    this.store.setMediaState(this.selfId, next);
    this.webRtcSession.broadcastMediaState(next);
  }

  private leaveRoom(stopMedia: boolean): void {
    if (this.hasLeft) return;
    this.hasLeft = true;
    void this.webRtcSession.disconnect();
    this.stats.stop();
    this.activeSpeaker.stop();
    if (stopMedia) this.media.stopAll();
  }
}
