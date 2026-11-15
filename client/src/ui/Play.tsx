import React, { useEffect, useState } from 'react';
import { useStore, navigate, setState, toast, getState } from '../lib/store';
import { emit } from '../lib/socket';
import { get } from '../lib/api';
import { Btn, Avatar, Seg, Toggle, PageHead, Modal, useAsync } from './common';
import { quickPlay, startPractice } from './Lobby';
import { modeName, rp } from '../lib/format';

export function PlayMenu() {
  const params = useStore((s) => s.routeParams);
  const [tab, setTab] = useState<'quick' | 'create' | 'join' | 'practice'>(params.mode === 'team' ? 'create' : 'quick');
  const [form, setForm] = useState({ name: '', mode: params.mode === 'team' ? 'team' : 'classic', isPrivate: true, maxPlayers: 4, turnSeconds: 45, timeLimitMin: 0, startCash: 15_000_000, auction: true });
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<any[]>([]);
  const [prac, setPrac] = useState({ bots: 3, level: 'normal' });
  const me = useStore((s) => s.me);

  const loadRooms = async () => { const r = await emit('room:list'); if (r.ok) setRooms(r.rooms); };
  useEffect(() => { if (tab === 'join') { loadRooms(); const t = setInterval(loadRooms, 4000); return () => clearInterval(t); } return undefined; }, [tab]);

  const create = async () => {
    const r = await emit('room:create', { ...form, name: form.name || `Room ${me?.displayName}` });
    if (!r.ok) return toast(r.error, 'error');
    setState({ chat: [] }); navigate('room');
  };
  const join = async (c: string) => {
    const r = await emit('room:join', { code: c.trim() });
    if (!r.ok) return toast(r.error, 'error');
    setState({ chat: [] }); navigate('room');
  };
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="page">
      <PageHead icon="🎲" title="Main" />
      <div className="tabs">
        {[['quick', '⚡ Quick Play'], ['create', '➕ Buat Room'], ['join', '🔑 Gabung Room'], ['practice', '🤖 Latihan']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k as any)}>{l}</button>)}
      </div>
      {tab === 'quick' && (
        <div className="panel card-pad col center" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 60 }}>⚡</div>
          <h2 style={{ margin: 0 }}>Quick Play — Mode Klasik</h2>
          <p className="muted bold" style={{ maxWidth: 520 }}>Sistem matchmaking otomatis mempertemukanmu dengan 1–3 pemain lain. Jika tidak ada lawan dalam beberapa detik, bot cerdas akan melengkapi meja agar kamu tetap bisa bermain.</p>
          <Btn kind="gold" size="xl" onClick={() => quickPlay()}>Cari Pertandingan</Btn>
          <div className="small muted">Hasil pertandingan Quick Play memengaruhi Rank Point.</div>
        </div>
      )}
      {tab === 'create' && (
        <div className="panel card-pad col" style={{ maxWidth: 640 }}>
          <label className="field">Nama room<input className="input" value={form.name} maxLength={30} onChange={(e) => set('name', e.target.value)} placeholder={`Room ${me?.displayName}`} /></label>
          <div className="row wrap"><span className="bold" style={{ width: 150 }}>Mode</span><Seg value={form.mode} options={[['classic', 'Klasik'], ['team', 'Team Battle 2v2']]} onChange={(v) => set('mode', v)} /></div>
          {form.mode === 'classic' && <div className="row wrap"><span className="bold" style={{ width: 150 }}>Jumlah pemain</span><Seg value={form.maxPlayers} options={[[2, '2'], [3, '3'], [4, '4']]} onChange={(v) => set('maxPlayers', v)} /></div>}
          <div className="row wrap"><span className="bold" style={{ width: 150 }}>Durasi giliran</span><Seg value={form.turnSeconds} options={[[30, '30 dtk'], [45, '45 dtk'], [60, '60 dtk'], [90, '90 dtk']]} onChange={(v) => set('turnSeconds', v)} /></div>
          <div className="row wrap"><span className="bold" style={{ width: 150 }}>Batas waktu</span><Seg value={form.timeLimitMin} options={[[0, 'Tanpa'], [30, '30 mnt'], [45, '45 mnt'], [60, '60 mnt']]} onChange={(v) => set('timeLimitMin', v)} /></div>
          <div className="row wrap"><span className="bold" style={{ width: 150 }}>Modal awal</span><Seg value={form.startCash} options={[[10_000_000, 'Rp10jt'], [15_000_000, 'Rp15jt'], [20_000_000, 'Rp20jt']]} onChange={(v) => set('startCash', v)} /></div>
          <div className="row"><span className="bold" style={{ width: 150 }}>Lelang properti</span><Toggle on={form.auction} onChange={(v) => set('auction', v)} /><span className="small muted">Properti yang tidak dibeli akan dilelang</span></div>
          <div className="row"><span className="bold" style={{ width: 150 }}>Room privat</span><Toggle on={form.isPrivate} onChange={(v) => set('isPrivate', v)} /><span className="small muted">{form.isPrivate ? 'Hanya bisa masuk dengan kode' : 'Tampil di daftar room publik'}</span></div>
          <Btn kind="gold" size="lg" onClick={create}>Buat Room</Btn>
        </div>
      )}
      {tab === 'join' && (
        <div className="grid c2">
          <div className="panel card-pad col">
            <div className="bold">Masukkan kode room (6 digit)</div>
            <input className="input" inputMode="numeric" style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
            <Btn kind="green" size="lg" disabled={code.length !== 6} onClick={() => join(code)}>Gabung</Btn>
          </div>
          <div className="panel card-pad col">
            <div className="row"><b>Room publik</b><div className="grow" /><Btn kind="ghost" size="xs" onClick={loadRooms}>↻</Btn></div>
            <div className="list">
              {rooms.map((r) => (
                <div key={r.code} className="item"><div className="grow"><div className="bold">{r.name}</div><div className="small muted">{modeName(r.mode)} · Host {r.host} · {r.players}/{r.maxPlayers}</div></div><Btn kind="green" size="sm" onClick={() => join(r.code)}>Masuk</Btn></div>
              ))}
              {!rooms.length && <div className="empty">Belum ada room publik. Buat room sendiri atau gunakan Quick Play!</div>}
            </div>
          </div>
        </div>
      )}
      {tab === 'practice' && (
        <div className="panel card-pad col" style={{ maxWidth: 560 }}>
          <div className="bold">Bermain melawan bot AI — tanpa memengaruhi Rank Point.</div>
          <div className="row wrap"><span className="bold" style={{ width: 120 }}>Jumlah bot</span><Seg value={prac.bots} options={[[1, '1'], [2, '2'], [3, '3']]} onChange={(v) => setPrac((p) => ({ ...p, bots: v }))} /></div>
          <div className="row wrap"><span className="bold" style={{ width: 120 }}>Tingkat</span><Seg value={prac.level} options={[['easy', 'Mudah'], ['normal', 'Normal'], ['hard', 'Sulit']]} onChange={(v) => setPrac((p) => ({ ...p, level: v }))} /></div>
          <Btn kind="green" size="lg" onClick={() => startPractice(prac.bots, prac.level)}>Mulai Latihan</Btn>
        </div>
      )}
    </div>
  );
}

