// Admin Dashboard — aplikasi terpisah (/admin) dengan Role-Based Access Control dari server.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import './admin.css';
import { useStore, setState, toast } from '../lib/store';
import { api, get, post, act } from '../lib/api';
import { Btn, Toasts, useAsync, Loading, ErrorBox, Modal, Seg, Toggle } from '../ui/common';
import { num, rp, dur, ago, modeName } from '../lib/format';

const MENU: [string, string, string, string[]][] = [
  ['dashboard', '📊', 'Dashboard', []], ['players', '👤', 'Player Management', []], ['rooms', '🎲', 'Room Management', []],
  ['monitor', '🛰️', 'Game Monitoring', []], ['properties', '🏙️', 'Property Management', []], ['cards', '🃏', 'Card Management', []],
  ['characters', '🧑‍🎨', 'Character Management', []], ['items', '🎁', 'Item Management', []], ['events', '🎉', 'Event Management', []],
  ['tournaments', '🏆', 'Tournament Management', []], ['economy', '💰', 'Economy Management', []], ['rewards', '📨', 'Reward Management', []],
  ['reports', '🚩', 'Reports', ['super_admin', 'admin', 'moderator']], ['analytics', '📈', 'Analytics', []], ['moderation', '🛡️', 'Moderation', ['super_admin', 'admin', 'moderator']],
  ['settings', '⚙️', 'System Settings', ['super_admin', 'admin']], ['audit', '📜', 'Audit Log', ['super_admin', 'admin']],
];

function LineChart({ data, keyX, keyY, color = '#f2c14e', h = 160 }: any) {
  if (!data?.length) return <div className="muted small">Tidak ada data.</div>;
  const max = Math.max(1, ...data.map((d: any) => Number(d[keyY])));
  const w = 600; const pad = 24; const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d: any, i: number) => [pad + i * step, h - 20 - (Number(d[keyY]) / max) * (h - 40)]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
      {[0, 0.5, 1].map((k) => <line key={k} x1={0} x2={w} y1={20 + k * (h - 40)} y2={20 + k * (h - 40)} stroke="rgba(255,255,255,.1)" />)}
      <polyline fill="none" stroke={color} strokeWidth={3} points={pts.map((p: any) => p.join(',')).join(' ')} />
      {pts.map((p: any, i: number) => <g key={i}><circle cx={p[0]} cy={p[1]} r={4} fill={color} /><text x={p[0]} y={h - 4} fontSize={10} fill="#9fb0e0" textAnchor="middle">{String(data[i][keyX]).slice(5)}</text><text x={p[0]} y={p[1] - 8} fontSize={10} fill="#fff" textAnchor="middle">{data[i][keyY]}</text></g>)}
    </svg>
  );
}

function Bars({ rows, label, value }: any) {
  const max = Math.max(1, ...rows.map((r: any) => Number(r[value])));
  const total = rows.reduce((n: number, r: any) => n + Number(r[value]), 0) || 1;
  return <div className="col gap-s">{rows.map((r: any) => <div key={r[label]} className="col" style={{ gap: 2 }}><div className="row small bold"><span className="grow">{modeName(r[label]) || r[label]}</span><span>{num(r[value])} ({Math.round((Number(r[value]) / total) * 100)}%)</span></div><div className="progress"><div style={{ width: `${(Number(r[value]) / max) * 100}%` }} /></div></div>)}</div>;
}

function Stat({ label, value, sub }: any) {
  return <div className="panel card-pad"><div className="small muted bold">{label}</div><div style={{ fontSize: 28, fontWeight: 1000 }}>{value}</div>{sub && <div className="small green-text bold">{sub}</div>}</div>;
}

