import { Injectable, signal } from '@angular/core';
import { WEBRTC_CONFIG } from '../config/webrtc.config';
import { NotificationService } from './notification.service';

/**
 * Owns local camera/microphone/screen-share acquisition and device enumeration.
 * Deliberately has zero knowledge of RTCPeerConnection — the session layer
 * pulls tracks from here and pushes them onto peer connections.
 */
@Injectable({ providedIn: 'root' })
export class MediaDeviceService {
  readonly localStream = signal<MediaStream | null>(null);
  readonly screenStream = signal<MediaStream | null>(null);
  readonly audioEnabled = signal(true);
  readonly videoEnabled = signal(true);
  readonly isScreenSharing = signal(false);
  readonly audioInputDevices = signal<MediaDeviceInfo[]>([]);
  readonly videoInputDevices = signal<MediaDeviceInfo[]>([]);
  readonly mediaError = signal<string | null>(null);

  constructor(private readonly notifications: NotificationService) {}

  async initialize(constraints: MediaStreamConstraints = WEBRTC_CONFIG.mediaConstraints): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream.set(stream);
      this.audioEnabled.set(stream.getAudioTracks().some((t) => t.enabled));
      this.videoEnabled.set(stream.getVideoTracks().some((t) => t.enabled));
      this.mediaError.set(null);
      await this.enumerateDevices();
      return stream;
    } catch (err) {
      const message = this.describeMediaError(err);
      this.mediaError.set(message);
      this.notifications.error(message);
      throw err;
    }
  }

  async enumerateDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.audioInputDevices.set(devices.filter((d) => d.kind === 'audioinput'));
    this.videoInputDevices.set(devices.filter((d) => d.kind === 'videoinput'));
  }

  toggleAudio(): boolean {
    const stream = this.localStream();
    if (!stream) return false;
    const next = !this.audioEnabled();
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    this.audioEnabled.set(next);
    return next;
  }

  toggleVideo(): boolean {
    const stream = this.localStream();
    if (!stream) return false;
    const next = !this.videoEnabled();
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    this.videoEnabled.set(next);
    return next;
  }

  async switchDevice(kind: 'audio' | 'video', deviceId: string): Promise<MediaStreamTrack | null> {
    const stream = this.localStream();
    if (!stream) return null;

    const constraints: MediaStreamConstraints =
      kind === 'audio'
        ? { audio: { ...WEBRTC_CONFIG.mediaConstraints.audio as object, deviceId: { exact: deviceId } } }
        : { video: { ...WEBRTC_CONFIG.mediaConstraints.video as object, deviceId: { exact: deviceId } } };

    try {
      const replacement = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = kind === 'audio' ? replacement.getAudioTracks()[0] : replacement.getVideoTracks()[0];
      const oldTracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();

      oldTracks.forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(newTrack);
      newTrack.enabled = kind === 'audio' ? this.audioEnabled() : this.videoEnabled();
      return newTrack;
    } catch (err) {
      this.notifications.error(this.describeMediaError(err));
      return null;
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(WEBRTC_CONFIG.screenShareConstraints);
      this.screenStream.set(stream);
      this.isScreenSharing.set(true);
      stream.getVideoTracks()[0].addEventListener('ended', () => this.stopScreenShare());
      return stream;
    } catch (err) {
      const message = this.describeMediaError(err);
      this.notifications.error(message);
      throw err;
    }
  }

  stopScreenShare(): void {
    this.screenStream()?.getTracks().forEach((t) => t.stop());
    this.screenStream.set(null);
    this.isScreenSharing.set(false);
  }

  stopAll(): void {
    this.localStream()?.getTracks().forEach((t) => t.stop());
    this.localStream.set(null);
    this.stopScreenShare();
  }

  private describeMediaError(err: unknown): string {
    const name = err instanceof DOMException ? err.name : '';
    switch (name) {
      case 'NotAllowedError':
        return 'Camera/microphone access was denied. Check your browser permissions and try again.';
      case 'NotFoundError':
        return 'No camera or microphone was found on this device.';
      case 'NotReadableError':
        return 'Your camera or microphone is already in use by another application.';
      case 'OverconstrainedError':
        return 'The selected device does not support the requested settings.';
      default:
        return 'Unable to access media devices.';
    }
  }
}
