# WebRTC Video Conferencing — Angular

A production-oriented WebRTC video conferencing app: 1:1 calling and multi-participant
(mesh) conferencing, built with Angular 22 (standalone components, zoneless change
detection, Signals) and a minimal Node.js WebSocket signaling server.

```
WebRTC Demo/
├── webrtc-conference/     Angular application (this is the app you run)
├── signaling-server/      Minimal Node/ws signaling server (offer/answer/ICE relay)
└── README.md              This file
```

## Features

- 1:1 P2P and multi-participant (full-mesh) video/audio calling
- WebSocket signaling for join/leave, offer, answer, and ICE candidate exchange
- Camera/microphone mute toggles, device selection, and a pre-join lobby with preview
- Screen sharing (swaps the outgoing video track live, no renegotiation-from-scratch)
- Participant join/leave handling, responsive video grid
- Active-speaker detection (Web Audio RMS analysis) and per-participant status badges
- Automatic WebSocket reconnection (exponential backoff) and per-peer ICE restart on
  connectivity loss
- Configurable STUN/TURN servers
- Live `RTCPeerConnection.getStats()` panel (RTT, jitter, packet loss, bitrate, codec, resolution)
- Clean separation of UI / state / signaling / WebRTC layers, so the transport can evolve
  from mesh P2P to an SFU without touching the UI

## Architecture

```
 ┌─────────────────────────── Angular app ───────────────────────────┐
 │                                                                    │
 │  Lobby / Room components  (UI, OnPush, Signals)                   │
 │        │  reads/writes                                            │
 │        ▼                                                          │
 │  ConferenceStore            room-scoped Signals state              │
 │  (participants, active speaker, stats-panel toggle, ...)           │
 │        │  driven by                          ▲                    │
 │        ▼                                     │                    │
 │  WebRtcSessionService  ──implements──▶  IMediaTransport            │
 │  (full-mesh RTCPeerConnections,                                    │
 │   perfect-negotiation, ICE restart)                                │
 │        │                          │                                │
 │        ▼                          ▼                                │
 │  SignalingService (WS)     MediaDeviceService                      │
 │  (reconnect, heartbeat)    (camera/mic/screen)                     │
 │        │                                                            │
 └────────┼────────────────────────────────────────────────────────────┘
          ▼
   signaling-server (Node/ws) — relays offer/answer/ICE, tracks room membership
```

Supporting services (`StatsMonitorService`, `ActiveSpeakerService`, `NotificationService`)
sit alongside the session layer and only read from it — they never touch signaling or
peer connections directly.

### Why `IMediaTransport`

Everything above `WebRtcSessionService` — the store and every component — only ever
depends on [`core/interfaces/media-transport.interface.ts`](webrtc-conference/src/app/core/interfaces/media-transport.interface.ts).
Today that interface is implemented by a full **mesh** transport (one `RTCPeerConnection`
per remote participant — fine up to roughly 6-8 participants before upload bandwidth and
CPU on each client become the bottleneck). To scale further, add an `SfuTransportService`
that implements the same interface against a media server (mediasoup, LiveKit, Janus, ...)
— a single upstream connection per client instead of N-1 — and swap it in via DI. No
change is needed in `ConferenceStore`, `RoomComponent`, or any child component.

### Negotiation model

Peers use the **perfect negotiation** pattern (see `WebRtcSessionService.createPeer`):
politeness is derived deterministically by comparing participant IDs (`selfId > remoteId`),
so both sides agree on who yields during offer/answer glare without extra signaling. This
matters in mesh mode because two participants can both trigger `negotiationneeded` at
nearly the same time (e.g. two people joining within a few hundred ms of each other).

### Resilience

- `SignalingService` reconnects the WebSocket with full-jitter exponential backoff and
  replays the last `join` message so a dropped connection re-establishes room presence.
- `WebRtcSessionService` watches `iceConnectionState`; if a peer stays `disconnected` for
  longer than `WEBRTC_CONFIG.ice.restartAfterDisconnectedMs`, it triggers an ICE restart
  (`createOffer({ iceRestart: true })`) rather than tearing down the whole call.

## Project layout (`webrtc-conference/src/app`)