// ------------------------------------------------------------------ halaman
function Dashboard() {
  const d = useAsync(() => get('/admin/dashboard'), []);
  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} retry={d.reload} />;
  const x = d.data;
  return (
    <div className="col gap-l">
      <div className="grid c4">
        <Stat label="Total pengguna" value={num(x.users.total)} sub={`+${x.users.new_today} hari ini`} />
        <Stat label="Pengguna online" value={num(x.users.online)} sub={`DAU ${x.users.dau}`} />
        <Stat label="Jumlah pertandingan" value={num(x.matches.total)} sub={`${x.matches.today} hari ini`} />
        <Stat label="Room aktif" value={num(x.rooms.active)} sub={`${x.rooms.waiting} menunggu · antre ${x.rooms.queue}`} />
        <Stat label="Durasi rata-rata" value={dur(x.avg.avg_sec)} sub={`${x.avg.avg_rounds} ronde`} />
        <Stat label="Retensi D1 / D7" value={`${x.retention.d1}% / ${x.retention.d7}%`} />
        <Stat label="Laporan terbuka" value={x.reportsOpen} />
        <Stat label="Transaksi virtual (7h)" value={num(x.economy7d.reduce((n: number, e: any) => n + e.n, 0))} />
      </div>
      <div className="grid c2">
        <div className="panel card-pad"><b>Pertumbuhan pengguna (14 hari)</b><LineChart data={x.growth} keyX="day" keyY="total" /></div>
        <div className="panel card-pad"><b>Pertandingan per hari</b><LineChart data={x.activity} keyX="day" keyY="matches" color="#46d17a" /></div>
        <div className="panel card-pad"><b>Mode paling populer</b><Bars rows={x.modes} label="mode" value="n" /></div>
        <div className="panel card-pad"><b>Aktivitas ekonomi virtual (7 hari)</b>
          <table className="table"><thead><tr><th>Mata uang</th><th>Masuk</th><th>Keluar</th><th>Transaksi</th></tr></thead>
            <tbody>{x.economy7d.map((e: any) => <tr key={e.currency}><td>{e.currency}</td><td className="green-text">{num(e.earned || 0)}</td><td className="red-text">{num(e.spent || 0)}</td><td>{e.n}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function Players({ role }: any) {
  const [q, setQ] = useState('');
  const list = useAsync(() => get(`/admin/players?q=${encodeURIComponent(q)}`), [q]);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="col">
      <input className="input" placeholder="Cari username / nama / email" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="panel card-pad" style={{ overflowX: 'auto' }}>
        {list.loading ? <Loading /> : <table className="table"><thead><tr><th>Pemain</th><th>Akun</th><th>Lv</th><th>Main/Menang</th><th>Koin</th><th>Diamond</th><th>Status</th><th /></tr></thead>
          <tbody>{(list.data || []).map((u: any) => <tr key={u.id}><td><b>{u.display_name}</b><div className="tiny muted">@{u.username}</div></td><td>{u.auth_provider}{u.admin_role && <span className="chip gold">{u.admin_role}</span>}</td><td>{u.level}</td><td>{u.games_played}/{u.wins}</td><td>{num(u.coins)}</td><td>{num(u.diamonds)}</td><td>{u.is_banned ? <span className="chip red">Diblokir</span> : u.muted_until && new Date(u.muted_until) > new Date() ? <span className="chip">Dibisukan</span> : <span className="chip green">Aktif</span>}</td><td><Btn kind="ghost" size="xs" onClick={() => setSel(u.id)}>Detail</Btn></td></tr>)}</tbody></table>}
      </div>
      {sel && <PlayerDetail id={sel} role={role} onClose={() => { setSel(null); list.reload(); }} />}
    </div>
  );
}

function PlayerDetail({ id, role, onClose }: any) {
  const d = useAsync(() => get(`/admin/players/${id}`), []);
  const [w, setW] = useState({ currency: 'coins', amount: '', reason: '' });
  const [mute, setMute] = useState(60);
  if (!d.data) return <Modal title="Detail Pemain" onClose={onClose}><Loading /></Modal>;
  const u = d.data.user;
  const can = (...r: string[]) => r.includes(role);
  return (
    <Modal title="Detail Pemain" onClose={onClose} wide>
      <div className="col">
        <div className="row wrap"><b style={{ fontSize: 20 }}>{u.display_name}</b><span className="chip">@{u.username}</span><span className="chip">{d.data.online ? '🟢 Online' : '⚪ Offline'}</span><span className="chip">Lv {u.level}</span><span className="chip">RP {u.rank_points}</span></div>
        <div className="small muted">Daftar {new Date(u.created_at).toLocaleString('id-ID')} · login terakhir {u.last_login_at ? ago(u.last_login_at) : '-'} · email {u.email || '-'}</div>
        <div className="row wrap">
          {can('super_admin', 'admin', 'moderator') && <Btn kind={u.is_banned ? 'green' : ''} size="sm" onClick={async () => { const reason = u.is_banned ? '' : prompt('Alasan blokir?') || 'Pelanggaran aturan'; if (await act(() => post(`/admin/players/${id}/ban`, { ban: !u.is_banned, reason }), 'Tersimpan.')) d.reload(); }}>{u.is_banned ? 'Buka blokir' : 'Blokir akun'}</Btn>}
          {can('super_admin', 'admin', 'moderator') && <><select className="input" style={{ width: 140 }} value={mute} onChange={(e) => setMute(Number(e.target.value))}><option value={0}>Buka bisu</option><option value={60}>Bisu 1 jam</option><option value={1440}>Bisu 1 hari</option><option value={10080}>Bisu 7 hari</option></select><Btn kind="gold" size="sm" onClick={async () => { if (await act(() => post(`/admin/players/${id}/mute`, { minutes: mute }), 'Tersimpan.')) d.reload(); }}>Terapkan</Btn></>}
          {can('super_admin') && <><select className="input" style={{ width: 150 }} defaultValue="" onChange={async (e) => { await act(() => post(`/admin/players/${id}/role`, { role: e.target.value || null }), 'Role diperbarui.'); }}><option value="">Ubah role admin…</option><option value="">(hapus role)</option><option value="admin">admin</option><option value="moderator">moderator</option><option value="support">support</option></select></>}
        </div>
        {can('super_admin', 'admin') && <div className="panel card-pad row wrap"><b>Penyesuaian dompet</b><select className="input" style={{ width: 120 }} value={w.currency} onChange={(e) => setW({ ...w, currency: e.target.value })}><option value="coins">Koin</option><option value="diamonds">Diamond</option><option value="tickets">Tiket</option></select><input className="input" style={{ width: 120 }} placeholder="+/- jumlah" value={w.amount} onChange={(e) => setW({ ...w, amount: e.target.value })} /><input className="input grow" placeholder="Alasan (wajib, tercatat di audit)" value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })} /><Btn kind="green" size="sm" onClick={async () => { if (await act(() => post(`/admin/players/${id}/wallet`, { ...w, amount: Number(w.amount) }), 'Saldo disesuaikan.')) d.reload(); }}>Terapkan</Btn></div>}
        <div className="row wrap"><span className="chip">🪙 {num(u.coins)}</span><span className="chip">💎 {num(u.diamonds)}</span><span className="chip">🎟️ {u.tickets}</span><span className="chip">🎲 {u.games_played} main · {u.wins} menang</span></div>
        <b>Transaksi terakhir</b>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}><table className="table"><tbody>{d.data.transactions.map((t: any) => <tr key={t.id}><td>{t.currency}</td><td className={t.amount > 0 ? 'green-text' : 'red-text'}>{t.amount}</td><td>{t.balance_after}</td><td>{t.reason}</td><td className="tiny muted">{ago(t.created_at)}</td></tr>)}</tbody></table></div>
        {d.data.reports.length > 0 && <><b>Laporan terhadap pemain ini</b>{d.data.reports.map((r: any) => <div key={r.id} className="item small">{r.reason} — {r.detail} · {r.status}</div>)}</>}
        <b>Chat terakhir</b>
        <div style={{ maxHeight: 160, overflowY: 'auto' }}>{d.data.chats.map((c: any, k: number) => <div key={k} className="small">{c.flagged && '🚩'} [{c.channel}] {c.body} <span className="tiny muted">{ago(c.created_at)}</span></div>)}</div>
      </div>
    </Modal>
  );
}

