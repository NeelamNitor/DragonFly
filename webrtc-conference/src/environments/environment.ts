export const environment = {
  production: false,
  signalingUrl: 'ws://localhost:8080',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
    // Example TURN entry for restrictive networks (symmetric NAT / corporate firewalls).
    // Provide real credentials via build-time env injection before enabling in production.
    // { urls: ['turn:your-turn-server.example.com:3478'], username: 'turn-user', credential: 'turn-pass' },
  ] as RTCIceServer[],
};
