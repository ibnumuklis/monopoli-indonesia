// Helper uji integrasi: server sungguhan + PostgreSQL + klien Socket.IO.
import { io as ioc } from 'socket.io-client';
import pg from 'pg';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://monopoli:monopoli@localhost/monopoli_test';

export async function resetDb() {
  const c = new pg.Client({ connectionString: TEST_DB });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
}

export function setTestEnv(extra = {}) {
  Object.assign(process.env, {
    DATABASE_URL: TEST_DB, NODE_ENV: 'test', BOT_DELAY_MS: '5', DISCONNECT_GRACE_SEC: '2', MATCHMAKING_WAIT_SEC: '1', AUTH_BURST: '500', ACTION_RATE: '1000', API_RATE: '10000',
    ADMIN_USERNAME: 'superadmin', ADMIN_PASSWORD: 'rahasia-super-123', ...extra,
  });
}

export function api(base, token) {
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
}

export async function register(base, username, password = 'password123') {
  const r = await api(base)('POST', '/api/auth/register', { username, password });
  if (r.status !== 200) throw new Error(`register ${username}: ${r.data.error}`);
  return r.data.token;
}

export function connect(base, token) {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    s.state = null;
    s.on('room:state', (p) => { s.state = p; });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}

export const emit = (s, ev, payload = {}) => new Promise((res) => s.emit(ev, payload, res));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, ms = 10_000, label = 'kondisi') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(15);
  }
  throw new Error(`timeout menunggu ${label}`);
}