function Rooms({ role, monitor }: any) {
  const d = useAsync(() => get('/admin/rooms'), []);
  const [sess, setSess] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => d.reload(), 5000); return () => clearInterval(t); }, []);
  if (!d.data) return <Loading />;
  return (
    <div className="col">
      <div className="panel card-pad" style={{ overflowX: 'auto' }}>
        <b>Room aktif ({d.data.live.length})</b> <span className="small muted">— diperbarui otomatis</span>
        <table className="table"><thead><tr><th>Kode</th><th>Nama</th><th>Mode</th><th>Status</th><th>Pemain</th><th>Ronde/Fase</th><th>Giliran</th><th /></tr></thead>
          <tbody>{d.data.live.map((r: any) => <tr key={r.code}><td>{r.code}</td><td>{r.name}{r.isPrivate && ' 🔒'}</td><td>{modeName(r.mode)}</td><td>{r.status}</td><td>{(r.players || r.seats).map((p: any) => `${p.name}${p.isBot ? '🤖' : ''}${p.bankrupt ? '💀' : ''}${p.cash !== undefined ? ` ${rp(p.cash)}` : ''}`).join(', ')}</td><td>{r.round} · {r.phase || '-'}</td><td>{r.turnOf || '-'}</td>
            <td className="row gap-s">{r.sessionId && <Btn kind="ghost" size="xs" onClick={() => setSess(r.sessionId)}>Pantau</Btn>}{['super_admin', 'admin', 'moderator'].includes(role) && <Btn kind="" size="xs" onClick={async () => { if (confirm(`Tutup room ${r.code}?`) && await act(() => post(`/admin/rooms/${r.code}/close`, { reason: 'Pemeliharaan' }), 'Room ditutup.')) d.reload(); }}>Tutup</Btn>}</td></tr>)}</tbody></table>
        {!d.data.live.length && <div className="empty">Tidak ada room aktif.</div>}
      </div>
      <div className="panel card-pad"><b>Antrean matchmaking</b> {d.data.queue.map((x: any, k: number) => <span key={k} className="chip">{x.user} · {x.mode} · {x.waitingSec}d</span>)}{!d.data.queue.length && <span className="muted small">kosong</span>}</div>
      {monitor && <div className="panel card-pad" style={{ overflowX: 'auto' }}>
        <b>Riwayat sesi permainan</b>
        <table className="table"><thead><tr><th>Waktu</th><th>Room</th><th>Mode</th><th>Status</th><th>Pemain</th><th>Durasi</th><th>Akhir</th><th /></tr></thead>
          <tbody>{d.data.history.map((s: any) => <tr key={s.id}><td className="small">{ago(s.started_at)}</td><td>{s.code}</td><td>{modeName(s.mode)}</td><td>{s.status}</td><td className="small">{s.players}</td><td>{s.duration_sec ? dur(s.duration_sec) : '-'}</td><td>{s.end_reason || '-'}</td><td><Btn kind="ghost" size="xs" onClick={() => setSess(s.id)}>Detail</Btn></td></tr>)}</tbody></table>
      </div>}
      {sess && <SessionDetail id={sess} onClose={() => setSess(null)} />}
    </div>
  );
}

