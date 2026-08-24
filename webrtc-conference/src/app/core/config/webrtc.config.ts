import { environment } from '../../../environments/environment';

/** Centralized, tunable configuration for the WebRTC layer. */
export const WEBRTC_CONFIG = {
  rtcConfiguration: {
    iceServers: environment.iceServers,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  } satisfies RTCConfiguration,

  mediaConstraints: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      // 480p/24fps by default — a full-mesh call encodes/decodes one stream per
      // remote participant in software on most machines, so this keeps CPU load
      // reasonable even on modest hardware. Raise toward 1280x720/30 once you've
      // confirmed target devices have headroom (or once tracks are SFU-routed).
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: 'user',
    },
  } satisfies MediaStreamConstraints,

  screenShareConstraints: {
    video: {
      frameRate: { ideal: 15, max: 30 },
    },
    audio: false,
  } satisfies DisplayMediaStreamOptions,

  signaling: {
    reconnectBaseDelayMs: 500,
    reconnectMaxDelayMs: 15000,
    maxReconnectAttempts: 20,
    heartbeatIntervalMs: 20000,
  },

  ice: {
    /** How long an ICE connection may stay 'disconnected' before we attempt an ICE restart. */
    restartAfterDisconnectedMs: 4000,
  },

  stats: {
    pollIntervalMs: 2500,
    qualityThresholds: {
      excellent: { maxPacketLossPercent: 0.5, maxRttMs: 100 },
      good: { maxPacketLossPercent: 2, maxRttMs: 250 },
      fair: { maxPacketLossPercent: 5, maxRttMs: 500 },
      // anything worse than 'fair' is classified 'poor'
    },
  },

  activeSpeaker: {
    fftSize: 512,
    volumeThreshold: 0.09,
    pollIntervalMs: 200,
    minHoldMs: 1200,
  },
} as const;
