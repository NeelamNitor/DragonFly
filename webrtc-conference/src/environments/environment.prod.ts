export const environment = {
  production: true,
  signalingUrl: 'wss://dragonfly-8cvf.onrender.com',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    // TODO: add a TURN server — required for two participants on different
    // networks/locations behind strict NATs or firewalls, which STUN alone
    // often cannot traverse. Get free testing credentials from a provider
    // such as Metered.ca (Open Relay project), Twilio Network Traversal
    // Service, or Xirsys, then uncomment and fill in:
    // { urls: ['turn:your-turn-host:3478'], username: 'turn-user', credential: 'turn-pass' },
    // { urls: ['turn:your-turn-host:3478?transport=tcp'], username: 'turn-user', credential: 'turn-pass' },
  ] as RTCIceServer[],
};
