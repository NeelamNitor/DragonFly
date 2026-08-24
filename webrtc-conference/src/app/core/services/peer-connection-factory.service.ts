import { Injectable } from '@angular/core';
import { WEBRTC_CONFIG } from '../config/webrtc.config';

/** Isolates `new RTCPeerConnection(...)` behind a service so it can be mocked in tests. */
@Injectable({ providedIn: 'root' })
export class PeerConnectionFactoryService {
  create(): RTCPeerConnection {
    return new RTCPeerConnection(WEBRTC_CONFIG.rtcConfiguration);
  }
}
