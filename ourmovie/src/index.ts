import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { authRoutes } from './http/auth.js';
import { roomRoutes } from './http/rooms.js';
import { attachSocketServer } from './ws/socket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8099);

// Défense en profondeur : ne jamais logger la query string (un incident réel a
// montré qu'un mot de passe pouvait s'y retrouver en clair via une soumission de
// formulaire GET côté navigateur — cf. OURMOVIE-FIX-LOG.md).
const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url.split('?')[0],
          hostname: request.hostname,
        };
      },
    },
  },
});

await app.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/',
});

await app.register(authRoutes);
await app.register(roomRoutes);

app.get('/api/health', async () => ({ ok: true }));

await app.listen({ port: PORT, host: '0.0.0.0' });

attachSocketServer(app.server);

app.log.info(`Ourmovie backend listening on :${PORT}`);
