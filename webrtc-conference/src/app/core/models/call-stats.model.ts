export interface PeerCallStats {
  participantId: string;
  timestamp: number;
  roundTripTimeMs: number | null;
  packetsLost: number;
  packetLossPercent: number;
  jitterMs: number;
  availableOutgoingBitrateKbps: number | null;
  inboundBitrateKbps: number;
  outboundBitrateKbps: number;
  frameRate: number | null;
  resolution: { width: number; height: number } | null;
  codec: string | null;
}

export function emptyStats(participantId: string): PeerCallStats {
  return {
    participantId,
    timestamp: Date.now(),
    roundTripTimeMs: null,
    packetsLost: 0,
    packetLossPercent: 0,
    jitterMs: 0,
    availableOutgoingBitrateKbps: null,
    inboundBitrateKbps: 0,
    outboundBitrateKbps: 0,
    frameRate: null,
    resolution: null,
    codec: null,
  };
}
