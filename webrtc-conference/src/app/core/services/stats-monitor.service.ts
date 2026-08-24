import { Injectable, signal } from '@angular/core';
import { WEBRTC_CONFIG } from '../config/webrtc.config';
import { emptyStats, PeerCallStats } from '../models/call-stats.model';
import { ConnectionQuality } from '../models/connection-state.model';
import { WebRtcSessionService } from './webrtc-session.service';

interface PrevSample {
  timestamp: number;
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  packetsReceived: number;
}

/** Polls `RTCPeerConnection.getStats()` for every active peer and derives readable metrics. */
@Injectable({ providedIn: 'root' })
export class StatsMonitorService {
  readonly statsByParticipant = signal<Map<string, PeerCallStats>>(new Map());

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly previousSamples = new Map<string, PrevSample>();

  constructor(private readonly session: WebRtcSessionService) {}

  start(): void {
    this.stop();
    this.pollTimer = setInterval(() => void this.pollAll(), WEBRTC_CONFIG.stats.pollIntervalMs);
    void this.pollAll();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.previousSamples.clear();
    this.statsByParticipant.set(new Map());
  }

  static classifyQuality(stats: PeerCallStats): ConnectionQuality {
    const t = WEBRTC_CONFIG.stats.qualityThresholds;
    const rtt = stats.roundTripTimeMs ?? 0;
    const loss = stats.packetLossPercent;
    if (loss <= t.excellent.maxPacketLossPercent && rtt <= t.excellent.maxRttMs) return 'excellent';
    if (loss <= t.good.maxPacketLossPercent && rtt <= t.good.maxRttMs) return 'good';
    if (loss <= t.fair.maxPacketLossPercent && rtt <= t.fair.maxRttMs) return 'fair';
    return 'poor';
  }

  private async pollAll(): Promise<void> {
    const ids = this.session.getAllPeerIds();
    const next = new Map(this.statsByParticipant());

    await Promise.all(
      ids.map(async (id) => {
        const report = await this.session.getStatsForParticipant(id);
        if (!report) return;
        next.set(id, this.parseReport(id, report));
      }),
    );

    for (const id of Array.from(next.keys())) {
      if (!ids.includes(id)) next.delete(id);
    }

    this.statsByParticipant.set(next);
  }

  private parseReport(participantId: string, report: RTCStatsReport): PeerCallStats {
    const stats = emptyStats(participantId);
    const now = Date.now();
    let bytesReceived = 0;
    let bytesSent = 0;
    let packetsLost = 0;
    let packetsReceived = 0;

    report.forEach((stat) => {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
        if (typeof stat.currentRoundTripTime === 'number') {
          stats.roundTripTimeMs = Math.round(stat.currentRoundTripTime * 1000);
        }
        if (typeof stat.availableOutgoingBitrate === 'number') {
          stats.availableOutgoingBitrateKbps = Math.round(stat.availableOutgoingBitrate / 1000);
        }
      }
      if (stat.type === 'inbound-rtp' && !stat.isRemote) {
        bytesReceived += stat.bytesReceived ?? 0;
        packetsLost += stat.packetsLost ?? 0;
        packetsReceived += stat.packetsReceived ?? 0;
        if (typeof stat.jitter === 'number') stats.jitterMs = Math.round(stat.jitter * 1000);
        if (stat.kind === 'video') {
          stats.frameRate = stat.framesPerSecond ?? stats.frameRate;
          if (stat.frameWidth && stat.frameHeight) {
            stats.resolution = { width: stat.frameWidth, height: stat.frameHeight };
          }
        }
      }
      if (stat.type === 'outbound-rtp' && !stat.isRemote) {
        bytesSent += stat.bytesSent ?? 0;
      }
      if (stat.type === 'codec' && stat.mimeType) {
        stats.codec = stat.mimeType.split('/')[1] ?? stat.mimeType;
      }
    });

    stats.packetsLost = packetsLost;

    const prev = this.previousSamples.get(participantId);
    if (prev) {
      const elapsedSec = Math.max(0.001, (now - prev.timestamp) / 1000);
      stats.inboundBitrateKbps = Math.max(0, Math.round(((bytesReceived - prev.bytesReceived) * 8) / elapsedSec / 1000));
      stats.outboundBitrateKbps = Math.max(0, Math.round(((bytesSent - prev.bytesSent) * 8) / elapsedSec / 1000));

      const lostDelta = Math.max(0, packetsLost - prev.packetsLost);
      const receivedDelta = Math.max(0, packetsReceived - prev.packetsReceived);
      const totalDelta = lostDelta + receivedDelta;
      stats.packetLossPercent = totalDelta > 0 ? Math.round((lostDelta / totalDelta) * 1000) / 10 : 0;
    }
    this.previousSamples.set(participantId, { timestamp: now, bytesReceived, bytesSent, packetsLost, packetsReceived });

    stats.timestamp = now;
    return stats;
  }
}
