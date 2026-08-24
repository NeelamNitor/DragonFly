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
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
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
