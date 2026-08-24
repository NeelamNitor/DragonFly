export const environment = {
  production: true,
  signalingUrl: 'wss://dragonfly-8cvf.onrender.com',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun.relay.metered.ca:80'] },
    {
      urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp', 'turn:global.relay.metered.ca:443'],
      username: '65fad9e7014a8932477e1591',
      credential: 'Iz3J6vfCwh9W209i',
    },
    {
      urls: ['turns:global.relay.metered.ca:443?transport=tcp'],
      username: '65fad9e7014a8932477e1591',
      credential: 'Iz3J6vfCwh9W209i',
    },
  ] as RTCIceServer[],
};
