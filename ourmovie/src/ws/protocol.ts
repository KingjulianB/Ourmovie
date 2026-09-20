// Protocole WebSocket esquissé dans day1_objectives.md (Objectif B),
// implémenté ici via Socket.IO. Partagé (conceptuellement) avec le futur
// frontend et l'extension navigateur V2, qui parleront le même protocole.

export interface RoomState {
  roomCode: string;
  videoUrl: string | null;
  paused: boolean;
  position: number;
  participants: string[];
}

export interface ChatMessage {
  from: string;
  message: string;
  ts: number;
}

export interface JoinPayload {
  roomCode: string;
}

export interface PlaybackPayload {
  position: number;
}

export interface ChatPayload {
  message: string;
}
