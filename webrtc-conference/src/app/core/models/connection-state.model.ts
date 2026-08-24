export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export type SignalingStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export interface SignalingConnectionState {
  status: SignalingStatus;
  attempt: number;
}

export type PeerConnectionLifecycleState = RTCPeerConnectionState | 'idle';
