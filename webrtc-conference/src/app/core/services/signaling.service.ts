import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { WEBRTC_CONFIG } from '../config/webrtc.config';
import { SignalingConnectionState } from '../models/connection-state.model';
import { JoinMessage, SignalingMessage } from '../models/signaling-message.model';
import { computeBackoffDelay } from '../utils/backoff.util';

/**
 * Thin, resilient WebSocket wrapper around the signaling protocol.
 * Owns connection lifecycle, heartbeat and reconnection; knows nothing
 * about WebRTC itself so it can be swapped (e.g. for a Socket.IO or
 * server-sent transport) without touching the session layer.
 */
@Injectable({ providedIn: 'root' })
export class SignalingService {
  readonly connectionState = signal<SignalingConnectionState>({ status: 'disconnected', attempt: 0 });

  private readonly messageSubject = new Subject<SignalingMessage>();
  readonly message$ = this.messageSubject.asObservable();

  private socket: WebSocket | null = null;
  private url: string | null = null;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastJoin: JoinMessage | null = null;

  connect(url: string): void {
    this.url = url;
    this.shouldReconnect = true;
    this.openSocket();
  }

  /** Sends (and remembers) the join message so it can be replayed after a reconnect. */
  join(message: JoinMessage): void {
    this.lastJoin = message;
    this.send(message);
  }

  send(message: SignalingMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.lastJoin = null;
    this.clearTimers();
    this.socket?.close(1000, 'client-disconnect');
    this.socket = null;
    this.connectionState.set({ status: 'disconnected', attempt: 0 });
  }

  private openSocket(): void {
    if (!this.url) return;
    this.connectionState.set({ status: this.connectionState().attempt > 0 ? 'reconnecting' : 'connecting', attempt: this.connectionState().attempt });

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.connectionState.set({ status: 'connected', attempt: 0 });
      this.startHeartbeat();
      if (this.lastJoin) {
        this.send(this.lastJoin);
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as SignalingMessage;
        if (message.type === 'pong') return;
        this.messageSubject.next(message);
      } catch {
        // Ignore malformed frames rather than tearing down the connection.
      }
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      } else {
        this.connectionState.set({ status: 'disconnected', attempt: 0 });
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    const attempt = this.connectionState().attempt + 1;
    if (attempt > WEBRTC_CONFIG.signaling.maxReconnectAttempts) {
      this.connectionState.set({ status: 'failed', attempt });
      return;
    }
    this.connectionState.set({ status: 'reconnecting', attempt });
    const delay = computeBackoffDelay(
      attempt,
      WEBRTC_CONFIG.signaling.reconnectBaseDelayMs,
      WEBRTC_CONFIG.signaling.reconnectMaxDelayMs,
    );
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, WEBRTC_CONFIG.signaling.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
