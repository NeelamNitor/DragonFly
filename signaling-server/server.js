'use strict';

/**
 * Minimal signaling server for the WebRTC conference demo.
 *
 * Responsibilities (and only these — no media ever touches this process):
 *   - track room membership (participantId -> displayName, mediaState)
 *   - relay offer/answer/ICE-candidate messages between a specific `from`/`to` pair
 *   - broadcast join/leave/media-state events to the rest of a room
 *
 * This is intentionally a single in-memory Node process: fine for local dev
 * and small deployments. For horizontal scaling, back `rooms` with Redis pub/sub
 * (or similar) so multiple signaling instances can relay across processes.
 */

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const HEARTBEAT_INTERVAL_MS = 30000;

/** @type {Map<string, Map<string, { ws: import('ws').WebSocket, displayName: string, mediaState: object }>>} */
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToRoom(roomId, message, exceptParticipantId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [participantId, peer] of room) {
    if (participantId !== exceptParticipantId) send(peer.ws, message);
  }
}

function removeFromRoom(roomId, participantId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(participantId);
  if (room.size === 0) {
    rooms.delete(roomId);
  } else {
    broadcastToRoom(roomId, { type: 'participant-left', participantId }, participantId);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomId = null;
  ws.participantId = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }

    switch (message.type) {
      case 'join': {
        const { roomId, participantId, displayName } = message;
        if (!roomId || !participantId) return;

        ws.roomId = roomId;
        ws.participantId = participantId;

        let room = rooms.get(roomId);
        if (!room) {
          room = new Map();
          rooms.set(roomId, room);
        }

        const existingParticipants = Array.from(room.entries()).map(([id, peer]) => ({
          participantId: id,
          displayName: peer.displayName,
          mediaState: peer.mediaState,
        }));

        room.set(participantId, {
          ws,
          displayName: displayName || 'Guest',
          mediaState: { audioEnabled: true, videoEnabled: true, screenSharing: false },
        });

        send(ws, { type: 'joined', selfId: participantId, roomId, participants: existingParticipants });

        broadcastToRoom(
          roomId,
          {
            type: 'participant-joined',
            participant: { participantId, displayName: displayName || 'Guest', mediaState: room.get(participantId).mediaState },
          },
          participantId,
        );

        console.log(`[join] ${participantId} (${displayName}) -> room "${roomId}" (${room.size} total)`);
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        const room = rooms.get(ws.roomId);
        const target = room?.get(message.to);
        if (target) send(target.ws, message);
        break;
      }

      case 'media-state': {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        const peer = room.get(ws.participantId);
        if (peer) peer.mediaState = message.mediaState;
        broadcastToRoom(ws.roomId, message, ws.participantId);
        break;
      }

      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (ws.roomId && ws.participantId) {
      removeFromRoom(ws.roomId, ws.participantId);
      console.log(`[leave] ${ws.participantId} <- room "${ws.roomId}"`);
    }
  });

  ws.on('error', (err) => {
    console.error('[ws error]', err.message);
  });
});

// Drop dead connections (e.g. client crashed without a clean close).
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      if (ws.roomId && ws.participantId) removeFromRoom(ws.roomId, ws.participantId);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeat));

console.log(`WebRTC signaling server listening on ws://localhost:${PORT}`);
