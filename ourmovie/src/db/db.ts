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

// Migration légère : la colonne `queue` a été ajoutée après coup (playlist). Pour une
// base déjà existante créée avant ce changement, CREATE TABLE IF NOT EXISTS ne
// l'ajoute pas tout seul — on la rajoute ici si absente. Pas de système de migration
// formel pour l'instant vu la taille du projet ; ce garde-fou suffit.
try {
  db.exec(`ALTER TABLE rooms ADD COLUMN queue TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // déjà présente (installation neuve, ou migration déjà appliquée) — rien à faire
}