function SessionDetail({ id, onClose }: any) {
  const d = useAsync(() => get(`/admin/sessions/${id}`), []);
  return (
    <Modal title="Monitoring Sesi" onClose={onClose} wide>
      {!d.data ? <Loading /> : <div className="col">
        <div className="row wrap"><span className="chip">{modeName(d.data.session.mode)}</span><span className="chip">{d.data.session.status}</span><span className="chip">{d.data.diceCount} lemparan dadu</span></div>
        <b>Distribusi total dadu (deteksi anomali; ideal berbentuk segitiga dengan puncak di 7)</b>
        <div className="row" style={{ alignItems: 'flex-end', height: 100, gap: 4 }}>{d.data.diceDistribution.map((n: number, i: number) => { const m = Math.max(1, ...d.data.diceDistribution); return <div key={i} className="col center" style={{ gap: 2, flex: 1 }}><div style={{ width: '100%', height: (n / m) * 80, background: 'linear-gradient(180deg,#f6d36b,#c9952b)', borderRadius: 4 }} /><span className="tiny">{i + 2}</span></div>; })}</div>
        <b>Pemain</b>
        <table className="table"><tbody>{d.data.players.map((p: any) => <tr key={p.id}><td>{p.display_name}{p.is_bot && ' 🤖'}</td><td>#{p.final_place || '-'}</td><td>{p.final_networth ? rp(Number(p.final_networth)) : '-'}</td><td>{p.coins_reward ?? '-'} koin</td></tr>)}</tbody></table>
        <b>Event terakhir</b>
        <div style={{ maxHeight: 220, overflowY: 'auto' }} className="log">{d.data.events.map((e: any) => <div key={e.seq} className={`ln ${e.type}`}>#{e.seq} {e.text}</div>)}</div>
        <b>Transaksi in-game</b>
        <div style={{ maxHeight: 180, overflowY: 'auto' }}><table className="table"><tbody>{d.data.transactions.map((t: any) => <tr key={t.seq}><td>{t.from_ref.slice(0, 8)}</td><td>→ {t.to_ref.slice(0, 8)}</td><td>{rp(Number(t.amount))}</td><td>{t.reason}</td></tr>)}</tbody></table></div>
      </div>}
    </Modal>
  );
}

function Properties({ role }: any) {
  const d = useAsync(() => get('/admin/properties'), []);
  const [ed, setEd] = useState<any>(null);
  if (!d.data) return <Loading />;
  return (
    <div className="panel card-pad" style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>#</th><th>Nama</th><th>Tipe</th><th>Kelompok</th><th>Harga</th><th>Sewa</th><th>Landmark</th><th /></tr></thead>
        <tbody>{d.data.properties.map((p: any) => <tr key={p.id}><td>{p.id}</td><td><b>{p.name}</b></td><td>{p.type}</td><td>{p.group_id && <span className="chip" style={{ background: d.data.groups.find((g: any) => g.id === p.group_id)?.color }}>{d.data.groups.find((g: any) => g.id === p.group_id)?.name}</span>}</td><td>{p.price ? rp(p.price) : p.tax_amount ? `Pajak ${rp(p.tax_amount)}` : '-'}</td><td className="tiny">{p.rent ? p.rent.map((r: number) => (r / 1e3) + 'rb').join(' / ') : '-'}</td><td>{p.landmark || '-'}</td><td>{['super_admin', 'admin'].includes(role) && p.price && <Btn kind="ghost" size="xs" onClick={() => setEd({ ...p, rentStr: (p.rent || []).join(',') })}>Ubah</Btn>}</td></tr>)}</tbody></table>
      {ed && <Modal title={`Ubah ${ed.name}`} onClose={() => setEd(null)}>
        <div className="col">
          <label className="field">Nama<input className="input" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
          <label className="field">Landmark<input className="input" value={ed.landmark || ''} onChange={(e) => setEd({ ...ed, landmark: e.target.value })} /></label>
          <label className="field">Harga (Rp)<input className="input" value={ed.price} onChange={(e) => setEd({ ...ed, price: e.target.value })} /></label>
          {ed.type === 'property' && <label className="field">Sewa 6 tingkat (dasar,1,2,3,4 rumah,hotel)<input className="input" value={ed.rentStr} onChange={(e) => setEd({ ...ed, rentStr: e.target.value })} /></label>}
          <div className="tiny muted">Nama & landmark berlaku langsung. Harga/sewa berlaku setelah server dimulai ulang agar permainan berjalan tidak berubah aturan.</div>
          <Btn kind="gold" onClick={async () => { const body: any = { name: ed.name, landmark: ed.landmark, price: Number(ed.price) }; if (ed.type === 'property') body.rent = ed.rentStr.split(',').map(Number); if (await act(() => api('PATCH', `/admin/properties/${ed.id}`, body), 'Tersimpan.')) { setEd(null); d.reload(); } }}>Simpan</Btn>
        </div>
      </Modal>}
    </div>
  );
}

function Cards({ role }: any) {
  const d = useAsync(() => get('/admin/cards'), []);
  const [ed, setEd] = useState<any>(null);
  if (!d.data) return <Loading />;
  return (
    <div className="panel card-pad" style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>Dek</th><th>Judul</th><th>Teks</th><th>Efek</th><th /></tr></thead>
        <tbody>{d.data.map((c: any) => <tr key={c.id}><td>{c.deck_id}</td><td><b>{c.title}</b></td><td className="small">{c.body}</td><td className="tiny">{c.effect.kind}{c.effect.amount !== undefined ? ` ${rp(c.effect.amount)}` : ''}</td><td>{['super_admin', 'admin'].includes(role) && <Btn kind="ghost" size="xs" onClick={() => setEd(c)}>Ubah</Btn>}</td></tr>)}</tbody></table>
      {ed && <Modal title="Ubah Kartu" onClose={() => setEd(null)}><div className="col">
        <label className="field">Judul<input className="input" value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} /></label>
        <label className="field">Teks<textarea className="input" rows={3} value={ed.body} onChange={(e) => setEd({ ...ed, body: e.target.value })} /></label>
        {ed.effect.amount !== undefined && <label className="field">Nilai (Rp, negatif = bayar)<input className="input" value={ed.effect.amount} onChange={(e) => setEd({ ...ed, effect: { ...ed.effect, amount: e.target.value } })} /></label>}
        <Btn kind="gold" onClick={async () => { if (await act(() => api('PATCH', `/admin/cards/${ed.id}`, { title: ed.title, body: ed.body, amount: ed.effect.amount !== undefined ? Number(ed.effect.amount) : undefined }), 'Tersimpan.')) { setEd(null); d.reload(); } }}>Simpan</Btn>
      </div></Modal>}
    </div>
  );
}

function Catalog({ role, kind }: any) {
  const d = useAsync(() => get('/admin/catalog'), []);
  if (!d.data) return <Loading />;
  const rows = kind === 'character' ? d.data.characters : d.data.skins;
  const edit = ['super_admin', 'admin'].includes(role);
  const save = async (r: any, patch: any) => { if (await act(() => api('PATCH', `/admin/catalog/${kind === 'character' ? 'character' : 'skin'}/${r.id}`, patch), 'Tersimpan.')) d.reload(); };
  return (
    <div className="panel card-pad" style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>ID</th><th>Nama</th>{kind !== 'character' && <th>Jenis</th>}<th>Perolehan</th><th>Harga koin</th><th>Harga diamond</th><th>Aktif</th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.id}><td className="tiny">{r.id}</td><td><b>{r.name}</b>{r.region && <div className="tiny muted">{r.region} · {r.outfit}</div>}</td>{kind !== 'character' && <td>{r.kind}</td>}
          <td>{edit ? <select className="input" value={r.unlock_type} onChange={(e) => save(r, { unlock_type: e.target.value })}>{['free', 'shop', 'mission', 'event', 'adventure'].map((u) => <option key={u}>{u}</option>)}</select> : r.unlock_type}</td>
          <td>{edit ? <input className="input" style={{ width: 90 }} defaultValue={r.price_coins} onBlur={(e) => Number(e.target.value) !== r.price_coins && save(r, { price_coins: Number(e.target.value) })} /> : r.price_coins}</td>
          <td>{edit ? <input className="input" style={{ width: 80 }} defaultValue={r.price_diamonds} onBlur={(e) => Number(e.target.value) !== r.price_diamonds && save(r, { price_diamonds: Number(e.target.value) })} /> : r.price_diamonds}</td>
          <td>{edit ? <Toggle on={r.active} onChange={(v) => save(r, { active: v })} /> : r.active ? '✓' : '✗'}</td></tr>)}</tbody></table>
    </div>
  );
}

