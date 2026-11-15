// Jalankan migration SQL secara berurutan & idempoten, lalu seed data katalog.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, db } from './index.js';
import { seed } from './seed.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export async function migrate({ log = console.log } = {}) {
  await initDb();
  await db().exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  await db().exec(`ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY`);
  const done = new Set((await db().query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    log(`[migrate] ${f}`);
    await db().exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    await db().query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
  }
  await seed();
  log('[migrate] selesai');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => db().close()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
