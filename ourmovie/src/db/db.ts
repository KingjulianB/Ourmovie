import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// En prod (Dockerfile), OURMOVIE_DB_PATH=/data/ourmovie.db (stockage persistant de l'add-on).
// En dev local, on retombe sur ./data/ourmovie.db.
const DB_PATH = process.env.OURMOVIE_DB_PATH ?? join(process.cwd(), 'data', 'ourmovie.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