function Events({ role }: any) {
  const d = useAsync(() => get('/admin/events'), []);
  const [f, setF] = useState({ name: '', description: '', color: '#e23b3b', days: 7 });
  const [mf, setMf] = useState({ id: '', kind: 'daily', eventId: '', title: '', metric: 'games', target: 3, rewardCoins: 200, rewardDiamonds: 0, rewardXp: 50, rewardItem: '' });
  const edit = ['super_admin', 'admin'].includes(role);
  if (!d.data) return <Loading />;
  return (
    <div className="col">
      <div className="panel card-pad" style={{ overflowX: 'auto' }}>
        <b>Event</b>
        <table className="table"><thead><tr><th>Nama</th><th>Periode</th><th>Aktif</th></tr></thead>
          <tbody>{d.data.events.map((e: any) => <tr key={e.id}><td><span style={{ color: e.color }}>●</span> <b>{e.name}</b><div className="tiny muted">{e.description}</div></td><td className="small">{new Date(e.starts_at).toLocaleDateString('id-ID')} – {new Date(e.ends_at).toLocaleDateString('id-ID')}</td><td>{edit ? <Toggle on={e.active} onChange={async (v) => { await act(() => api('PATCH', `/admin/events/${e.id}`, { active: v })); d.reload(); }} /> : e.active ? '✓' : '✗'}</td></tr>)}</tbody></table>
        {edit && <div className="row wrap mt"><input className="input" style={{ width: 200 }} placeholder="Nama event" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><input className="input grow" placeholder="Deskripsi" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /><input className="input" style={{ width: 80 }} type="number" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /><span className="small">hari</span>
          <Btn kind="gold" size="sm" onClick={async () => { if (await act(() => post('/admin/events', { name: f.name, description: f.description, color: f.color, startsAt: new Date(), endsAt: new Date(Date.now() + f.days * 86400000) }), 'Event dibuat.')) d.reload(); }}>Buat event</Btn></div>}
      </div>
      <div className="panel card-pad" style={{ overflowX: 'auto' }}>
        <b>Misi</b>
        <table className="table"><thead><tr><th>ID</th><th>Jenis</th><th>Judul</th><th>Metrik</th><th>Target</th><th>Hadiah</th><th>Aktif</th></tr></thead>
          <tbody>{d.data.missions.map((m: any) => <tr key={m.id}><td className="tiny">{m.id}</td><td>{m.kind}</td><td>{m.title}</td><td>{m.metric}</td><td>{m.target}</td><td className="small">{m.reward_coins}🪙 {m.reward_diamonds}💎 {m.reward_xp}XP {m.reward_item || ''}</td><td>{edit ? <Toggle on={m.active} onChange={async (v) => { await act(() => api('PATCH', `/admin/missions/${m.id}`, { active: v })); d.reload(); }} /> : m.active ? '✓' : '✗'}</td></tr>)}</tbody></table>
        {edit && <div className="row wrap mt">
          <input className="input" style={{ width: 120 }} placeholder="id_misi" value={mf.id} onChange={(e) => setMf({ ...mf, id: e.target.value })} />
          <select className="input" style={{ width: 100 }} value={mf.kind} onChange={(e) => setMf({ ...mf, kind: e.target.value })}><option>daily</option><option>weekly</option><option>event</option></select>
          {mf.kind === 'event' && <select className="input" style={{ width: 160 }} value={mf.eventId} onChange={(e) => setMf({ ...mf, eventId: e.target.value })}><option value="">pilih event</option>{d.data.events.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
          <input className="input" style={{ width: 200 }} placeholder="Judul" value={mf.title} onChange={(e) => setMf({ ...mf, title: e.target.value })} />
          <select className="input" style={{ width: 130 }} value={mf.metric} onChange={(e) => setMf({ ...mf, metric: e.target.value })}>{['games', 'wins', 'bought', 'built', 'hotels', 'rent_million', 'own_jakarta'].map((x) => <option key={x}>{x}</option>)}</select>
          <input className="input" style={{ width: 70 }} type="number" value={mf.target} onChange={(e) => setMf({ ...mf, target: Number(e.target.value) })} />
          <input className="input" style={{ width: 80 }} type="number" value={mf.rewardCoins} onChange={(e) => setMf({ ...mf, rewardCoins: Number(e.target.value) })} title="koin" />
          <input className="input" style={{ width: 70 }} type="number" value={mf.rewardDiamonds} onChange={(e) => setMf({ ...mf, rewardDiamonds: Number(e.target.value) })} title="diamond" />
          <Btn kind="gold" size="sm" onClick={async () => { if (await act(() => post('/admin/missions', mf), 'Misi disimpan.')) d.reload(); }}>Simpan misi</Btn>
        </div>}
      </div>
    </div>
  );
}

function Tournaments({ role }: any) {
  const d = useAsync(() => get('/admin/tournaments'), []);
  const [f, setF] = useState({ name: '', description: '', entryTickets: 1, days: 7 });
  const edit = ['super_admin', 'admin'].includes(role);
  if (!d.data) return <Loading />;
  return (
    <div className="panel card-pad col" style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>Nama</th><th>Status</th><th>Peserta</th><th>Tiket</th><th>Berakhir</th><th>Hadiah</th><th /></tr></thead>
        <tbody>{d.data.map((t: any) => <tr key={t.id}><td><b>{t.name}</b></td><td>{t.status}</td><td>{t.participants}</td><td>{t.entry_tickets}</td><td className="small">{new Date(t.ends_at).toLocaleString('id-ID')}</td><td className="small">{t.prize_coins.join('/')} 🪙 · {t.prize_diamonds.join('/')} 💎</td><td>{edit && t.status !== 'finished' && <Btn kind="gold" size="xs" onClick={async () => { if (confirm('Selesaikan turnamen & kirim hadiah ke 3 besar?') && await act(() => post(`/admin/tournaments/${t.id}/finish`), 'Turnamen selesai, hadiah dikirim.')) d.reload(); }}>Selesaikan</Btn>}</td></tr>)}</tbody></table>
      {edit && <div className="row wrap"><input className="input" style={{ width: 220 }} placeholder="Nama turnamen" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><input className="input grow" placeholder="Deskripsi" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /><input className="input" style={{ width: 70 }} type="number" value={f.entryTickets} onChange={(e) => setF({ ...f, entryTickets: Number(e.target.value) })} title="tiket" /><input className="input" style={{ width: 70 }} type="number" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} title="hari" /><Btn kind="gold" size="sm" onClick={async () => { if (await act(() => post('/admin/tournaments', f), 'Turnamen dibuat.')) d.reload(); }}>Buat turnamen</Btn></div>}
    </div>
  );
}

function Economy({ role }: any) {
  const d = useAsync(() => get('/admin/economy'), []);
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (d.data) setS(d.data.settings); }, [d.data]);
  if (!d.data || !s) return <Loading />;
  const edit = ['super_admin', 'admin'].includes(role);
  const F = ({ k, label }: any) => <label className="field">{label}<input className="input" disabled={!edit} value={Array.isArray(s[k]) ? s[k].join(',') : s[k]} onChange={(e) => setS({ ...s, [k]: Array.isArray(s[k]) ? e.target.value.split(',').map(Number) : Number(e.target.value) })} /></label>;
  return (
    <div className="col">
      <div className="grid c3"><Stat label="Koin beredar" value={num(d.data.supply.coins)} /><Stat label="Diamond beredar" value={num(d.data.supply.diamonds)} /><Stat label="Tiket beredar" value={num(d.data.supply.tickets)} /></div>
      <div className="panel card-pad col">
        <b>Parameter ekonomi</b>
        <div className="grid c3">
          <F k="winCoins" label="Bonus koin pemenang" /><F k="placeCoins" label="Koin per posisi (1,2,3,4)" /><F k="winXp" label="XP menang" /><F k="playXp" label="XP bermain" />
          <F k="winRp" label="Rank point menang" /><F k="lossRp" label="Rank point kalah (maks, negatif)" /><F k="dailyLogin" label="Login harian 7 hari" /><F k="dailyLoginDiamondDay7" label="Diamond hari ke-7" />
          <F k="guildCreateCost" label="Biaya dirikan guild" /><F k="startCoins" label="Koin awal" /><F k="startDiamonds" label="Diamond awal" /><F k="startTickets" label="Tiket awal" />
        </div>
        {edit && <Btn kind="gold" onClick={async () => { await act(() => api('PUT', '/admin/economy', s), 'Parameter ekonomi disimpan.'); }}>Simpan parameter</Btn>}
      </div>
      <div className="grid c2">
        <div className="panel card-pad" style={{ overflowX: 'auto' }}><b>Sumber & pengeluaran (7 hari)</b><table className="table"><tbody>{d.data.sources.map((x: any, k: number) => <tr key={k}><td>{x.currency}</td><td>{x.reason}</td><td className={Number(x.total) > 0 ? 'green-text' : 'red-text'}>{num(Number(x.total))}</td><td>{x.n}×</td></tr>)}</tbody></table></div>
        <div className="panel card-pad" style={{ overflowX: 'auto' }}><b>Transaksi terbaru (audit)</b><table className="table"><tbody>{d.data.recent.map((t: any) => <tr key={t.id}><td>{t.username}</td><td>{t.currency}</td><td className={t.amount > 0 ? 'green-text' : 'red-text'}>{t.amount}</td><td className="small">{t.reason}</td><td className="tiny muted">{ago(t.created_at)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function Rewards({ role }: any) {
  const [f, setF] = useState({ all: false, userId: '', title: '', body: '', coins: 0, diamonds: 0, tickets: 0, item: '' });
  const [q, setQ] = useState('');
  const found = useAsync(() => (q.length > 1 ? get(`/admin/players?q=${encodeURIComponent(q)}`) : Promise.resolve([])), [q]);
  return (
    <div className="panel card-pad col" style={{ maxWidth: 720 }}>
      <div className="row"><b>Kirim ke semua pemain</b><Toggle on={f.all} onChange={(v) => setF({ ...f, all: v })} /></div>
      {!f.all && <><input className="input" placeholder="Cari penerima" value={q} onChange={(e) => setQ(e.target.value)} /><div className="row wrap">{(found.data || []).slice(0, 8).map((u: any) => <button key={u.id} className={`tab ${f.userId === u.id ? 'on' : ''}`} onClick={() => setF({ ...f, userId: u.id })}>{u.display_name} @{u.username}</button>)}</div></>}
      <input className="input" placeholder="Judul pesan" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <textarea className="input" rows={3} placeholder="Isi pesan" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      {role !== 'support' ? <div className="row wrap"><label className="field">Koin<input className="input" type="number" value={f.coins} onChange={(e) => setF({ ...f, coins: Number(e.target.value) })} /></label><label className="field">Diamond<input className="input" type="number" value={f.diamonds} onChange={(e) => setF({ ...f, diamonds: Number(e.target.value) })} /></label><label className="field">Tiket<input className="input" type="number" value={f.tickets} onChange={(e) => setF({ ...f, tickets: Number(e.target.value) })} /></label><label className="field">Item ID<input className="input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder="mis. pawn_emas" /></label></div> : <div className="small muted">Role support hanya dapat mengirim pesan tanpa hadiah.</div>}
      <Btn kind="gold" onClick={async () => { const r = await act(() => post('/admin/rewards', f)); if (r) toast(`Terkirim ke ${r.recipients} pemain.`, 'success'); }}>Kirim ke Inbox</Btn>
    </div>
  );
}

function Reports() {
  const d = useAsync(() => get('/admin/reports'), []);
  if (!d.data) return <Loading />;
  return (
    <div className="panel card-pad" style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>Waktu</th><th>Pelapor</th><th>Terlapor</th><th>Alasan</th><th>Detail</th><th>Status</th><th /></tr></thead>
        <tbody>{d.data.reports.map((r: any) => <tr key={r.id}><td className="small">{ago(r.created_at)}</td><td>{r.reporter}</td><td><b>{r.target}</b></td><td>{r.reason}</td><td className="small">{r.detail}</td><td>{r.status}</td><td className="row gap-s">{r.status === 'open' && <><Btn kind="green" size="xs" onClick={async () => { await act(() => post(`/admin/reports/${r.id}`, { status: 'resolved' })); d.reload(); }}>Selesai</Btn><Btn kind="ghost" size="xs" onClick={async () => { await act(() => post(`/admin/reports/${r.id}`, { status: 'dismissed' })); d.reload(); }}>Abaikan</Btn></>}</td></tr>)}</tbody></table>
      {!d.data.reports.length && <div className="empty">Tidak ada laporan.</div>}
    </div>
  );
}

function Moderation() {
  const d = useAsync(() => get('/admin/reports'), []);
  if (!d.data) return <Loading />;
  return (
    <div className="panel card-pad" style={{ overflowX: 'auto' }}>
      <b>Pesan yang ditandai filter otomatis (kata kasar / tautan)</b>
      <table className="table"><thead><tr><th>Waktu</th><th>Kanal</th><th>Pengirim</th><th>Pesan (sudah disensor)</th><th /></tr></thead>
        <tbody>{d.data.flagged.map((m: any) => <tr key={m.id}><td className="small">{ago(m.created_at)}</td><td>{m.channel}:{String(m.channel_id).slice(0, 8)}</td><td>{m.sender_name}</td><td>{m.body}</td><td><Btn kind="" size="xs" onClick={async () => { await act(() => api('DELETE', `/admin/chat/${m.id}`), 'Pesan dihapus.'); d.reload(); }}>Hapus</Btn></td></tr>)}</tbody></table>
      {!d.data.flagged.length && <div className="empty">Tidak ada pesan bermasalah.</div>}
      <div className="small muted mt">Bisukan/blokir pemain melalui menu Player Management. Filter otomatis menyensor kata kasar, tautan, dan membatasi spam (rate limit + deteksi pesan berulang).</div>
    </div>
  );
}

function Analytics() {
  const d = useAsync(() => get('/admin/dashboard'), []);
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <div className="col gap-l">
      <div className="grid c2">
        <div className="panel card-pad"><b>Pendaftaran baru per hari</b><LineChart data={x.growth} keyX="day" keyY="signups" color="#4f8bff" /></div>
        <div className="panel card-pad"><b>Total pengguna</b><LineChart data={x.growth} keyX="day" keyY="total" /></div>
        <div className="panel card-pad"><b>Pertandingan per hari</b><LineChart data={x.activity} keyX="day" keyY="matches" color="#46d17a" /></div>
        <div className="panel card-pad"><b>Distribusi mode</b><Bars rows={x.modes} label="mode" value="n" /></div>
      </div>
      <div className="grid c4"><Stat label="Retensi D1" value={`${x.retention.d1}%`} /><Stat label="Retensi D7" value={`${x.retention.d7}%`} /><Stat label="DAU" value={x.users.dau} /><Stat label="Durasi rata-rata" value={dur(x.avg.avg_sec)} /></div>
    </div>
  );
}

function SystemSettings({ role }: any) {
  const d = useAsync(() => get('/admin/settings'), []);
  const [m, setM] = useState<any>(null);
  const [motd, setMotd] = useState('');
  const [admin, setAdmin] = useState({ username: '', password: '', role: 'moderator' });
  useEffect(() => { if (d.data) { setM(d.data.find((x: any) => x.key === 'maintenance')?.value); setMotd(d.data.find((x: any) => x.key === 'motd')?.value?.text || ''); } }, [d.data]);
  if (!d.data || !m) return <Loading />;
  const sup = role === 'super_admin';
  return (
    <div className="grid c2">
      <div className="panel card-pad col"><b>Mode pemeliharaan</b><div className="row"><Toggle on={m.enabled} onChange={(v) => setM({ ...m, enabled: v })} /><span>{m.enabled ? 'Aktif — pemain tidak dapat membuat room baru' : 'Nonaktif'}</span></div><input className="input" placeholder="Pesan pemeliharaan" value={m.message} onChange={(e) => setM({ ...m, message: e.target.value })} />{sup && <Btn kind="gold" onClick={() => act(() => api('PUT', '/admin/settings/maintenance', m), 'Tersimpan.')}>Simpan</Btn>}</div>
      <div className="panel card-pad col"><b>Pesan lobby (MOTD)</b><textarea className="input" rows={3} value={motd} onChange={(e) => setMotd(e.target.value)} />{sup && <Btn kind="gold" onClick={() => act(() => api('PUT', '/admin/settings/motd', { text: motd }), 'Tersimpan.')}>Simpan</Btn>}</div>
      {sup && <div className="panel card-pad col"><b>Tambah akun admin</b><input className="input" placeholder="username" value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} /><input className="input" type="password" placeholder="password (min 8)" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /><Seg value={admin.role} options={[['admin', 'Admin'], ['moderator', 'Moderator'], ['support', 'Support']]} onChange={(v) => setAdmin({ ...admin, role: v })} /><Btn kind="green" onClick={() => act(() => post('/admin/admins', admin), 'Akun admin dibuat.')}>Buat</Btn></div>}
      {!sup && <div className="panel card-pad small muted">Hanya Super Admin yang dapat mengubah pengaturan sistem.</div>}
    </div>
  );
}

function Audit() {
  const d = useAsync(() => get('/admin/audit'), []);
  if (!d.data) return <Loading />;
  return <div className="panel card-pad" style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>Waktu</th><th>Admin</th><th>Role</th><th>Aksi</th><th>Target</th><th>Detail</th><th>IP</th></tr></thead><tbody>{d.data.map((a: any) => <tr key={a.id}><td className="small">{new Date(a.created_at).toLocaleString('id-ID')}</td><td>{a.admin_name}</td><td>{a.role}</td><td><b>{a.action}</b></td><td className="small">{a.target_type}:{String(a.target_id || '').slice(0, 10)}</td><td className="tiny">{JSON.stringify(a.detail).slice(0, 120)}</td><td className="tiny">{a.ip}</td></tr>)}</tbody></table></div>;
}

// ------------------------------------------------------------------ shell
function AdminApp() {
  const token = useStore((s) => s.token);
  const [me, setMe] = useState<any>(null);
  const [page, setPage] = useState('dashboard');
  const [u, setU] = useState(''); const [p, setP] = useState('');
  const [denied, setDenied] = useState(false);
  useEffect(() => { setDenied(false); if (token) get('/admin/me').then(setMe).catch(() => { setDenied(true); setMe(null); }); }, [token]);
  if (!token || !me) {
    return (
      <div className="splash">
        <div className="logo-title" style={{ fontSize: 36 }}>ADMIN</div><div className="logo-sub">MONOPOLI INDONESIA</div>
        <form className="panel login-box col" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => post('/auth/login', { username: u, password: p })); if (r) setState({ token: r.token }); }}>
          <input className="input" placeholder="Username admin" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
          <input className="input" type="password" placeholder="Password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
          <Btn kind="gold" type="submit">Masuk</Btn>
          {token && denied && <div className="small red-text center">Akun yang sedang masuk tidak memiliki akses admin. Masuk dengan akun admin.</div>}
          <a href="/" className="small muted center">← Kembali ke game</a>
        </form>
      </div>
    );
  }
  const allowed = MENU.filter(([, , , roles]) => !roles.length || roles.includes(me.role));
  const cur = allowed.find((x) => x[0] === page) || allowed[0];
  const P: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />, players: <Players role={me.role} />, rooms: <Rooms role={me.role} />, monitor: <Rooms role={me.role} monitor />,
    properties: <Properties role={me.role} />, cards: <Cards role={me.role} />, characters: <Catalog role={me.role} kind="character" />, items: <Catalog role={me.role} kind="skin" />,
    events: <Events role={me.role} />, tournaments: <Tournaments role={me.role} />, economy: <Economy role={me.role} />, rewards: <Rewards role={me.role} />,
    reports: <Reports />, analytics: <Analytics />, moderation: <Moderation />, settings: <SystemSettings role={me.role} />, audit: <Audit />,
  };
  return (
    <div className="app-shell admin">
      <header className="topbar"><b style={{ fontSize: 18 }}>🛡️ Admin Monopoli Indonesia</b><div className="grow" /><span className="chip gold">{me.username} · {me.role}</span><Btn kind="ghost" size="sm" onClick={() => { setState({ token: null }); setMe(null); }}>Keluar</Btn><a className="btn ghost sm" href="/">Game</a></header>
      <nav className="sidenav">{allowed.map(([k, ic, l]) => <button key={k} className={`navbtn ${cur[0] === k ? 'on' : ''}`} onClick={() => setPage(k)}><span className="ic">{ic}</span>{l}</button>)}</nav>
      <main className="main"><div className="page" style={{ maxWidth: 1400 }}><div className="page-head"><h1>{cur[1]} {cur[2]}</h1></div>{P[cur[0]]}</div></main>
      <nav className="bottomnav" style={{ overflowX: 'auto', justifyContent: 'flex-start' }}>{allowed.map(([k, ic, l]) => <button key={k} className={`navbtn ${cur[0] === k ? 'on' : ''}`} onClick={() => setPage(k)}><span className="ic">{ic}</span>{l.split(' ')[0]}</button>)}</nav>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<><div className="world-bg" /><AdminApp /><Toasts /></>);