export function RoomLobby() {
  const room = useStore((s) => s.room);
  const game = useStore((s) => s.game);
  const me = useStore((s) => s.me);
  const chat = useStore((s) => s.chat);
  const [inviteOpen, setInvite] = useState(false);
  const [msg, setMsg] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { emit('room:sync'); const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, []);
  useEffect(() => { if (room && (room.status === 'playing' || room.status === 'finished') && game) navigate('game'); }, [room?.status, game]);
  if (!room) return <div className="page"><div className="empty">Menghubungkan ke room... <div className="mt"><Btn kind="ghost" onClick={() => navigate('play')}>Kembali</Btn></div></div></div>;
  const isHost = room.hostId === me?.id;
  const mySeat = room.seats.find((s: any) => s.userId === me?.id);
  const call = async (ev: string, p: any = {}) => { const r = await emit(ev, p); if (!r.ok) toast(r.error, 'error'); return r; };
  const leave = async () => { await emit('room:leave'); setState({ room: null, game: null, chat: [] }); navigate('play'); };
  const seats = [...room.seats, ...Array(Math.max(0, room.maxPlayers - room.seats.length)).fill(null)];
  const countdown = room.countdownAt ? Math.max(0, Math.ceil((room.countdownAt - Date.now() - getState().serverOffset) / 1000)) : null;

  return (
    <div className="page">
      <PageHead icon="🏠" title={room.name}>
        <span className="chip gold">{modeName(room.mode)}</span>
        <span className="chip">{room.isPrivate ? '🔒 Privat' : '🌐 Publik'}</span>
        <Btn kind="ghost" size="sm" onClick={leave}>Keluar</Btn>
      </PageHead>
      <div className="panel card-pad row wrap" style={{ justifyContent: 'space-between' }}>
        <div><div className="small muted bold">KODE ROOM</div><div className="room-code">{room.code}</div></div>
        <Btn kind="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(room.code); toast('Kode room disalin!'); }}>📋 Salin kode</Btn>
        <div className="small bold col" style={{ gap: 4 }}>
          <span>⏱️ Giliran {room.settings.turnSeconds} detik</span>
          <span>💰 Modal {rp(room.settings.startCash)}</span>
          <span>⌛ {room.settings.timeLimitMin ? `Batas ${room.settings.timeLimitMin} menit` : 'Tanpa batas waktu'} · {room.settings.auction ? 'Lelang aktif' : 'Tanpa lelang'}</span>
        </div>
        {countdown !== null && <div className="ribbon" style={{ fontSize: 22 }}>Mulai dalam {countdown}...</div>}
      </div>
      <div className="grid c4">
        {seats.map((s: any, i: number) => s ? (
          <div key={s.userId} className="panel seat" style={room.mode === 'team' ? { borderColor: s.team === 'Merah' ? '#ff5a4f' : '#4f8bff' } : undefined}>
            {s.userId === room.hostId && <span className="host" title="Host">👑</span>}
            <span className={`ready chip ${s.ready ? 'green' : 'red'}`}>{s.ready ? 'Siap' : 'Belum siap'}</span>
            <Avatar id={s.character} size="xl" />
            <div className="bold">{s.name}{s.userId === me?.id && ' (Kamu)'}</div>
            <div className="small muted">{s.isBot ? `🤖 Bot ${({ easy: 'Mudah', normal: 'Normal', hard: 'Sulit' } as any)[s.botLevel]}` : `Level ${s.level}`}{!s.connected && ' · terputus'}</div>
            {room.mode === 'team' && <span className="chip" style={{ background: s.team === 'Merah' ? '#c81e2e' : '#2448c2' }}>Tim {s.team}</span>}
            {isHost && s.userId !== me?.id && <Btn kind="ghost" size="xs" onClick={() => call('room:kick', { userId: s.userId })}>Keluarkan</Btn>}
          </div>
        ) : (
          <div key={`e${i}`} className="seat empty">
            <div style={{ fontSize: 40 }}>➕</div><div className="bold">Kursi kosong</div>
            {isHost && <div className="row wrap center gap-s"><Btn kind="blue" size="xs" onClick={() => call('room:addBot', { level: 'easy' })}>Bot Mudah</Btn><Btn kind="blue" size="xs" onClick={() => call('room:addBot', { level: 'normal' })}>Normal</Btn><Btn kind="purple" size="xs" onClick={() => call('room:addBot', { level: 'hard' })}>Sulit</Btn></div>}
            <Btn kind="ghost" size="xs" onClick={() => setInvite(true)}>Undang teman</Btn>
          </div>
        ))}
      </div>
      <div className="grid c2">
        <div className="panel card-pad col">
          {room.mode === 'team' && mySeat && <div className="row"><b>Pilih tim:</b><Seg value={mySeat.team} options={[['Merah', '🔴 Merah'], ['Biru', '🔵 Biru']]} onChange={(v) => call('room:team', { team: v })} /></div>}
          {isHost && (
            <div className="row wrap"><b>Pengaturan:</b>
              <Seg value={room.settings.turnSeconds} options={[[30, '30d'], [45, '45d'], [60, '60d']]} onChange={(v) => call('room:settings', { turnSeconds: v })} />
              <Seg value={room.isPrivate} options={[[true, 'Privat'], [false, 'Publik']]} onChange={(v) => call('room:settings', { isPrivate: v })} />
            </div>
          )}
          <div className="row wrap">
            {!isHost && mySeat && <Btn kind={mySeat.ready ? 'ghost' : 'green'} size="lg" onClick={() => call('room:ready', { ready: !mySeat.ready })}>{mySeat.ready ? 'Batal Siap' : '✔ Saya Siap'}</Btn>}
            {isHost && <Btn kind="gold" size="lg" pulse={room.seats.length >= 2 && room.seats.every((s: any) => s.ready)} onClick={() => call('room:start')}>▶ Mulai Permainan</Btn>}
            <Btn kind="blue" onClick={() => setInvite(true)}>👥 Undang Teman</Btn>
          </div>
          <div className="small muted">{isHost ? 'Tambahkan bot untuk mengisi kursi kosong. Permainan dapat dimulai dengan minimal 2 pemain.' : 'Menunggu host memulai permainan.'}</div>
        </div>
        <div className="panel col" style={{ overflow: 'hidden' }}>
          <div className="panel-title">💬 Obrolan Room</div>
          <div className="chat-msgs" style={{ height: 170 }}>{chat.map((m: any) => <div key={m.id} className={`m ${m.system ? 'sys' : ''}`}>{m.system ? m.text : <><b>{m.name}:</b> {m.text}</>}</div>)}</div>
          <form className="chat-input" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; const r = await emit('chat:send', { text: msg }); if (!r.ok) toast(r.error, 'error'); else setMsg(''); }}>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={200} placeholder="Ketik pesan..." /><Btn kind="blue" size="sm" type="submit">Kirim</Btn>
          </form>
        </div>
      </div>
      {inviteOpen && <InviteModal onClose={() => setInvite(false)} />}
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const f = useAsync(() => get('/friends'), []);
  const [sent, setSent] = useState<Set<string>>(new Set());
  return (
    <Modal title="Undang Teman" onClose={onClose}>
      <div className="list">
        {(f.data?.friends || []).map((x: any) => (
          <div key={x.other_id} className="item"><Avatar id={x.selected_character} /><div className="grow"><div className="bold">{x.display_name}</div><div className="small muted">{x.online ? (x.inRoom ? '🎲 Sedang bermain' : '🟢 Online') : '⚪ Offline'}</div></div>
            <Btn kind="green" size="sm" disabled={sent.has(x.other_id)} onClick={async () => { const r = await emit('room:invite', { userId: x.other_id }); if (r.ok) { setSent(new Set([...sent, x.other_id])); toast('Undangan terkirim!', 'success'); } else toast(r.error, 'error'); }}>{sent.has(x.other_id) ? 'Terkirim' : 'Undang'}</Btn></div>
        ))}
        {f.data && !f.data.friends.length && <div className="empty">Belum ada teman. Tambahkan teman di menu Teman, atau bagikan kode room.</div>}
      </div>
    </Modal>
  );
}
