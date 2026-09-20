import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../db/db.js';
import { getUserFromToken } from './auth.js';

// Alphabet sans caractères ambigus (0/O, 1/I/l) — code affiché/tapé par l'invité.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  return getUserFromToken(token);
}

export async function roomRoutes(app: FastifyInstance) {
  app.post('/api/rooms', async (request, reply) => {
    const user = authenticate(request);
    if (!user) return reply.status(401).send({ error: 'non authentifié' });

    const body = (request.body ?? {}) as { videoUrl?: string };

    let code = generateRoomCode();
    while (db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)) {
      code = generateRoomCode();
    }

    const result = db
      .prepare('INSERT INTO rooms (code, owner_id, video_url) VALUES (?, ?, ?)')
      .run(code, user.id, body.videoUrl ?? null);
    const roomId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, user.id);

    return reply.status(201).send({ code });
  });

  app.get('/api/rooms/:code', async (request, reply) => {
    const user = authenticate(request);
    if (!user) return reply.status(401).send({ error: 'non authentifié' });

    const { code } = request.params as { code: string };
    const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as { id: number } | undefined;
    if (!room) return reply.status(404).send({ error: 'salon introuvable' });

    db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)').run(room.id, user.id);

    return reply.send(room);
  });
}
