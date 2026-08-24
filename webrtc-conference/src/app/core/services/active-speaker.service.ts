import { Injectable, signal } from '@angular/core';
import { WEBRTC_CONFIG } from '../config/webrtc.config';

interface AnalyserEntry {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  buffer: Uint8Array;
}

/**
 * Web Audio–based active-speaker detection. Registers one AnalyserNode per
 * participant stream and periodically compares RMS volume levels, with a
 * minimum hold time so the highlighted speaker doesn't flicker between
 * simultaneous talkers.
 */
@Injectable({ providedIn: 'root' })
export class ActiveSpeakerService {
  readonly activeSpeakerId = signal<string | null>(null);

  private audioContext: AudioContext | null = null;
  private readonly analysers = new Map<string, AnalyserEntry>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSwitchAt = 0;

  start(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.tick(), WEBRTC_CONFIG.activeSpeaker.pollIntervalMs);
  }

  registerStream(participantId: string, stream: MediaStream): void {
    if (this.analysers.has(participantId)) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const ctx = this.ensureContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = WEBRTC_CONFIG.activeSpeaker.fftSize;
    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
    source.connect(analyser);

    this.analysers.set(participantId, {
      analyser,
      source,
      buffer: new Uint8Array(analyser.frequencyBinCount),
    });
  }

  unregisterStream(participantId: string): void {
    const entry = this.analysers.get(participantId);
    if (!entry) return;
    entry.source.disconnect();
    entry.analyser.disconnect();
    this.analysers.delete(participantId);
    if (this.activeSpeakerId() === participantId) {
      this.activeSpeakerId.set(null);
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.analysers.forEach((entry) => {
      entry.source.disconnect();
      entry.analyser.disconnect();
    });
    this.analysers.clear();
    this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.activeSpeakerId.set(null);
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }

  private tick(): void {
    let loudestId: string | null = null;
    let loudestVolume = 0;

    this.analysers.forEach((entry, participantId) => {
      entry.analyser.getByteTimeDomainData(entry.buffer as Uint8Array<ArrayBuffer>);
      let sumSquares = 0;
      for (const sample of entry.buffer) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / entry.buffer.length);
      if (rms > loudestVolume) {
        loudestVolume = rms;
        loudestId = participantId;
      }
    });

    const now = Date.now();
    const candidate = loudestVolume >= WEBRTC_CONFIG.activeSpeaker.volumeThreshold ? loudestId : null;

    if (candidate !== this.activeSpeakerId() && now - this.lastSwitchAt >= WEBRTC_CONFIG.activeSpeaker.minHoldMs) {
      this.activeSpeakerId.set(candidate);
      this.lastSwitchAt = now;
    }
  }
}
