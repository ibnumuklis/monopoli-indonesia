import React from 'react';
import { useStore, navigate, setState, toast } from '../lib/store';
import { get, post, refreshMe, act } from '../lib/api';
import { emit } from '../lib/socket';
import { Btn, Avatar, Coin, useAsync, RewardLine } from './common';
import { portrait } from '../three/characters';
import { timeLeft } from '../lib/format';
import { sfx } from '../lib/audio';

export async function quickPlay(mode: 'classic' | 'tournament' = 'classic', tournamentId?: string) {
  const r = await emit('mm:join', { mode, tournamentId });
  if (!r.ok) toast(r.error, 'error');
}

export async function startPractice(bots = 3, level = 'normal') {
  const r = await emit('practice:start', { bots, level });
  if (!r.ok) return toast(r.error, 'error');
  setState({ chat: [] });
  navigate('game');
}

export function Lobby() {
  const me = useStore((s) => s.me);
  const status = useAsync(() => get('/status'), []);
  const events = useAsync(() => get('/events'), []);
  const missions = useAsync(() => get('/missions'), [me?.missionsReady]);
  const lb = useAsync(() => get('/leaderboard?period=weekly'), []);
  if (!me) return null;
  const daily = (missions.data?.missions || []).filter((m: any) => m.kind === 'daily').slice(0, 4);

  const claimDaily = async () => {
    const r = await act(() => post('/daily/claim'));
    if (r) { sfx('buy'); toast(`Hadiah login hari ke-${r.streak}: +${r.coins} koin${r.diamonds ? ` +${r.diamonds} diamond` : ''}!`, 'reward', 4500); refreshMe(); }
  };

  return (
    <div className="page">
      {status.data?.maintenance?.enabled && <div className="panel card-pad" style={{ borderColor: '#ff5a4f' }}>🛠️ <b>Pemeliharaan server:</b> {status.data.maintenance.message || 'Beberapa fitur sementara tidak tersedia.'}</div>}
      {me.activeRoom && (
        <div className="panel card-pad row" style={{ borderColor: '#46d17a' }}>
          <span style={{ fontSize: 26 }}>🎲</span><div className="grow bold">Kamu masih memiliki permainan yang berjalan (room {me.activeRoom}).</div>
          <Btn kind="green" onClick={() => navigate('game')}>Lanjutkan</Btn>
        </div>
      )}
      <div className="hero">
        <div className="logo"><div className="logo-title">MONOPOLI</div><div className="logo-sub">INDONESIA</div><div className="tagline">Jelajahi Nusantara, Bangun Kerajaan Bisnismu!</div></div>
        <img className="hero-char" src={portrait(me.character)} alt="" />
        <div className="row wrap" style={{ position: 'relative', zIndex: 1 }}>
          <Btn kind="gold" size="xl" onClick={() => quickPlay()}>▶ Main Sekarang</Btn>
          <Btn kind="ghost" size="lg" onClick={() => navigate('play')}>Buat / Gabung Room</Btn>
        </div>
      </div>

      <div className="grid c4">
        <div className="mode-card mc-red" onClick={() => { sfx('click'); quickPlay(); }}><span className="big">🎲</span><h3>Klasik</h3><p>Monopoli standar 2–4 pemain · Quick Play</p></div>
        <div className="mode-card mc-blue" onClick={() => { sfx('click'); navigate('play', { mode: 'team' }); }}><span className="big">🤝</span><h3>Team Battle</h3><p>2 tim × 2 pemain, saling bebas sewa</p></div>
        <div className="mode-card mc-purple" onClick={() => { sfx('click'); navigate('adventure'); }}><span className="big">🗺️</span><h3>Adventure Nusantara</h3><p>Misi tiap pulau & hadiah eksklusif</p></div>
        <div className="mode-card mc-gold" onClick={() => { sfx('click'); navigate('tournament'); }}><span className="big">🏆</span><h3>Turnamen</h3><p>Ranking & hadiah virtual</p></div>
      </div>

      <div className="grid c3">
        <div className="panel card-pad col">
          <div className="row"><span className="ribbon">Hadiah Harian</span><div className="grow" /><span className="chip gold">Streak {me.daily.streak}/7</span></div>
          <div className="row wrap gap-s">{[100, 150, 200, 250, 300, 400, 1000].map((c, i) => (
            <div key={i} className="col center" style={{ gap: 2, padding: 6, borderRadius: 10, background: i < me.daily.streak ? 'rgba(70,209,122,.25)' : 'rgba(255,255,255,.08)', minWidth: 46 }}>
              <span className="tiny muted">H{i + 1}</span><Coin /><span className="tiny bold">{c}</span>
            </div>))}
          </div>
          <Btn kind={me.daily.claimedToday ? 'ghost' : 'green'} disabled={me.daily.claimedToday} onClick={claimDaily} pulse={!me.daily.claimedToday}>{me.daily.claimedToday ? 'Sudah diklaim hari ini ✓' : 'Klaim Hadiah'}</Btn>
        </div>
        <div className="panel card-pad col">
          <div className="row"><span className="ribbon">Misi Harian</span><div className="grow" /><Btn kind="ghost" size="xs" onClick={() => navigate('missions')}>Semua</Btn></div>
          {daily.map((m: any) => (
            <div key={m.id} className="col" style={{ gap: 4 }}>
              <div className="row small bold"><span className="grow">{m.title}</span><span className="muted">{m.progress}/{m.target}</span>{m.claimed_at ? '✅' : <RewardLine r={{ reward_coins: m.reward_coins }} />}</div>
              <div className="progress green"><div style={{ width: `${(m.progress / m.target) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="panel card-pad col">
          <div className="row"><span className="ribbon">Peringkat Mingguan</span><div className="grow" /><Btn kind="ghost" size="xs" onClick={() => navigate('leaderboard')}>Lihat</Btn></div>
          {(lb.data?.rows || []).slice(0, 4).map((r: any, i: number) => (
            <div key={r.user_id} className="row small"><b style={{ width: 20 }}>{i + 1}</b><Avatar id={r.selected_character} /><span className="grow bold">{r.display_name}</span><span className="gold-text bold">{r.points} poin</span></div>
          ))}
          {lb.data && !lb.data.rows.length && <div className="muted small">Belum ada pertandingan minggu ini. Jadilah yang pertama!</div>}
        </div>
      </div>

      <div className="grid c2">
        {(events.data || []).map((e: any) => (
          <div key={e.id} className="event-banner" style={{ background: `linear-gradient(120deg, ${e.color}, #2a1a5e)` }} onClick={() => navigate('events')}>
            <h3>🎉 {e.name}</h3><div className="small bold" style={{ opacity: .9 }}>{e.description}</div><div className="chip mt">⏳ Berakhir {timeLeft(e.ends_at)}</div>
          </div>
        ))}
        <div className="event-banner" style={{ background: 'linear-gradient(120deg, #22a356, #0f1d4a)' }} onClick={() => startPractice(3, 'easy')}>
          <h3>🤖 Latihan Melawan Bot</h3><div className="small bold">Pelajari aturan tanpa tekanan. Cocok untuk pemain baru!</div><div className="chip mt">Practice Mode</div>
        </div>
      </div>
      {status.data?.motd?.text && <div className="muted small center">📢 {status.data.motd.text}</div>}
    </div>
  );
}