```
core/
  config/webrtc.config.ts        all tunables: ICE servers, media constraints,
                                  reconnect/backoff timing, quality thresholds
  models/                        MediaState, Participant, SignalingMessage, PeerCallStats, ...
  interfaces/media-transport.ts  IMediaTransport contract (mesh today, SFU-ready)
  services/
    signaling.service.ts         WebSocket wrapper: connect/reconnect/heartbeat
    media-device.service.ts      camera/mic/screen acquisition, device switching
    peer-connection-factory.ts   RTCPeerConnection construction (mockable)
    webrtc-session.service.ts    mesh transport: negotiation, ICE, track replace
    stats-monitor.service.ts     getStats() polling → PeerCallStats
    active-speaker.service.ts    Web Audio volume analysis → active speaker id
    notification.service.ts     toast-style error/info surface

features/conference/
  state/conference.store.ts      room-scoped Signals store (provided per RoomComponent)
  pages/lobby/                   name + room code entry, device preview
  pages/room/                    orchestrates session connect/leave, screen share sync
  components/
    video-grid/                  responsive CSS grid, column count by participant count
    participant-tile/            per-participant video + mute/quality/name overlay
    controls-bar/                mic/cam/screen-share/stats/leave controls
    connection-badge/            colored per-peer quality dot
    stats-panel/                 live getStats() table

shared/
  components/toast/              app-wide notification host
  services/session-prefs.service.ts   lobby → room hand-off (display name, id)
```

## Setup

Requires Node.js 20+ (built and tested on Node 24) and npm.

### 1. Signaling server

```bash
cd signaling-server
npm install
npm start
# WebRTC signaling server listening on ws://localhost:8080
```

### 2. Angular app

```bash
cd webrtc-conference
npm install
npm start   # ng serve, http://localhost:4200
```

Open `http://localhost:4200` in two browser tabs (or two devices on the same network),
enter the same room code, and join. Camera/microphone permissions are required.

### Production build

```bash
cd webrtc-conference
npm run build
# output in dist/webrtc-conference, environment.prod.ts is swapped in automatically
```

## Configuration

All WebRTC tuning lives in one place:
[`src/app/core/config/webrtc.config.ts`](webrtc-conference/src/app/core/config/webrtc.config.ts).
ICE servers come from the environment files:

- [`src/environments/environment.ts`](webrtc-conference/src/environments/environment.ts) (dev)
- [`src/environments/environment.prod.ts`](webrtc-conference/src/environments/environment.prod.ts) (prod)

```ts
export const environment = {
  signalingUrl: 'wss://your-signaling-server.example.com',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['turn:your-turn-server.example.com:3478'], username: '...', credential: '...' },
  ],
};
```

**A TURN server is required for production.** STUN alone cannot traverse symmetric NATs
or many corporate firewalls; without TURN a meaningful fraction of real-world call attempts
will fail to connect. Inject TURN credentials at build/deploy time (short-lived credentials
from your TURN provider, not long-lived static ones, if you can avoid it).

## What's out of scope / production hardening checklist

This implements the architecture and the full client-side WebRTC/UI stack. Before shipping
publicly, you'd still want to add:

- **Auth & room access control** — the signaling server currently trusts any `join` message.
  Add a token (JWT) check before admitting a client to a room.
- **TURN** — see above; the demo config only ships STUN.
- **Horizontal scaling of the signaling server** — the provided server is a single
  in-memory Node process. For multiple instances, back room state with Redis pub/sub (or
  similar) so relays work across processes.
- **SFU transport** for rooms larger than ~6-8 participants (see `IMediaTransport` above).
- **E2E test coverage** for the negotiation/reconnect paths (unit scaffolding — Vitest —
  is already wired via `ng test`).

## Testing notes

`ng build` (dev + production) and `ng test` both pass. The dev server was smoke-tested to
confirm the app boots and serves correctly. Camera/microphone/screen-share flows require a
real browser with media device access and were **not** exercised end-to-end in this
environment (headless, no camera) — verify the golden path (join → see local preview →
second participant joins → mute/camera/screen-share toggles → leave) manually before
relying on it.
