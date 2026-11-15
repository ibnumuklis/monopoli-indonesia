// Layar permainan: papan 3D + HUD. Semua tombol mengirim niat ke server; server memvalidasi & membalas state.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, navigate, setState, toast, getState } from '../lib/store';
import { emit, gameAction } from '../lib/socket';
import { refreshMe } from '../lib/api';
import { sfx } from '../lib/audio';
import { Board3D } from '../three/Board3D';
import { TILES, GROUPS, JAIL_FINE, groupTiles } from '@shared/board.js';
import { CARDS } from '@shared/cards.js';
import { SKINS } from '@shared/catalog.js';
import { Btn, Avatar, Modal, Coin, Seg, Toggle } from './common';
import { rp, rpShort, dur, modeName } from '../lib/format';

const tileOf = (i: number) => getState().board?.tiles?.[i] || TILES[i];
const groupOf = (g: string) => getState().board?.groups?.[g] || GROUPS[g];

function hasMonopoly(game: any, pid: string, group: string) { return groupTiles(group).every((i: number) => game.props[i]?.owner === pid); }

export function Game() {
  const game = useStore((s) => s.game);
  const room = useStore((s) => s.room);
  const me = useStore((s) => s.me);
  const settings = useStore((s) => s.settings);
  const holder = useRef<HTMLDivElement>(null);
  const boardRef = useRef<Board3D | null>(null);
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);
  const [card, setCard] = useState<any>(null);
  const [trade, setTrade] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'' | 'assets' | 'log' | 'chat'>('');
  const [banner, setBanner] = useState<{ text: string; k: number } | null>(null);
  const [diceShow, setDiceShow] = useState<{ v: number[]; k: number } | null>(null);
  const [emotes, setEmotes] = useState<{ id: number; userId: string; text: string }[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [, tick] = useState(0);
  const lastTurn = useRef<string | null>(null);
  const lastRollSeq = useRef(0);

  // sinkronkan state saat masuk (mis. setelah reload/reconnect)
  useEffect(() => { emit('room:sync'); }, []);

  // pasang scene 3D
  useEffect(() => {
    if (!holder.current) return;
    const b = new Board3D(holder.current, { quality: settings.graphics, me: me?.id || null, camera: settings.camera });
    b.settingsReduced = settings.reducedMotion;
    b.busyCb = setBusy;
    b.tileClickCb = (i) => setInspect(i);
    b.attachClick();
    boardRef.current = b;
    const g = getState().game; const r = getState().room;
    if (g) b.setGame(g, r);
    return () => { b.dispose(); boardRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.graphics]);

  useEffect(() => { if (boardRef.current) { boardRef.current.cameraMode = settings.camera; boardRef.current.settingsReduced = settings.reducedMotion; } }, [settings.camera, settings.reducedMotion]);

  useEffect(() => {
    if (!game || !boardRef.current) return;
    boardRef.current.setGame(game, room);
    const cur = game.players[game.turn];
    if (game.status === 'playing' && cur && lastTurn.current !== cur.id) {
      lastTurn.current = cur.id;
      if (cur.id === me?.id) { setBanner({ text: 'GILIRANMU!', k: Date.now() }); if (navigator.vibrate) navigator.vibrate(60); }
    }
    if (game.lastRoll && game.lastRoll.seq !== lastRollSeq.current) {
      const first = lastRollSeq.current === 0;
      lastRollSeq.current = game.lastRoll.seq;
      if (!first) setTimeout(() => setDiceShow({ v: game.lastRoll.dice, k: Date.now() }), 1200);
    }
  }, [game, room, me?.id]);

  // kartu & emote dari scene/socket
  useEffect(() => {
    const onCard = (e: any) => {
      const c = CARDS[e.detail.deck]?.find((x: any) => x.id === e.detail.card);
      const live = getState().board?.cards?.[e.detail.deck]?.find((x: any) => x.id === e.detail.card);
      if (c) setCard({ ...c, ...(live || {}), deck: e.detail.deck, player: e.detail.player, k: Date.now() });
    };
    const onEmote = (e: any) => {
      const sk = SKINS.find((s: any) => s.id === e.detail.emote);
      const id = Date.now() + Math.random();
      setEmotes((xs) => [...xs, { id, userId: e.detail.userId, text: sk ? `${sk.data.icon} ${sk.data.text}` : e.detail.emote }]);
      setTimeout(() => setEmotes((xs) => xs.filter((x) => x.id !== id)), 3000);
    };
    window.addEventListener('mi:card', onCard); window.addEventListener('mi:emote', onEmote);
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => { window.removeEventListener('mi:card', onCard); window.removeEventListener('mi:emote', onEmote); clearInterval(t); };
  }, []);
  useEffect(() => { if (!card) return undefined; const t = setTimeout(() => setCard(null), 4200); return () => clearTimeout(t); }, [card]);

  if (!game || !room) {
    return (
      <div className="game-root center col" style={{ background: 'transparent' }}>
        <div className="spinner" /><div className="bold">Menyambungkan ke permainan...</div>
        <Btn kind="ghost" onClick={() => navigate('lobby')}>Kembali ke Lobby</Btn>
      </div>
    );
  }

  const meP = game.players.find((p: any) => p.id === me?.id);
  const cur = game.players[game.turn];
  const myTurn = cur?.id === me?.id && game.status === 'playing';
  const iAmActor = game.pendingActors?.includes(me?.id);
  const mySeat = room.seats.find((s: any) => s.userId === me?.id);
  const deadline = room.deadline ? room.deadline - getState().serverOffset : null;
  const remain = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;
  const showBuy = myTurn && game.phase === 'buy' && !busy;
  const showAuction = game.phase === 'auction' && game.auction && meP && !meP.bankrupt && !busy;
  const myDebt = game.phase === 'debt' && game.debts?.[0]?.debtor === me?.id && !busy;
  const incomingTrade = game.trades?.find((t: any) => t.to === me?.id && t.status === 'pending');
  const finished = game.status === 'finished';
  const act = (a: any) => { sfx('click'); return gameAction(a); };

  const leave = async () => {
    await emit(finished ? 'room:dismiss' : 'room:leave');
    setState({ room: null, game: null, chat: [] });
    refreshMe();
    navigate('lobby');
  };

  return (
    <div className="game-root">
      <div className="game-canvas" ref={holder} />
      <div className="hud">
        <div className="hud-top">
          <button className="hud-btn" title="Keluar" onClick={() => (finished ? leave() : setConfirmLeave(true))}>🏠</button>
          <div className="hud-pill">🎲 Room {room.code}</div>
          <div className="hud-pill hide-sm">{modeName(room.mode)} · Ronde {game.round}</div>
          {game.endsAt && <div className="hud-pill">⌛ {dur(Math.max(0, (game.endsAt - getState().serverOffset - Date.now()) / 1000))}</div>}
          <div className="grow" />
          {mySeat && !finished && <div className="hud-pill hide-sm" title="Bot memainkan giliranmu">Auto <Toggle on={!!mySeat.auto} onChange={(v) => emit('game:auto', { on: v })} /></div>}
          <button className="hud-btn" title="Suara" onClick={() => setState((s) => ({ settings: { ...s.settings, muted: !s.settings.muted } }))}>{settings.muted ? '🔇' : '🔊'}</button>
          <button className="hud-btn hide-sm" title="Reset kamera" onClick={() => boardRef.current?.resetCamera()}>🎥</button>
          <button className="hud-btn hide-sm" title="Layar penuh" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>⛶</button>
        </div>

        <PlayerCards game={game} room={room} me={me} remain={remain} onPick={(id) => boardRef.current?.focusPlayer(id)} />

        <div className={`right-panel ${mobilePanel === 'assets' || mobilePanel === 'log' ? 'mobile-open' : ''}`}>
          {(mobilePanel !== 'log') && <AssetsPanel game={game} meId={me?.id} onInspect={(i) => { setInspect(i); boardRef.current?.focusTile(i); }} />}
          {(mobilePanel !== 'assets') && <LogPanel game={game} />}
        </div>

        <ChatBox game={game} room={room} me={me} open={mobilePanel === 'chat'} />

        <div className="mobile-tools only-mobile">
          <button className={`hud-btn ${mobilePanel === 'assets' ? 'on' : ''}`} aria-label="Aset" onClick={() => setMobilePanel(mobilePanel === 'assets' ? '' : 'assets')}>🏘️</button>
          <button className={`hud-btn ${mobilePanel === 'log' ? 'on' : ''}`} aria-label="Log" onClick={() => setMobilePanel(mobilePanel === 'log' ? '' : 'log')}>📜</button>
          <button className={`hud-btn ${mobilePanel === 'chat' ? 'on' : ''}`} aria-label="Chat" onClick={() => setMobilePanel(mobilePanel === 'chat' ? '' : 'chat')}>💬</button>
        </div>
        <div className="bottom-bar">
          {!finished && myTurn && game.phase === 'roll' && !meP?.inJail && <Btn kind="" size="xl" disabled={busy} pulse={!busy} onClick={() => act({ type: 'roll' })}>🎲 Kocok Dadu</Btn>}
          {!finished && myTurn && game.phase === 'roll' && meP?.inJail && (
            <>
              <Btn kind="gold" disabled={busy || meP.cash < JAIL_FINE} onClick={() => act({ type: 'pay_jail' })}>Bayar {rpShort(JAIL_FINE)}</Btn>
              {meP.jailCards.length > 0 && <Btn kind="purple" disabled={busy} onClick={() => act({ type: 'use_jail_card' })}>Pakai Kartu Bebas</Btn>}
              <Btn kind="" size="lg" disabled={busy} onClick={() => act({ type: 'roll' })}>🎲 Coba Dadu Kembar ({meP.jailTurns}/3)</Btn>
            </>
          )}
          {!finished && myTurn && game.phase === 'end' && <Btn kind="green" size="xl" disabled={busy} pulse={!busy} onClick={() => act({ type: 'end_turn' })}>Akhiri Giliran ➜</Btn>}
          {!finished && myTurn && (game.phase === 'roll' || game.phase === 'end') && <Btn kind="purple" disabled={busy} onClick={() => setTrade(true)}>🤝 Dagang</Btn>}
          {!finished && !myTurn && !iAmActor && cur && <div className="hud-pill">⏳ Menunggu {cur.name}{remain !== null ? ` · ${remain}d` : ''}</div>}
          {!finished && meP && !meP.bankrupt && <EmoteButton />}
          {!finished && meP && !meP.bankrupt && <MoreMenu game={game} me={me} />}
        </div>

        {emotes.map((e) => { const p = boardRef.current?.screenPos(e.userId); return p ? <div key={e.id} className="emote-bubble" style={{ left: p.x, top: p.y }}>{e.text}</div> : null; })}
        {banner && <div key={banner.k} className="turn-banner">{banner.text}</div>}
        {diceShow && <div key={diceShow.k} className="dice-result">{diceShow.v[0]} + {diceShow.v[1]} = {diceShow.v[0] + diceShow.v[1]}</div>}
      </div>

      {card && <CardPopup card={card} game={game} onClose={() => setCard(null)} />}
      {showBuy && <BuyModal game={game} me={meP} />}
      {showAuction && <AuctionModal game={game} me={meP} deadline={deadline} />}
      {myDebt && <DebtModal game={game} me={meP} onInspect={setInspect} />}
      {incomingTrade && !finished && <IncomingTrade game={game} tr={incomingTrade} />}
      {trade && <TradeModal game={game} me={meP} onClose={() => setTrade(false)} />}
      {inspect !== null && <PropertyModal i={inspect} game={game} meId={me?.id} onClose={() => setInspect(null)} />}
      {finished && !busy && <Results game={game} room={room} me={me} onLeave={leave} />}
      {confirmLeave && (
        <Modal title="Keluar Permainan?" onClose={() => setConfirmLeave(false)}>
          <p className="bold center" style={{ textAlign: 'center' }}>Jika keluar sekarang, kamu dinyatakan <span className="red-text">bangkrut</span> dan seluruh aset kembali ke bank. Kalau hanya ingin istirahat, aktifkan mode <b>Auto</b> atau tutup tab — kamu bisa kembali dan melanjutkan permainan.</p>
          <div className="row center"><Btn kind="ghost" onClick={() => setConfirmLeave(false)}>Batal</Btn><Btn kind="" onClick={leave}>Keluar & Menyerah</Btn><Btn kind="blue" onClick={() => navigate('lobby')}>Ke Lobby (tetap di game)</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ panel pemain
function PlayerCards({ game, room, me, remain, onPick }: any) {
  return (
    <div className="players">
      {game.players.map((p: any, n: number) => {
        const seat = room.seats.find((s: any) => s.userId === p.id);
        const turn = game.turn === n && game.status === 'playing';
        const props = Object.values<any>(game.props).filter((s) => s.owner === p.id).length;
        const total = (game.settings.turnSeconds || 45) * (game.phase === 'debt' ? 2 : 1);
        return (
          <div key={p.id} className={`pcard ${turn ? 'turn' : ''} ${p.bankrupt ? 'dead' : ''}`} onClick={() => onPick(p.id)}>
            <span className="stripe" style={{ background: p.color }} />
            <Avatar id={seat?.character || p.avatar} ring={p.color} />
            <span className="status-dot" style={{ background: p.isBot ? '#9fb0e0' : seat?.connected ? (seat?.auto ? '#f5a623' : '#46d17a') : '#ff5a4f' }} title={p.isBot ? 'Bot' : seat?.connected ? (seat?.auto ? 'Mode otomatis' : 'Online') : 'Terputus'} />
            <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
              <div className="name">{turn && '👑 '}{p.name}{p.id === me?.id && ' (Kamu)'}</div>
              <div className="cash">{p.bankrupt ? 'BANGKRUT' : rp(p.cash)}</div>
              <div className="tiny muted hide-mobile">{props} aset · {p.inJail ? '🔒 Penjara' : tileOf(p.pos).name}{game.mode === 'team' ? ` · Tim ${p.team}` : ''}{p.jailCards.length ? ' · 🎫' : ''}</div>
            </div>
            {turn && remain !== null && <div className="timer"><div style={{ width: `${Math.min(100, (remain / total) * 100)}%` }} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ aset & log
function AssetsPanel({ game, meId, onInspect }: any) {
  const mine = Object.entries<any>(game.props).filter(([, s]) => s.owner === meId).map(([i]) => Number(i)).sort((a, b) => a - b);
  const me = game.players.find((p: any) => p.id === meId);
  return (
    <div className="panel">
      <div className="panel-title">🏘️ Aset Saya <span className="grow" /><span className="chip gold">{rpShort(game.worth?.[meId] || 0)}</span></div>
      <div className="list" style={{ padding: '0 10px 10px', maxHeight: 220, overflowY: 'auto' }}>
        {mine.map((i) => {
          const t = tileOf(i); const s = game.props[i];
          const col = t.group ? groupOf(t.group).color : t.type === 'transport' ? '#555' : '#888';
          return (
            <div key={i} className="asset-row" onClick={() => onInspect(i)} style={{ cursor: 'pointer' }}>
              <span className="sw" style={{ background: col }} />
              <div className="col" style={{ gap: 0 }}><span>{t.name}</span><span className="tiny muted">{s.mortgaged ? '🔒 Digadaikan' : s.houses === 5 ? '🏨 Hotel' : s.houses ? `🏠 x${s.houses}` : t.type === 'property' && hasMonopoly(game, meId, t.group) ? '★ Monopoli' : ''}</span></div>
              <span className="acts">›</span>
            </div>
          );
        })}
        {!mine.length && <div className="muted small" style={{ padding: 8 }}>Belum ada properti. Mendarat di petak kosong untuk membeli!</div>}
        {me?.jailCards?.length > 0 && <div className="asset-row">🎫 Kartu Bebas Penjara x{me.jailCards.length}</div>}
      </div>
    </div>
  );
}

function LogPanel({ game }: any) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 1e9 }); }, [game.seq]);
  return (
    <div className="panel">
      <div className="panel-title">📜 Log Permainan</div>
      <div className="log" ref={ref}>{game.log.slice(-40).map((e: any) => <div key={e.seq} className={`ln ${e.type}`}>{e.text}</div>)}</div>
    </div>
  );
}

// ------------------------------------------------------------------ chat & emote
function ChatBox({ room, me, open }: any) {
  const chat = useStore((s) => s.chat);
  const [msg, setMsg] = useState('');
  const [chan, setChan] = useState<'room' | 'team'>('room');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 1e9 }); }, [chat.length]);
  const list = chat.filter((m: any) => (chan === 'team' ? m.team : !m.team));
  return (
    <div className={`chatbox panel ${open ? 'mobile-open' : ''}`}>
      <div className="row" style={{ padding: '8px 10px 0' }}>
        <span className="bold">💬 Chat</span><div className="grow" />
        {room.mode === 'team' && <Seg value={chan} options={[['room', 'Room'], ['team', 'Tim']]} onChange={setChan} />}
      </div>
      <div className="chat-msgs" ref={ref}>{list.map((m: any) => <div key={m.id} className={`m ${m.system ? 'sys' : ''}`}>{m.system ? m.text : <><b>{m.name}{m.userId === me?.id ? ' (kamu)' : ''}:</b> {m.text}</>}</div>)}</div>
      <form className="chat-input" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; const r = await emit('chat:send', { text: msg, channel: chan }); if (!r.ok) toast(r.error, 'error'); else setMsg(''); }}>
        <input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={200} placeholder="Ketik pesan..." aria-label="Pesan chat" />
        <Btn kind="blue" size="sm" type="submit">➤</Btn>
      </form>
    </div>
  );
}

function EmoteButton() {
  const me = useStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const list = (me?.emotes || []).map((id: string) => SKINS.find((s: any) => s.id === id)).filter(Boolean);
  return (
    <div style={{ position: 'relative' }}>
      <button className="hud-btn" title="Emote" onClick={() => setOpen(!open)}>😊</button>
      {open && <div className="panel emote-tray" style={{ position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)' }}>
        {list.map((e: any) => <button key={e.id} title={e.data.text} onClick={() => { emit('emote', { id: e.id }); setOpen(false); }}>{e.data.icon}</button>)}
      </div>}
    </div>
  );
}

function MoreMenu({ game, me }: any) {
  const [open, setOpen] = useState(false);
  const voted = game.endVotes?.includes(me?.id);
  return (
    <div style={{ position: 'relative' }}>
      <button className="hud-btn" title="Lainnya" onClick={() => setOpen(!open)}>⋯</button>
      {open && <div className="panel col" style={{ position: 'absolute', bottom: 52, right: 0, padding: 10, width: 230 }}>
        <Btn kind={voted ? 'ghost' : 'gold'} size="sm" onClick={() => { gameAction({ type: 'vote_end' }); setOpen(false); }}>{voted ? 'Batalkan usul selesai' : '🏁 Usul akhiri permainan'}</Btn>
        <div className="tiny muted">Jika semua pemain setuju, pemenang ditentukan dari total aset tertinggi.</div>
        <Btn kind="" size="sm" onClick={() => { if (confirm('Nyatakan bangkrut dan menyerah?')) gameAction({ type: 'bankrupt' }); setOpen(false); }}>🏳️ Menyerah</Btn>
      </div>}
    </div>
  );
}

// ------------------------------------------------------------------ modal properti
function rentRows(t: any) {
  if (t.type === 'property') return [['Sewa dasar', t.rent[0]], ['Sewa (monopoli)', t.rent[0] * 2], ['1 Rumah', t.rent[1]], ['2 Rumah', t.rent[2]], ['3 Rumah', t.rent[3]], ['4 Rumah', t.rent[4]], ['Hotel', t.rent[5]]];
  if (t.type === 'transport') return [['1 transportasi', 250_000], ['2 transportasi', 500_000], ['3 transportasi', 1_000_000], ['4 transportasi', 2_000_000]];
  if (t.type === 'utility') return [['1 utilitas', '4× dadu × Rp10rb'], ['2 utilitas', '10× dadu × Rp10rb']];
  return [];
}

export function PropertyCard({ i, game }: { i: number; game?: any }) {
  const t = tileOf(i);
  const color = t.group ? groupOf(t.group).color : t.type === 'transport' ? '#3b4252' : t.type === 'utility' ? '#0e7490' : '#1d2347';
  const s = game?.props?.[i];
  const owner = s?.owner && game.players.find((p: any) => p.id === s.owner);
  return (
    <div className="prop-card">
      <div className="band" style={{ background: color }}>{t.name.toUpperCase()}<div className="tiny" style={{ fontWeight: 800 }}>{t.region || t.landmark || ''}{t.landmark && t.region ? ` · ${t.landmark}` : ''}</div></div>
      <table><tbody>
        {t.price && <tr><td>Harga beli</td><td>{rp(t.price)}</td></tr>}
        {rentRows(t).map(([k, v]: any) => <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? rp(v) : v}</td></tr>)}
        {t.type === 'property' && <tr><td>Harga rumah / hotel</td><td>{rp(groupOf(t.group).house)}</td></tr>}
        {t.mortgage && <tr><td>Nilai gadai</td><td>{rp(t.mortgage)}</td></tr>}
        {t.type === 'tax' && <tr><td>Pajak</td><td>{rp(t.amount)}</td></tr>}
        {owner && <tr><td>Pemilik</td><td style={{ color: owner.color }}>{owner.name}{s.mortgaged ? ' (digadaikan)' : ''}</td></tr>}
      </tbody></table>
      {!t.price && t.desc && <div className="small bold" style={{ padding: 12 }}>{t.desc}</div>}
    </div>
  );
}

function PropertyModal({ i, game, meId, onClose }: any) {
  const t = tileOf(i); const s = game.props[i];
  const mine = s?.owner === meId;
  const canManage = game.status === 'playing' && ((game.players[game.turn]?.id === meId && ['roll', 'end'].includes(game.phase)) || (game.phase === 'debt' && game.debts?.[0]?.debtor === meId));
  return (
    <Modal title={t.type === 'property' || t.price ? 'Properti' : 'Petak'} onClose={onClose} light>
      <PropertyCard i={i} game={game} />
      {mine && (
        <div className="col mt">
          {!canManage && <div className="small bold center" style={{ color: '#7a3b00' }}>Kelola aset hanya pada giliranmu.</div>}
          <div className="row wrap center">
            {t.type === 'property' && <Btn kind="green" size="sm" disabled={!canManage || s.mortgaged || s.houses >= 5} onClick={() => gameAction({ type: 'build', tile: i })}>{s.houses >= 4 ? '🏨 Bangun Hotel' : '🏠 Bangun Rumah'} ({rpShort(groupOf(t.group).house)})</Btn>}
            {t.type === 'property' && s.houses > 0 && <Btn kind="gold" size="sm" disabled={!canManage} onClick={() => gameAction({ type: 'sell_building', tile: i })}>Jual Bangunan (+{rpShort(groupOf(t.group).house / 2)})</Btn>}
            {!s.mortgaged && <Btn kind="" size="sm" disabled={!canManage || s.houses > 0} onClick={() => gameAction({ type: 'mortgage', tile: i })}>Gadaikan (+{rpShort(t.mortgage)})</Btn>}
            {s.mortgaged && <Btn kind="blue" size="sm" disabled={!canManage} onClick={() => gameAction({ type: 'unmortgage', tile: i })}>Tebus (-{rpShort(Math.round(t.mortgage * 1.1))})</Btn>}
          </div>
          {t.type === 'property' && !hasMonopoly(game, meId, t.group) && <div className="tiny center" style={{ color: '#555' }}>Kuasai seluruh kota {groupOf(t.group).name} untuk membangun rumah & hotel.</div>}
        </div>
      )}
    </Modal>
  );
}

function BuyModal({ game, me }: any) {
  const i = game.pendingPurchase; const t = tileOf(i);
  const can = me.cash >= t.price;
  return (
    <div className="modal-back clear" style={{ alignItems: 'flex-end', paddingBottom: 90 }}>
      <div className="modal panel light" style={{ width: 'min(360px, 94vw)' }}>
        <div className="modal-head"><span className="ribbon">Beli Properti?</span></div>
        <div className="card-pad col">
          <PropertyCard i={i} game={game} />
          <div className="row center bold" style={{ color: can ? '#1f7a3e' : '#b3122e' }}>Kasmu: {rp(me.cash)}</div>
          <div className="row">
            <Btn kind="white" block onClick={() => gameAction({ type: 'decline' })}>{game.settings.auction ? 'Lelang' : 'Lewati'}</Btn>
            <Btn kind="green" block disabled={!can} onClick={() => gameAction({ type: 'buy' })}>Beli {rpShort(t.price)}</Btn>
          </div>
          {!can && <div className="tiny center" style={{ color: '#b3122e' }}>Kas tidak cukup — gadaikan aset atau lanjutkan ke lelang.</div>}
        </div>
      </div>
    </div>
  );
}

function AuctionModal({ game, me, deadline }: any) {
  const a = game.auction; const t = tileOf(a.tile);
  const high = a.highBidder && game.players.find((p: any) => p.id === a.highBidder);
  const passed = a.passed.includes(me.id);
  const [custom, setCustom] = useState('');
  const bid = (amt: number) => gameAction({ type: 'bid', amount: Math.round(amt / 10_000) * 10_000 });
  const left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;
  return (
    <div className="modal-back clear" style={{ alignItems: 'flex-end', paddingBottom: 90 }}>
      <div className="modal panel" style={{ width: 'min(400px, 94vw)' }}>
        <div className="modal-head"><span className="ribbon">🔨 Lelang {t.name}</span></div>
        <div className="card-pad col">
          <div className="row"><div className="grow"><div className="small muted bold">Tawaran tertinggi</div><div style={{ fontSize: 28, fontWeight: 1000 }} className="gold-text">{a.highBid ? rp(a.highBid) : '—'}</div><div className="small bold">{high ? `oleh ${high.name}` : 'Belum ada penawar'}</div></div>{left !== null && <div className="ribbon">{left}d</div>}</div>
          <div className="small muted">Harga normal {rp(t.price)} · Kasmu {rp(me.cash)}</div>
          {passed ? <div className="center bold muted">Kamu sudah mundur dari lelang.</div> : a.highBidder === me.id ? <div className="center bold green-text">Kamu memegang tawaran tertinggi!</div> : (
            <>
              <div className="row wrap center">
                {[10_000, 50_000, 100_000, 500_000].map((inc) => <Btn key={inc} kind="gold" size="sm" disabled={a.highBid + inc > me.cash} onClick={() => bid(a.highBid + inc)}>+{rpShort(inc)}</Btn>)}
              </div>
              <div className="row"><input className="input" inputMode="numeric" placeholder="Tawaran (Rp)" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} /><Btn kind="green" onClick={() => bid(Number(custom))}>Tawar</Btn></div>
              <Btn kind="ghost" onClick={() => gameAction({ type: 'pass_auction' })}>Mundur dari lelang</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DebtModal({ game, me, onInspect }: any) {
  const d = game.debts[0];
  const creditor = d.creditor ? game.players.find((p: any) => p.id === d.creditor)?.name : 'Bank';
  const mine = Object.entries<any>(game.props).filter(([, s]) => s.owner === me.id).map(([i]) => Number(i));
  return (
    <div className="modal-back clear" style={{ alignItems: 'flex-end', paddingBottom: 90 }}>
      <div className="modal panel" style={{ width: 'min(420px, 94vw)', borderColor: '#ff5a4f' }}>
        <div className="modal-head"><span className="ribbon">⚠️ Kas Tidak Cukup</span></div>
        <div className="card-pad col">
          <div className="center bold" style={{ textAlign: 'center' }}>Kamu harus membayar <span className="red-text">{rp(d.amount)}</span> kepada <b>{creditor}</b> ({d.reason}).</div>
          <div className="center">Kas saat ini: <b className={me.cash >= d.amount ? 'green-text' : 'red-text'}>{rp(me.cash)}</b></div>
          <div className="small muted center">Jual bangunan atau gadaikan properti untuk mengumpulkan uang.</div>
          <div className="list" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {mine.map((i) => { const t = tileOf(i); const s = game.props[i]; return (
              <div key={i} className="asset-row"><span className="grow">{t.name}{s.houses ? ` (${s.houses === 5 ? 'hotel' : `${s.houses} rumah`})` : ''}{s.mortgaged ? ' 🔒' : ''}</span>
                {s.houses > 0 && <Btn kind="gold" size="xs" onClick={() => gameAction({ type: 'sell_building', tile: i })}>Jual</Btn>}
                {!s.mortgaged && !s.houses && <Btn kind="" size="xs" onClick={() => gameAction({ type: 'mortgage', tile: i })}>Gadai +{rpShort(t.mortgage)}</Btn>}
                <Btn kind="ghost" size="xs" onClick={() => onInspect(i)}>i</Btn>
              </div>); })}
          </div>
          <div className="row">
            <Btn kind="ghost" block onClick={() => { if (confirm('Nyatakan bangkrut? Semua aset diserahkan ke kreditor.')) gameAction({ type: 'bankrupt' }); }}>Bangkrut</Btn>
            <Btn kind="green" block disabled={me.cash < d.amount} onClick={() => gameAction({ type: 'pay_debt' })}>Bayar {rpShort(d.amount)}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dagang
function TradeModal({ game, me, onClose }: any) {
  const others = game.players.filter((p: any) => p.id !== me.id && !p.bankrupt);
  const [to, setTo] = useState(others[0]?.id);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState('');
  const [getCash, setGetCash] = useState('');
  const tradeable = (pid: string) => Object.entries<any>(game.props).filter(([i, s]) => s.owner === pid && !((TILES[Number(i)] as any).group && groupTiles((TILES[Number(i)] as any).group).some((j: number) => game.props[j].houses > 0))).map(([i]) => Number(i));
  const toggle = (arr: number[], set: any, i: number) => set(arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i]);
  const target = game.players.find((p: any) => p.id === to);
  const send = async () => {
    const r = await gameAction({ type: 'propose_trade', to, offer: { cash: Number(giveCash) || 0, tiles: give }, request: { cash: Number(getCash) || 0, tiles: get } });
    if (r.ok) { toast('Tawaran dagang terkirim.', 'success'); onClose(); }
  };
  const List = ({ pid, sel, set }: any) => (
    <div className="list" style={{ maxHeight: 200, overflowY: 'auto' }}>
      {tradeable(pid).map((i) => { const t = tileOf(i); return (
        <label key={i} className="asset-row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={sel.includes(i)} onChange={() => toggle(sel, set, i)} /><span className="sw" style={{ background: t.group ? groupOf(t.group).color : '#666', height: 18 }} />{t.name}{game.props[i].mortgaged ? ' 🔒' : ''}</label>); })}
      {!tradeable(pid).length && <div className="tiny muted">Tidak ada aset yang bisa diperdagangkan.</div>}
    </div>
  );
  return (
    <Modal title="Tawaran Dagang" onClose={onClose} wide>
      <div className="row wrap"><b>Dagang dengan:</b><Seg value={to} options={others.map((p: any) => [p.id, p.name])} onChange={(v) => { setTo(v); setGet([]); }} /></div>
      <div className="grid c2 mt">
        <div className="col"><b>Kamu berikan</b><List pid={me.id} sel={give} set={setGive} /><input className="input" inputMode="numeric" placeholder={`Uang (maks ${rpShort(me.cash)})`} value={giveCash} onChange={(e) => setGiveCash(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="col"><b>Kamu minta dari {target?.name}</b><List pid={to} sel={get} set={setGet} /><input className="input" inputMode="numeric" placeholder={`Uang (maks ${rpShort(target?.cash || 0)})`} value={getCash} onChange={(e) => setGetCash(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      <div className="row mt center"><Btn kind="ghost" onClick={onClose}>Batal</Btn><Btn kind="purple" onClick={send}>Kirim Tawaran</Btn></div>
      <div className="tiny muted center mt">Properti dengan bangunan di kelompoknya harus dijual bangunannya dulu. Tawaran berlaku sampai giliran berakhir.</div>
    </Modal>
  );
}

function IncomingTrade({ game, tr }: any) {
  const from = game.players.find((p: any) => p.id === tr.from);
  const side = (s: any) => [...s.tiles.map((i: number) => tileOf(i).name), s.cash ? rp(s.cash) : null, s.jailCards ? `${s.jailCards} kartu bebas` : null].filter(Boolean).join(', ') || '—';
  return (
    <div className="modal-back clear" style={{ alignItems: 'flex-start', paddingTop: 80 }}>
      <div className="modal panel" style={{ width: 'min(420px, 94vw)' }}>
        <div className="modal-head"><span className="ribbon">🤝 Tawaran dari {from?.name}</span></div>
        <div className="card-pad col">
          <div className="item"><div><div className="small muted bold">Kamu menerima</div><div className="bold green-text">{side(tr.offer)}</div></div></div>
          <div className="item"><div><div className="small muted bold">Kamu memberikan</div><div className="bold red-text">{side(tr.request)}</div></div></div>
          <div className="row"><Btn kind="ghost" block onClick={() => gameAction({ type: 'respond_trade', id: tr.id, accept: false })}>Tolak</Btn><Btn kind="green" block onClick={() => gameAction({ type: 'respond_trade', id: tr.id, accept: true })}>Terima</Btn></div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ kartu
const DECK_STYLE: Record<string, { name: string; bg: string; art: string }> = {
  chance: { name: 'Kartu Kesempatan', bg: '#e23b3b', art: '❓' },
  chest: { name: 'Kartu Dana Umum', bg: '#1f6feb', art: '💰' },
  budaya: { name: 'Kartu Budaya', bg: '#7b2fbe', art: '🎭' },
};
const CARD_ART: Record<string, string> = { moveTo: '✈️', moveBy: '👣', money: '💵', jail: '🚔', jailFree: '🗝️', repairs: '🔧', collectEach: '🎉', payEach: '🤝', nearest: '🚆' };

function CardPopup({ card, game, onClose }: any) {
  const st = DECK_STYLE[card.deck];
  const who = game.players.find((p: any) => p.id === card.player);
  const art = card.effect?.kind === 'money' && card.effect.amount < 0 ? '💸' : CARD_ART[card.effect?.kind] || st.art;
  return (
    <div className="modal-back clear" onClick={onClose}>
      <div className={`game-card ${card.deck}`}>
        <div className="deck" style={{ background: st.bg }}>{st.name}</div>
        <div className="art">{art}</div>
        <div style={{ fontSize: 22, fontWeight: 1000 }}>{card.title}</div>
        <div className="bold" style={{ margin: '6px 0 10px' }}>{card.text}</div>
        <div className="tiny bold" style={{ opacity: .7 }}>Diambil oleh {who?.name}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ hasil akhir
function Results({ game, room, me, onLeave }: any) {
  const res = room.results?.[me?.id];
  const winner = game.players.find((p: any) => p.id === game.winner);
  const seatOf = (id: string) => room.seats.find((s: any) => s.userId === id);
  const top3 = game.ranking.slice(0, 3);
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const won = game.mode === 'team' ? game.players.find((p: any) => p.id === me?.id)?.team === game.winnerTeam : game.winner === me?.id;
  const reason = ({ last: 'Pemain terakhir yang bertahan', team: 'Tim lawan bangkrut', vote: 'Kesepakatan bersama · aset tertinggi', time: 'Waktu habis · aset tertinggi', rounds: 'Batas ronde · aset tertinggi', forfeit: 'Lawan meninggalkan permainan', admin: 'Diakhiri admin' } as any)[game.endReason] || '';
  return (
    <div className="modal-back">
      <div className="modal panel wide">
        <div className="modal-head"><span className="ribbon" style={{ fontSize: 24 }}>{won ? '🏆 KAMU MENANG!' : game.mode === 'team' ? `🏆 Tim ${game.winnerTeam} Menang` : '🏆 PEMENANG'}</span></div>
        <div className="card-pad col">
          <div className="center muted bold small">{reason} · Durasi {dur((game.finishedAt - game.startedAt) / 1000)} · {game.round} ronde</div>
          <div className="results-podium">
            {order.map((r: any) => (
              <div key={r.id} className="podium">
                <Avatar id={seatOf(r.id)?.character || 'bima'} size={r.place === 1 ? 'xl' : 'lg'} />
                <div className="bold">{r.name}</div>
                <div className="small gold-text bold">{rpShort(r.netWorth)}</div>
                <div className="block" style={{ height: r.place === 1 ? 90 : r.place === 2 ? 64 : 44, width: r.place === 1 ? 110 : 90, background: r.place === 1 ? 'linear-gradient(180deg,#ffd36b,#d18a00)' : r.place === 2 ? 'linear-gradient(180deg,#e6ecf5,#9aa7bd)' : 'linear-gradient(180deg,#f0b27a,#a0522d)' }}>{r.place}</div>
              </div>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>#</th><th>Pemain</th><th>Total aset</th><th>Uang</th><th>Properti</th><th>Bangunan</th><th>Sewa diterima</th></tr></thead>
              <tbody>{game.ranking.map((r: any) => (
                <tr key={r.id} className={r.id === me?.id ? 'me' : ''}><td>{r.place}</td><td>{r.name}{r.bankrupt ? ' 💀' : ''}{game.mode === 'team' ? ` (${r.team})` : ''}</td><td className="gold-text">{rp(r.netWorth)}</td><td>{rp(r.cash)}</td><td>{r.properties}</td><td>{r.buildings}</td><td>{rp(r.rentReceived)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {res && (
            <div className="panel card-pad row wrap center" style={{ background: 'rgba(0,0,0,.25)' }}>
              <b>Hadiahmu:</b>
              {res.tooShort ? <span className="muted">Permainan terlalu singkat untuk hadiah.</span> : <>
                <Coin n={res.coins} /><span className="chip gold">+{res.xp} XP</span>
                {res.rp !== 0 && <span className={`chip ${res.rp > 0 ? 'green' : 'red'}`}>{res.rp > 0 ? '+' : ''}{res.rp} Rank Point</span>}
                {res.level?.leveled > 0 && <span className="chip gold">⬆ Naik ke Level {res.level.level}!</span>}
                {res.tournamentPoints !== undefined && <span className="chip">🏆 +{res.tournamentPoints} poin turnamen</span>}
                {res.stars !== undefined && <span className="stars">{'★'.repeat(res.stars)}{'☆'.repeat(3 - res.stars)}</span>}
                {res.stageReward && <span className="chip gold">🎁 Hadiah stage terbuka!</span>}
              </>}
            </div>
          )}
          {!room.results && <div className="center muted small">Menghitung hadiah...</div>}
          <div className="row center"><Btn kind="gold" size="lg" onClick={onLeave}>Kembali ke Lobby</Btn></div>
        </div>
      </div>
    </div>
  );
}
