// Adapter database: PostgreSQL (DATABASE_URL, mis. Supabase) atau PGlite (Postgres WASM lokal) bila tidak dikonfigurasi.
import fs from 'node:fs';
import { config } from '../config.js';

let impl = null;

export async function initDb() {
  if (impl) return impl;
  if (config.databaseUrl) {
    const pg = (await import('pg')).default;
    const ssl = /supabase\.co|sslmode=require/.test(config.databaseUrl) ? { rejectUnauthorized: false } : undefined;
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: Number(process.env.DB_POOL || 10), ssl });
    pool.on('error', (e) => console.error('[db] pool error', e.message));
    impl = {
      kind: 'postgres',
      query: (text, params) => pool.query(text, params),
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn({ query: (t, p) => c.query(t, p) });
          await c.query('COMMIT');
          return r;
        } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
      },
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    fs.mkdirSync(config.pgliteDir, { recursive: true });
    const db = new PGlite(config.pgliteDir, { extensions: { pgcrypto } });
    await db.waitReady;
    let chain = Promise.resolve();
    // PGlite adalah satu koneksi: transaksi diserialisasi agar tidak saling tumpang tindih.
    const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
    impl = {
      kind: 'pglite',
      query: (text, params) => serial(() => db.query(text, params)),
      tx: (fn) => serial(() => db.transaction((t) => fn({ query: (q, p) => t.query(q, p) }))),
      exec: (sql) => serial(() => db.exec(sql)),
      close: () => db.close(),
    };
  }
  return impl;
}

/** Tutup koneksi database (dipakai saat shutdown & di akhir test). */
export async function closeDb() {
  if (!impl) return;
  const i = impl; impl = null;
  await i.close();
}

export function db() {
  if (!impl) throw new Error('Database belum diinisialisasi.');
  return impl;
}

export const q = (text, params) => db().query(text, params);
export const one = async (text, params) => (await db().query(text, params)).rows[0] || null;
export const many = async (text, params) => (await db().query(text, params)).rows;
export const tx = (fn) => db().tx(fn);
