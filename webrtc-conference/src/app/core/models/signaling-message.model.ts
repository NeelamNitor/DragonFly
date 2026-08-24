import { MediaState } from './media-state.model';

export type SignalingMessageType =
  | 'join'
  | 'joined'
  | 'participant-joined'
  | 'participant-left'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'media-state'
  | 'error'
  | 'ping'
  | 'pong';

export interface RemoteParticipantInfo {
  participantId: string;
  displayName: string;
  mediaState: MediaState;
}

export interface JoinMessage {
  type: 'join';
  roomId: string;
  participantId: string;
  displayName: string;
}

export interface JoinedMessage {
  type: 'joined';
  selfId: string;
  roomId: string;
  participants: RemoteParticipantInfo[];
}

export interface ParticipantJoinedMessage {
  type: 'participant-joined';
  participant: RemoteParticipantInfo;
}

export interface ParticipantLeftMessage {
  type: 'participant-left';
  participantId: string;
}

export interface OfferMessage {
  type: 'offer';
  from: string;
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface AnswerMessage {
  type: 'answer';
  from: string;
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidateMessage {
  type: 'ice-candidate';
  from: string;
  to: string;
  candidate: RTCIceCandidateInit;
}

export interface MediaStateMessage {
  type: 'media-state';
  from: string;
  mediaState: MediaState;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

export type SignalingMessage =
  | JoinMessage
  | JoinedMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | MediaStateMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;
