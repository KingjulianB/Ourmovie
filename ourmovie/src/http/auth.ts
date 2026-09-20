import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db/db.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
}

interface SessionRow {
  id: number;
  username: string;
  expires_at: string;
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

export function getUserFromToken(token: string | undefined | null): { id: number; username: string } | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.id as id, users.username as username, sessions.expires_at as expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .get(token) as SessionRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.id, username: row.username };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password || body.password.length < 8) {
      return reply.status(400).send({ error: "nom d'utilisateur et mot de passe (8+ caractères) requis" });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(body.username);
    if (existing) {
      return reply.status(409).send({ error: "nom d'utilisateur déjà pris" });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(body.username, passwordHash);
    const userId = Number(result.lastInsertRowid);
    const token = createSession(userId);
    return reply.status(201).send({ token, username: body.username });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password) {
      return reply.status(400).send({ error: "nom d'utilisateur et mot de passe requis" });
    }
    const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(body.username) as
      | UserRow
      | undefined;
    if (!row || !(await bcrypt.compare(body.password, row.password_hash))) {
      return reply.status(401).send({ error: 'identifiants invalides' });
    }
    const token = createSession(row.id);
    return reply.send({ token, username: row.username });
  });
}
