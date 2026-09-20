import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { db } from '../db/db.js';
import { getUserFromToken } from '../http/auth.js';
import type { ChatMessage, RoomState } from './protocol.js';

// Correction de dérive périodique (cf. day1_objectives.md, Objectif B — inspiré de watchparty).
const DRIFT_CORRECTION_INTERVAL_MS = 3000;

interface RoomRow {
  id: number;
  code: string;
  video_url: string | null;
  paused: number;
  position: number;
}

function loadRoom(code: string): RoomRow | undefined {
  return db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined;
}

function toState(room: RoomRow, participants: string[]): RoomState {
  return {
    roomCode: room.code,
    videoUrl: room.video_url,
    paused: Boolean(room.paused),
    position: room.position,
    participants,
  };
}

function participantsOf(io: Server, roomCode: string): string[] {
  const socketIds = io.sockets.adapter.rooms.get(roomCode);
  if (!socketIds) return [];
  return [...socketIds]
    .map((id) => io.sockets.sockets.get(id)?.data.username as string | undefined)
    .filter((username): username is string => Boolean(username));
}

function broadcastState(io: Server, roomCode: string) {
  const room = loadRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit('state', toState(room, participantsOf(io, roomCode)));
}

export function attachSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: '/socket.io',
    // Même raison que le CORS Fastify (index.ts) : l'extension navigateur (V2)
    // se connecte depuis une origine chrome-extension://..., cross-origin par nature.
    cors: { origin: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const user = getUserFromToken(token);
    if (!user) {
      next(new Error('non authentifié'));
      return;
    }
    socket.data.userId = user.id;
    socket.data.username = user.username;
    next();
  });

  io.on('connection', (socket: Socket) => {
    let currentRoomCode: string | null = null;

    function updatePlayback(patch: { paused?: boolean; position: number }) {
      if (!currentRoomCode) return;
      const room = loadRoom(currentRoomCode);
      if (!room) return;
      const paused = patch.paused === undefined ? room.paused : patch.paused ? 1 : 0;
      db.prepare(`UPDATE rooms SET position = ?, paused = ?, updated_at = datetime('now') WHERE code = ?`).run(
        patch.position,
        paused,
        currentRoomCode
      );
      broadcastState(io, currentRoomCode);
    }

    socket.on('join', ({ roomCode }: { roomCode: string }) => {
      const room = loadRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'salon introuvable' });
        return;
      }
      currentRoomCode = roomCode;
      socket.join(roomCode);
      broadcastState(io, roomCode);
    });

    socket.on('leave', () => {
      if (!currentRoomCode) return;
      const roomCode = currentRoomCode;
      socket.leave(roomCode);
      currentRoomCode = null;
      broadcastState(io, roomCode);
    });

    socket.on('play', ({ position }: { position: number }) => updatePlayback({ paused: false, position }));
    socket.on('pause', ({ position }: { position: number }) => updatePlayback({ paused: true, position }));
    socket.on('seek', ({ position }: { position: number }) => updatePlayback({ position }));

    socket.on('chat', ({ message }: { message: string }) => {
      if (!currentRoomCode || !message?.trim()) return;
      const chatMessage: ChatMessage = {
        from: socket.data.username as string,
        message: message.slice(0, 2000),
        ts: Date.now(),
      };
      io.to(currentRoomCode).emit('chat', chatMessage);
    });

    socket.on('disconnect', () => {
      if (currentRoomCode) broadcastState(io, currentRoomCode);
    });
  });

  // Anti-dérive : rebroadcast périodique de l'état complet à tous les salons actifs.
  setInterval(() => {
    for (const [roomName] of io.sockets.adapter.rooms) {
      // socket.io crée aussi une "room" privée par socket.id ; on ne veut que nos salons.
      if (io.sockets.sockets.has(roomName)) continue;
      broadcastState(io, roomName);
    }
  }, DRIFT_CORRECTION_INTERVAL_MS);

  return io;
}
