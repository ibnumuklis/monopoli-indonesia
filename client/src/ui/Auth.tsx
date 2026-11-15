import React, { useEffect, useState } from 'react';
import { post, get, refreshMe } from '../lib/api';
import { setState, navigate, toast, getState } from '../lib/store';
import { connectSocket } from '../lib/socket';
import { unlockAudio, startMusic } from '../lib/audio';
import { Btn } from './common';
import { portrait } from '../three/characters';

export function Logo({ size = 1 }: { size?: number }) {
  return (
    <div style={{ textAlign: 'center', transform: `scale(${size})` }}>
      <div className="logo-title">MONOPOLI</div>
      <div className="logo-sub">INDONESIA</div>
      <div className="tagline">Jelajahi Nusantara, Bangun Kerajaan Bisnismu!</div>
    </div>
  );
}

/** Splash: memuat aset & memverifikasi sesi. */
export function Splash() {
  const [p, setP] = useState(0);
  const [chars, setChars] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      setP(15);
      const board = await get('/board').catch(() => null);
      if (board) setState({ board });
      setP(45);
      // pra-render potret karakter (aset 3D prosedural)
      const ids = ['bima', 'sekar', 'siti', 'daeng'];
      const imgs: string[] = [];
      for (const id of ids) { imgs.push(portrait(id)); if (alive) setChars([...imgs]); setP((x) => x + 8); await new Promise((r) => setTimeout(r, 30)); }
      const me = getState().token ? await refreshMe() : null;
      setP(100);
      await new Promise((r) => setTimeout(r, 450));
      if (!alive) return;
      if (me) { connectSocket(); navigate(location.hash === '#game' ? 'game' : 'lobby'); } else navigate('login');
    })();
    return () => { alive = false; };
  }, []);
  return (
    <div className="splash">
      <Logo />
      <div className="row" style={{ gap: 0, height: 150 }}>{chars.map((c, i) => <img key={i} src={c} alt="" style={{ height: 150, marginLeft: i ? -30 : 0 }} />)}</div>
      <div style={{ width: 'min(420px, 80vw)' }}>
        <div className="progress"><div style={{ width: `${p}%` }} /></div>
        <div className="center muted bold small mt">Memuat Nusantara... {p}%</div>
      </div>
    </div>
  );
}

export function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setU] = useState('');
  const [password, setPw] = useState('');
  const [displayName, setDn] = useState('');
  const [guestName, setGuest] = useState('');
  const [busy, setBusy] = useState(false);
  const [sb, setSb] = useState<any>(null);

  useEffect(() => {
    get('/config').then((c) => setSb(c.supabase)).catch(() => {});
    // kembali dari OAuth Supabase: access_token di hash URL
    const h = new URLSearchParams(location.hash.slice(1));
    const at = h.get('access_token');
    if (at) { history.replaceState(null, '', '/'); finish(post('/auth/supabase', { accessToken: at })); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(p: Promise<any>) {
    unlockAudio();
    setBusy(true);
    try {
      const { token } = await p;
      setState({ token });
      const me = await refreshMe();
      connectSocket();
      startMusic();
      toast(`Selamat datang, ${me?.displayName || 'Juragan'}!`, 'success');
      navigate('lobby');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    finish(post(mode === 'login' ? '/auth/login' : '/auth/register', mode === 'login' ? { username, password } : { username, password, displayName: displayName || username }));
  };

  const google = () => {
    if (!sb) return toast('Login Google memerlukan konfigurasi Supabase di server.', 'error');
    location.href = `${sb.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + '/')}`;
  };

  return (
    <div className="splash" style={{ overflowY: 'auto', justifyContent: 'flex-start', paddingTop: '6vh' }}>
      <Logo size={0.9} />
      <form className="panel login-box col" onSubmit={submit}>
        <div className="center"><span className="ribbon">{mode === 'login' ? 'Masuk ke Akunmu' : 'Buat Akun Baru'}</span></div>
        <Btn kind="white" block onClick={google} disabled={busy}><span style={{ fontWeight: 1000, color: '#4285f4' }}>G</span> Masuk dengan Google</Btn>
        <div className="divider">atau</div>
        <label className="field">Username<input className="input" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} placeholder="contoh: kak_ibnu" maxLength={20} required /></label>
        {mode === 'register' && <label className="field">Nama tampilan<input className="input" value={displayName} onChange={(e) => setDn(e.target.value)} placeholder="Kak Ibnu" maxLength={20} /></label>}
        <label className="field">Password<input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPw(e.target.value)} placeholder="minimal 8 karakter" required /></label>
        <Btn kind="gold" size="lg" block type="submit" disabled={busy}>{busy ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar & Main'}</Btn>
        <button type="button" className="tab" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}</button>
        <div className="divider">main cepat tanpa daftar</div>
        <div className="row">
          <input className="input" value={guestName} onChange={(e) => setGuest(e.target.value)} placeholder="Nama tamu" maxLength={16} />
          <Btn kind="blue" disabled={busy} onClick={() => finish(post('/auth/guest', { name: guestName || 'Tamu' }))}>Main</Btn>
        </div>
        <div className="tiny muted center">Akun tamu dapat diubah menjadi akun permanen kapan saja di Pengaturan.</div>
      </form>
    </div>
  );
}
