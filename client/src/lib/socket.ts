// Koneksi real-time Socket.IO. Semua keputusan permainan dikirim sebagai "niat" ke server;
// state hasil validasi server diterima kembali lewat event room:state.
import { io, Socket } from 'socket.io-client';
import { getState, setState, toast, navigate } from './store';
import { refreshMe, SERVER_URL } from './api';
import { sfx } from './audio';

let socket: Socket | null = null;
let cidSeq = 0;

export function getSocket() { return socket; }

export function connectSocket() {
  const { token } = getState();
  if (!token) return;
  if (socket) { if (socket.connected) return; socket.disconnect(); }
  setState({ connecting: true });
  socket = io(SERVER_URL || undefined, { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 4000 });

  socket.on('connect', async () => {
    setState({ connected: true, connecting: false });
    const r = await emit('room:sync');
    if (r.ok && r.code && !['game', 'room'].includes(getState().route)) {
      // kembali otomatis ke permainan yang sedang berjalan (reconnect)
      navigate('game');
    }
  });
  socket.on('disconnect', () => setState({ connected: false }));
  socket.on('connect_error', (e) => {
    setState({ connected: false, connecting: false });
    if (e.message === 'unauthorized' || e.message === 'banned') {
      socket?.disconnect();
      setState({ token: null, me: null });
      navigate('login');
      toast(e.message === 'banned' ? 'Akun Anda diblokir.' : 'Sesi berakhir. Silakan masuk kembali.', 'error');
    }
  });

  socket.on('room:state', (p) => {
    const prev = getState().game;
    setState({ room: p.room, game: p.game, serverOffset: p.serverTime - Date.now() });
    if (p.game && prev && p.game.status === 'finished' && prev.status !== 'finished') {
      sfx(p.game.winner === getState().me?.id || (p.game.winnerTeam && p.game.players.find((x: any) => x.id === getState().me?.id)?.team === p.game.winnerTeam) ? 'victory' : 'lose');
    }
  });
  socket.on('chat:message', (m) => {
    setState((s) => ({ chat: [...s.chat.slice(-80), m] }));
    if (!m.system && m.userId !== getState().me?.id) sfx('chat');
  });
  socket.on('room:emote', (e) => { window.dispatchEvent(new CustomEvent('mi:emote', { detail: e })); });
  socket.on('room:closed', (e) => {
    setState({ room: null, game: null, chat: [] });
    if (['room', 'game'].includes(getState().route)) { navigate('lobby'); toast(e.reason || 'Room ditutup.'); }
  });
  socket.on('room:kicked', () => { setState({ room: null, game: null, chat: [] }); navigate('lobby'); toast('Anda dikeluarkan dari room oleh host.', 'error'); });
  socket.on('room:invited', (inv) => { setState({ invite: inv }); sfx('notify'); });
  socket.on('mm:status', (s) => setState({ queue: s.queued ? { queued: true, mode: s.mode, since: Date.now() } : null }));
  socket.on('mm:matched', () => { setState({ queue: null, chat: [] }); sfx('notify'); navigate('room'); });
  socket.on('profile:changed', () => refreshMe());
  socket.on('social:changed', () => { refreshMe(); window.dispatchEvent(new Event('mi:social')); });
  socket.on('dm:message', (m) => { window.dispatchEvent(new CustomEvent('mi:dm', { detail: m })); sfx('chat'); toast(`💬 ${m.sender_name}: ${m.body}`); });
  socket.on('guild:message', (m) => window.dispatchEvent(new CustomEvent('mi:guild', { detail: m })));
  socket.on('account:banned', () => { toast('Akun Anda diblokir oleh admin.', 'error'); logoutLocal(); });
}

export function emit(ev: string, payload: any = {}): Promise<any> {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) return resolve({ ok: false, error: 'Tidak terhubung ke server. Menyambungkan ulang...' });
    const t = setTimeout(() => resolve({ ok: false, error: 'Server tidak merespons.' }), 8000);
    socket.emit(ev, payload, (r: any) => { clearTimeout(t); resolve(r || { ok: false }); });
  });
}

/** Kirim aksi permainan dengan id unik (idempoten bila dikirim ulang). */
export async function gameAction(action: any, { silent = false } = {}) {
  const cid = `${Date.now().toString(36)}-${++cidSeq}`;
  const r = await emit('game:action', { action, cid });
  if (!r.ok && !silent) { toast(r.error, 'error'); sfx('error'); }
  return r;
}

export function disconnectSocket() { socket?.disconnect(); socket = null; setState({ connected: false }); }

export function logoutLocal() {
  disconnectSocket();
  setState({ token: null, me: null, room: null, game: null, chat: [] });
  navigate('login');
}
