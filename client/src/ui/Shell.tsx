import React, { useState } from 'react';
import { useStore, navigate, setState } from '../lib/store';
import { emit } from '../lib/socket';
import { Avatar, Coin, Diamond, Ticket, Btn, Modal } from './common';
import { sfx } from '../lib/audio';

export const NAV = [
  ['lobby', '🏠', 'Lobby'], ['play', '🎲', 'Main'], ['adventure', '🗺️', 'Adventure'], ['tournament', '🏆', 'Turnamen'],
  ['missions', '📋', 'Misi'], ['events', '🎉', 'Event'], ['leaderboard', '👑', 'Peringkat'], ['collection', '🧑‍🎨', 'Koleksi'],
  ['customize', '🎨', 'Kustomisasi'], ['shop', '🛒', 'Toko'], ['inventory', '🎒', 'Inventaris'], ['friends', '👥', 'Teman'],
  ['guild', '🛡️', 'Guild'], ['inbox', '✉️', 'Inbox'], ['profile', '🙂', 'Profil'], ['settings', '⚙️', 'Pengaturan'],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const me = useStore((s) => s.me);
  const route = useStore((s) => s.route);
  const connected = useStore((s) => s.connected);
  const [more, setMore] = useState(false);
  if (!me) return null;
  const go = (r: string) => { sfx('click'); navigate(r); setMore(false); };
  const badge = (r: string) => (r === 'inbox' ? me.unreadInbox : r === 'missions' ? me.missionsReady + (me.daily?.claimedToday ? 0 : 1) : 0);
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="me" onClick={() => go('profile')} title="Profil">
          <Avatar id={me.character} />
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <div className="bold nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{me.displayName}</div>
            <div className="row gap-s"><span className="lvl">Lv. {me.level}</span><div className="progress xpbar"><div style={{ width: `${(me.xp / me.xpNext) * 100}%` }} /></div></div>
          </div>
        </div>
        <div className="wallet-pill" onClick={() => go('shop')} title="Koin"><Coin n={me.wallet.coins} /><span className="plus">+</span></div>
        <div className="wallet-pill" onClick={() => go('shop')} title="Diamond"><Diamond n={me.wallet.diamonds} /><span className="plus">+</span></div>
        <div className="wallet-pill hide-mobile" onClick={() => go('shop')} title="Tiket"><Ticket n={me.wallet.tickets} /><span className="plus">+</span></div>
        <div className="top-icons">
          {[['events', '🎁', 'Event'], ['missions', '📋', 'Misi'], ['inbox', '✉️', 'Inbox'], ['friends', '👥', 'Teman'], ['settings', '⚙️', 'Atur']].map(([r, ic, l]) => (
            <button key={r} className={`top-icon ${['friends', 'settings'].includes(r) ? 'm-hide' : ''}`} onClick={() => go(r)} aria-label={l}><span className="ic">{ic}</span><span className="lbl">{l}</span>{badge(r) > 0 && <span className="badge">{badge(r)}</span>}</button>
          ))}
          <span className="chip hide-mobile" title="Status koneksi" style={{ alignSelf: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: connected ? '#46d17a' : '#ff5a4f' }} />{connected ? 'Online' : 'Offline'}</span>
        </div>
      </header>
      <nav className="sidenav">
        {NAV.map(([r, ic, l]) => (
          <button key={r} className={`navbtn ${route === r ? 'on' : ''}`} onClick={() => go(r)}><span className="ic">{ic}</span>{l}{badge(r) > 0 && <span className="badge" style={{ top: 6, right: 8 }}>{badge(r)}</span>}</button>
        ))}
      </nav>
      <main className="main">{children}</main>
      <nav className="bottomnav">
        {([['lobby', '🏠', 'Lobby'], ['play', '🎲', 'Main'], ['missions', '📋', 'Misi'], ['shop', '🛒', 'Toko']] as const).map(([r, ic, l]) => (
          <button key={r} className={`navbtn ${route === r ? 'on' : ''}`} onClick={() => go(r)}><span className="ic">{ic}</span>{l}{badge(r) > 0 && <span className="badge">{badge(r)}</span>}</button>
        ))}
        <button className="navbtn" onClick={() => setMore(true)}><span className="ic">☰</span>Lainnya</button>
      </nav>
      {more && (
        <Modal title="Menu" onClose={() => setMore(false)}>
          <div className="grid c3">
            {NAV.map(([r, ic, l]) => <button key={r} className="item col" style={{ border: 0, color: '#fff', cursor: 'pointer', alignItems: 'center' }} onClick={() => go(r)}><span style={{ fontSize: 28 }}>{ic}</span><span className="small bold">{l}</span></button>)}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Undangan masuk & status antrean matchmaking (global). */
export function GlobalOverlays() {
  const invite = useStore((s) => s.invite);
  const queue = useStore((s) => s.queue);
  const [, force] = useState(0);
  React.useEffect(() => { if (!queue) return; const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t); }, [queue]);
  return (
    <>
      {invite && (
        <Modal title="Undangan Bermain" onClose={() => setState({ invite: null })}>
          <div className="col center" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>🎲</div>
            <div className="bold"><span className="gold-text">{invite.from}</span> mengundangmu ke room <b>"{invite.name}"</b></div>
            <div className="room-code">{invite.code}</div>
            <div className="row">
              <Btn kind="ghost" onClick={() => setState({ invite: null })}>Nanti</Btn>
              <Btn kind="green" onClick={async () => {
                const r = await emit('room:join', { code: invite.code });
                setState({ invite: null });
                if (r.ok) { setState({ chat: [] }); navigate('room'); } else { const { toast } = await import('../lib/store'); toast(r.error, 'error'); }
              }}>Gabung</Btn>
            </div>
          </div>
        </Modal>
      )}
      {queue?.queued && (
        <div className="queue-pill">
          <div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} />
          <span>Mencari lawan {queue.mode === 'tournament' ? 'turnamen' : ''}... {Math.round((Date.now() - (queue.since || Date.now())) / 1000)}d</span>
          <Btn kind="ghost" size="sm" onClick={() => emit('mm:leave')}>Batal</Btn>
        </div>
      )}
    </>
  );
}
