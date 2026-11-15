// Halaman menu: Profil, Koleksi, Kustomisasi, Toko, Inventaris, Misi, Peringkat, Event, Turnamen, Adventure,
// Teman, Guild, Inbox, Pengaturan. Semua terhubung ke API server (bukan data tiruan).
import React, { useEffect, useMemo, useState } from 'react';
import { useStore, navigate, setState, toast } from '../lib/store';
import { get, post, api, act, refreshMe } from '../lib/api';
import { emit, logoutLocal } from '../lib/socket';
import { sfx } from '../lib/audio';
import { Btn, Avatar, Coin, Diamond, Ticket, Modal, useAsync, Loading, ErrorBox, PageHead, Seg, Toggle, RewardLine } from './common';
import { portrait } from '../three/characters';
import { quickPlay } from './Lobby';
import { rp, rpShort, num, dur, ago, timeLeft, modeName } from '../lib/format';

// ------------------------------------------------------------------ PROFIL
export function Profile() {
  const me = useStore((s) => s.me);
  const hist = useAsync(() => get('/me/history'), []);
  const tx = useAsync(() => get('/me/transactions'), []);
  const [edit, setEdit] = useState(false);
  const [dn, setDn] = useState(me?.displayName || '');
  const [bio, setBio] = useState(me?.bio || '');
  if (!me) return null;
  const save = async () => { if (await act(() => api('PATCH', '/me', { displayName: dn, bio }), 'Profil disimpan.')) { setEdit(false); refreshMe(); } };
  const winRate = me.gamesPlayed ? Math.round((me.wins / me.gamesPlayed) * 100) : 0;
  return (
    <div className="page">
      <PageHead icon="🙂" title="Profil Pemain"><Btn kind="ghost" size="sm" onClick={() => setEdit(true)}>✏️ Ubah</Btn></PageHead>
      <div className="panel card-pad row wrap gap-l">
        <img src={portrait(me.character)} alt="" style={{ height: 180 }} />
        <div className="col grow">
          <div style={{ fontSize: 30, fontWeight: 1000 }}>{me.displayName}</div>
          <div className="row wrap"><span className="chip gold">Lv. {me.level}</span><span className="chip">{me.title}</span>{me.guild && <span className="chip">🛡️ [{me.guild.tag}] {me.guild.name}</span>}{me.provider === 'guest' && <span className="chip red">Akun tamu</span>}</div>
          <div className="small muted">@{me.username} · bergabung {new Date(me.createdAt).toLocaleDateString('id-ID')}</div>
          {me.bio && <div className="bold">“{me.bio}”</div>}
          <div className="col" style={{ gap: 4, maxWidth: 420 }}><div className="small bold">XP {me.xp} / {me.xpNext}</div><div className="progress"><div style={{ width: `${(me.xp / me.xpNext) * 100}%` }} /></div></div>
        </div>
      </div>
      <div className="grid c4">
        {[['🏅', 'Rank Point', num(me.rankPoints)], ['🎲', 'Permainan', num(me.gamesPlayed)], ['🏆', 'Menang', `${num(me.wins)} (${winRate}%)`], ['💰', 'Aset terbaik', rpShort(me.bestNetworth)]].map(([ic, l, v]) => (
          <div key={l} className="panel card-pad col center" style={{ textAlign: 'center' }}><div style={{ fontSize: 30 }}>{ic}</div><div className="small muted bold">{l}</div><div style={{ fontSize: 22, fontWeight: 1000 }}>{v}</div></div>
        ))}
      </div>
      <div className="grid c2">
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Riwayat Pertandingan</span>
          {hist.loading ? <Loading /> : (hist.data || []).length ? (
            <table className="table"><thead><tr><th>Mode</th><th>Posisi</th><th>Aset</th><th>Hadiah</th><th>Waktu</th></tr></thead>
              <tbody>{hist.data.map((h: any) => <tr key={h.id}><td>{modeName(h.mode)}</td><td>{h.final_place === 1 ? '🥇' : `#${h.final_place}`}/{h.players}</td><td>{rpShort(Number(h.final_networth))}</td><td><Coin n={h.coins_reward} /> {h.rank_points_delta ? <span className={h.rank_points_delta > 0 ? 'green-text' : 'red-text'}>{h.rank_points_delta > 0 ? '+' : ''}{h.rank_points_delta} RP</span> : ''}</td><td className="small muted">{ago(h.finished_at)}</td></tr>)}</tbody></table>
          ) : <div className="empty">Belum ada pertandingan. Ayo main!</div>}
        </div>
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Riwayat Dompet</span>
          <div className="list" style={{ maxHeight: 340, overflowY: 'auto' }}>
            {(tx.data || []).map((t: any, k: number) => <div key={k} className="item small"><span className="grow bold">{t.reason}</span><span className={t.amount > 0 ? 'green-text bold' : 'red-text bold'}>{t.amount > 0 ? '+' : ''}{num(t.amount)} {({ coins: 'koin', diamonds: 'diamond', tickets: 'tiket', xp: 'XP', rank_points: 'RP' } as any)[t.currency]}</span><span className="tiny muted">{ago(t.created_at)}</span></div>)}
          </div>
        </div>
      </div>
      {edit && (
        <Modal title="Ubah Profil" onClose={() => setEdit(false)}>
          <div className="col">
            <label className="field">Nama tampilan<input className="input" value={dn} maxLength={20} onChange={(e) => setDn(e.target.value)} /></label>
            <label className="field">Bio<textarea className="input" rows={3} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
            <Btn kind="gold" onClick={save}>Simpan</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ KOLEKSI KARAKTER
const UNLOCK = { free: 'Gratis', shop: 'Toko', mission: 'Hadiah misi/achievement', event: 'Hadiah event', adventure: 'Hadiah Adventure' } as any;

export function Collection() {
  const me = useStore((s) => s.me);
  const cat = useAsync(() => get('/catalog'), []);
  const [sel, setSel] = useState<any>(null);
  if (cat.loading) return <Loading />;
  if (cat.error) return <ErrorBox error={cat.error} retry={cat.reload} />;
  const chars = cat.data.characters;
  const cur = sel || chars.find((c: any) => c.id === me.character) || chars[0];
  const use = async (id: string) => { if (await act(() => post('/customize', { character: id }), 'Karakter dipakai!')) refreshMe(); };
  return (
    <div className="page">
      <PageHead icon="🧑‍🎨" title="Koleksi Karakter"><span className="chip gold">{chars.filter((c: any) => c.owned).length}/{chars.length} dimiliki</span></PageHead>
      <div className="grid c2">
        <div className="panel card-pad col sticky-top" style={{ textAlign: 'center', alignItems: 'center' }}>
          <img src={portrait(cur.id)} alt="" style={{ height: 260, filter: cur.owned ? 'none' : 'grayscale(.8) brightness(.7)' }} />
          <div style={{ fontSize: 28, fontWeight: 1000 }}>{cur.name}</div>
          <div className="row wrap center"><span className={`chip r-${cur.rarity}`}>{cur.rarity}</span><span className="chip">📍 {cur.region}</span><span className="chip">👘 {cur.outfit}</span></div>
          <p className="bold" style={{ maxWidth: 440 }}>{cur.description}</p>
          {cur.owned ? (me.character === cur.id ? <span className="chip green">✓ Sedang dipakai</span> : <Btn kind="gold" onClick={() => use(cur.id)}>Pakai Karakter</Btn>)
            : cur.unlock_type === 'shop' ? <Btn kind="green" onClick={() => navigate('shop')}>Beli di Toko ({cur.price_coins ? `${num(cur.price_coins)} koin` : `${cur.price_diamonds} diamond`})</Btn>
              : <span className="chip">🔒 {UNLOCK[cur.unlock_type]}</span>}
        </div>
        <div className="grid auto" style={{ alignContent: 'start' }}>
          {chars.map((c: any) => (
            <div key={c.id} className="panel shop-item" style={{ cursor: 'pointer', borderColor: cur.id === c.id ? '#f2c14e' : undefined }} onClick={() => { sfx('click'); setSel(c); }}>
              <span className={`rarity r-${c.rarity}`}>{c.rarity}</span>
              <div className="preview"><img src={portrait(c.id)} alt="" style={{ filter: c.owned ? 'none' : 'grayscale(1) brightness(.6)' }} /></div>
              <div className="bold">{c.name}</div><div className="tiny muted">{c.region}</div>
              {!c.owned && <span className="tiny">🔒 {UNLOCK[c.unlock_type]}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ KUSTOMISASI (pion, dadu, emote)
function SkinPreview({ s }: { s: any }) {
  if (s.kind === 'dice') return <div className="dice-pips"><span style={{ background: s.data.face, color: s.data.pip }}>⚃</span><span style={{ background: s.data.face, color: s.data.pip }}>⚄</span></div>;
  if (s.kind === 'pawn') return <div style={{ width: 70, height: 70, borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, #fff8, ${s.data.base})`, border: `5px solid ${s.data.ring || '#fff'}` }} />;
  if (s.kind === 'emote') return <span style={{ fontSize: 46 }}>{s.data.icon}</span>;
  return <span>🎁</span>;
}

export function Customize() {
  const me = useStore((s) => s.me);
  const cat = useAsync(() => get('/catalog'), []);
  const [kind, setKind] = useState<'pawn' | 'dice' | 'emote'>('pawn');
  if (cat.loading) return <Loading />;
  if (cat.error) return <ErrorBox error={cat.error} retry={cat.reload} />;
  const list = cat.data.skins.filter((s: any) => s.kind === kind);
  const selected = (s: any) => (kind === 'pawn' ? me.pawn === s.id : kind === 'dice' ? me.dice === s.id : me.emotes.includes(s.id));
  const choose = async (s: any) => {
    if (!s.owned) return toast(s.unlock_type === 'shop' ? 'Beli item ini di Toko terlebih dahulu.' : `Dapatkan lewat ${UNLOCK[s.unlock_type]}.`, 'error');
    const body = kind === 'pawn' ? { pawn: s.id } : kind === 'dice' ? { dice: s.id } : { emotes: selected(s) ? me.emotes.filter((e: string) => e !== s.id) : [...me.emotes, s.id].slice(-6) };
    if (await act(() => post('/customize', body))) { sfx('buy'); refreshMe(); }
  };
  return (
    <div className="page">
      <PageHead icon="🎨" title="Kustomisasi"><Btn kind="ghost" size="sm" onClick={() => navigate('collection')}>Ganti karakter</Btn></PageHead>
      <div className="panel card-pad row wrap gap-l">
        <img src={portrait(me.character)} alt="" style={{ height: 150 }} />
        <div className="col"><div className="bold">Tampilan saat ini</div>
          <div className="small">Pion: <b>{cat.data.skins.find((s: any) => s.id === me.pawn)?.name}</b></div>
          <div className="small">Dadu: <b>{cat.data.skins.find((s: any) => s.id === me.dice)?.name}</b></div>
          <div className="small">Emote: {me.emotes.map((e: string) => cat.data.skins.find((s: any) => s.id === e)?.data.icon).join(' ')}</div>
        </div>
      </div>
      <Seg value={kind} options={[['pawn', 'Alas Pion'], ['dice', 'Dadu'], ['emote', 'Emote (maks 6)']]} onChange={setKind} />
      <div className="grid auto">
        {list.map((s: any) => (
          <div key={s.id} className="panel shop-item" style={{ borderColor: selected(s) ? '#46d17a' : undefined, cursor: 'pointer' }} onClick={() => choose(s)}>
            <div className="preview"><SkinPreview s={s} /></div>
            <div className="bold">{s.name}</div><div className="tiny muted">{s.description}</div>
            {selected(s) ? <span className="chip green">✓ Dipakai</span> : s.owned ? <span className="chip">Pakai</span> : <span className="chip">🔒 {UNLOCK[s.unlock_type]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ TOKO
export function Shop() {
  const me = useStore((s) => s.me);
  const cat = useAsync(() => get('/catalog'), []);
  const [tab, setTab] = useState('character');
  const [confirm, setConfirm] = useState<any>(null);
  if (cat.loading) return <Loading />;
  if (cat.error) return <ErrorBox error={cat.error} retry={cat.reload} />;
  const items = tab === 'character' ? cat.data.characters.map((c: any) => ({ ...c, kind: 'character' })) : cat.data.skins.filter((s: any) => s.kind === tab);
  const forSale = items.filter((i: any) => i.unlock_type === 'shop');
  const buy = async (it: any, currency: string) => {
    const r = await act(() => post('/shop/buy', { itemId: it.id, currency, requestId: `${Date.now()}` }));
    if (r) { sfx('buy'); toast(`${it.name} berhasil dibeli!`, 'reward'); setConfirm(null); cat.reload(); refreshMe(); }
  };
  return (
    <div className="page">
      <PageHead icon="🛒" title="Toko"><Coin n={me.wallet.coins} /><Diamond n={me.wallet.diamonds} /><Ticket n={me.wallet.tickets} /></PageHead>
      <div className="panel card-pad small bold">🛡️ <b>Tanpa pay-to-win:</b> semua item di toko bersifat kosmetik. Koin didapat dari bermain, misi, dan login harian; diamond dari misi, achievement, event, dan naik level.</div>
      <div className="tabs">{[['character', 'Karakter'], ['pawn', 'Alas Pion'], ['dice', 'Dadu'], ['emote', 'Emote'], ['currency', 'Tiket & Diamond']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'currency' ? (
        <div className="grid c2">
          <div className="panel card-pad col center" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50 }}>🎟️</div><div className="bold">Tukar 10 diamond → 1 tiket turnamen</div>
            <div className="row"><Btn kind="gold" onClick={async () => { if (await act(() => post('/shop/tickets', { count: 1 }), 'Tiket ditambahkan!')) refreshMe(); }}>Tukar 1 tiket</Btn><Btn kind="gold" onClick={async () => { if (await act(() => post('/shop/tickets', { count: 5 }), '5 tiket ditambahkan!')) refreshMe(); }}>Tukar 5 tiket</Btn></div>
          </div>
          <div className="panel card-pad col center" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50 }}>💎</div><div className="bold">Top up diamond</div>
            <div className="small muted">Pembelian dengan uang sungguhan hanya aktif setelah payment gateway resmi dikonfigurasi oleh operator.</div>
            <Btn kind="blue" onClick={() => act(() => post('/shop/topup', {}))}>Cek ketersediaan</Btn>
          </div>
        </div>
      ) : (
        <div className="grid auto">
          {forSale.map((it: any) => (
            <div key={it.id} className="panel shop-item">
              {it.rarity && <span className={`rarity r-${it.rarity}`}>{it.rarity}</span>}
              <div className="preview">{it.kind === 'character' ? <img src={portrait(it.id)} alt="" /> : <SkinPreview s={it} />}</div>
              <div className="bold">{it.name}</div>
              <div className="tiny muted" style={{ minHeight: 28 }}>{it.description?.slice(0, 70)}</div>
              {it.owned ? <span className="chip green">✓ Dimiliki</span> : (
                <div className="row wrap center gap-s">
                  {it.price_coins > 0 && <Btn kind="gold" size="sm" onClick={() => setConfirm({ it, cur: 'coins' })}><Coin /> {num(it.price_coins)}</Btn>}
                  {it.price_diamonds > 0 && <Btn kind="blue" size="sm" onClick={() => setConfirm({ it, cur: 'diamonds' })}><Diamond /> {num(it.price_diamonds)}</Btn>}
                </div>
              )}
            </div>
          ))}
          {!forSale.length && <div className="empty">Tidak ada item di kategori ini.</div>}
        </div>
      )}
      <div className="panel card-pad">
        <b>Item eksklusif</b> <span className="muted small">(tidak dijual — dapatkan lewat misi, event, dan Adventure)</span>
        <div className="row wrap mt">{items.filter((i: any) => i.unlock_type !== 'shop' && i.unlock_type !== 'free').map((i: any) => <span key={i.id} className="chip">{i.owned ? '✓' : '🔒'} {i.name} · {UNLOCK[i.unlock_type]}</span>)}</div>
      </div>
      {confirm && (
        <Modal title="Konfirmasi Pembelian" onClose={() => setConfirm(null)}>
          <div className="col center" style={{ textAlign: 'center' }}>
            <div className="bold">Beli <span className="gold-text">{confirm.it.name}</span> seharga {confirm.cur === 'coins' ? <Coin n={confirm.it.price_coins} /> : <Diamond n={confirm.it.price_diamonds} />}?</div>
            <div className="row"><Btn kind="ghost" onClick={() => setConfirm(null)}>Batal</Btn><Btn kind="green" onClick={() => buy(confirm.it, confirm.cur)}>Beli</Btn></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ INVENTARIS
export function Inventory() {
  const cat = useAsync(() => get('/catalog'), []);
  const me = useStore((s) => s.me);
  if (cat.loading) return <Loading />;
  if (cat.error) return <ErrorBox error={cat.error} retry={cat.reload} />;
  const all = [...cat.data.characters.map((c: any) => ({ ...c, kind: 'character' })), ...cat.data.skins].filter((x: any) => x.owned);
  const groups: [string, string][] = [['character', '🧑‍🎨 Karakter'], ['pawn', '♟️ Alas Pion'], ['dice', '🎲 Dadu'], ['emote', '😊 Emote']];
  return (
    <div className="page">
      <PageHead icon="🎒" title="Inventaris"><span className="chip gold">{all.length} item</span></PageHead>
      <div className="grid c3">
        <div className="panel card-pad col center"><Coin size={34} /><div style={{ fontSize: 24, fontWeight: 1000 }}>{num(me.wallet.coins)}</div><div className="small muted">Koin</div></div>
        <div className="panel card-pad col center"><Diamond /><div style={{ fontSize: 24, fontWeight: 1000 }}>{num(me.wallet.diamonds)}</div><div className="small muted">Diamond</div></div>
        <div className="panel card-pad col center"><Ticket /><div style={{ fontSize: 24, fontWeight: 1000 }}>{num(me.wallet.tickets)}</div><div className="small muted">Tiket</div></div>
      </div>
      {groups.map(([k, l]) => (
        <div key={k} className="panel card-pad col">
          <b>{l}</b>
          <div className="grid auto">
            {all.filter((x: any) => x.kind === k).map((x: any) => (
              <div key={x.id} className="item col" style={{ alignItems: 'center', textAlign: 'center' }}>
                <div style={{ height: 80 }} className="center">{k === 'character' ? <img src={portrait(x.id)} alt="" style={{ height: 80 }} /> : <SkinPreview s={x} />}</div>
                <div className="small bold">{x.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="row center"><Btn kind="gold" onClick={() => navigate('customize')}>Atur tampilan</Btn></div>
    </div>
  );
}

// ------------------------------------------------------------------ MISI & ACHIEVEMENT
export function Missions() {
  const me = useStore((s) => s.me);
  const m = useAsync(() => get('/missions'), []);
  const claim = async (url: string) => {
    const r = await act(() => post(url));
    if (r) { sfx('buy'); toast(`Hadiah diklaim!${r.coins ? ` +${r.coins} koin` : ''}${r.diamonds ? ` +${r.diamonds} diamond` : ''}${r.item ? ` + item ${r.item}` : ''}`, 'reward', 4000); m.reload(); refreshMe(); }
  };
  const claimDaily = async () => { const r = await act(() => post('/daily/claim')); if (r) { sfx('buy'); toast(`Login hari ke-${r.streak}: +${r.coins} koin`, 'reward'); refreshMe(); } };
  if (m.loading) return <Loading />;
  if (m.error) return <ErrorBox error={m.error} retry={m.reload} />;
  const Row = ({ x, url }: any) => {
    const done = x.progress >= x.target;
    return (
      <div className="item">
        <div className="col grow" style={{ gap: 4 }}>
          <div className="row bold small"><span className="grow">{x.title}</span><span className="muted">{Math.min(x.progress, x.target)}/{x.target}</span></div>
          <div className="progress green"><div style={{ width: `${Math.min(100, (x.progress / x.target) * 100)}%` }} /></div>
          <div>{x.description && <span className="tiny muted">{x.description} · </span>}<RewardLine r={x} /></div>
        </div>
        {x.claimed_at ? <span className="chip green">✓ Diklaim</span> : <Btn kind={done ? 'green' : 'ghost'} size="sm" disabled={!done || (url.includes('achievements') && !x.unlocked_at)} pulse={done} onClick={() => claim(url)}>{done ? 'Klaim' : 'Proses'}</Btn>}
      </div>
    );
  };
  const by = (k: string) => m.data.missions.filter((x: any) => x.kind === k);
  return (
    <div className="page">
      <PageHead icon="📋" title="Misi & Achievement" />
      <div className="panel card-pad row wrap">
        <span style={{ fontSize: 36 }}>🎁</span><div className="grow"><b>Login harian</b><div className="small muted">Streak {me.daily.streak}/7 — hari ke-7 berhadiah 1.000 koin + diamond.</div></div>
        <Btn kind={me.daily.claimedToday ? 'ghost' : 'green'} disabled={me.daily.claimedToday} pulse={!me.daily.claimedToday} onClick={claimDaily}>{me.daily.claimedToday ? 'Sudah diklaim' : 'Klaim'}</Btn>
      </div>
      <div className="grid c2">
        <div className="panel card-pad col"><span className="ribbon" style={{ alignSelf: 'flex-start' }}>Misi Harian</span><div className="list">{by('daily').map((x: any) => <Row key={x.id} x={x} url={`/missions/${x.id}/claim`} />)}</div><div className="tiny muted">Direset setiap pukul 00.00 WIB.</div></div>
        <div className="panel card-pad col"><span className="ribbon" style={{ alignSelf: 'flex-start' }}>Misi Mingguan</span><div className="list">{by('weekly').map((x: any) => <Row key={x.id} x={x} url={`/missions/${x.id}/claim`} />)}</div><div className="tiny muted">Direset setiap Senin.</div></div>
      </div>
      {by('event').length > 0 && <div className="panel card-pad col"><span className="ribbon" style={{ alignSelf: 'flex-start' }}>Misi Event — {by('event')[0].event_name}</span><div className="list">{by('event').map((x: any) => <Row key={x.id} x={x} url={`/missions/${x.id}/claim`} />)}</div></div>}
      <div className="panel card-pad col"><span className="ribbon" style={{ alignSelf: 'flex-start' }}>Achievement</span><div className="grid c2">{m.data.achievements.map((x: any) => <Row key={x.id} x={x} url={`/achievements/${x.id}/claim`} />)}</div></div>
    </div>
  );
}

// ------------------------------------------------------------------ LEADERBOARD
export function Leaderboard() {
  const me = useStore((s) => s.me);
  const [period, setPeriod] = useState('weekly');
  const [scope, setScope] = useState('global');
  const lb = useAsync(() => get(`/leaderboard?period=${period}&scope=${scope}`), [period, scope]);
  return (
    <div className="page">
      <PageHead icon="👑" title="Peringkat" />
      <div className="row wrap">
        <Seg value={period} options={[['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan'], ['season', 'Musim'], ['all', 'Global']]} onChange={setPeriod} />
        <Seg value={scope} options={[['global', 'Semua'], ['friends', 'Teman'], ['guild', 'Guild']]} onChange={setScope} />
      </div>
      <div className="panel card-pad">
        {lb.loading ? <Loading /> : lb.error ? <ErrorBox error={lb.error} /> : scope === 'guild' ? (
          <table className="table"><thead><tr><th>#</th><th>Guild</th><th>Anggota</th><th>Poin</th></tr></thead>
            <tbody>{lb.data.rows.map((g: any, i: number) => <tr key={g.id}><td>{i + 1}</td><td><b>[{g.tag}]</b> {g.name}</td><td>{g.members}</td><td className="gold-text bold">{num(g.points)}</td></tr>)}</tbody></table>
        ) : (
          <>
            {lb.data.mine && <div className="item mb"><b>Posisimu:</b> {lb.data.mine.points} poin · {lb.data.mine.wins} menang dari {lb.data.mine.games} permainan</div>}
            <table className="table"><thead><tr><th>#</th><th>Pemain</th><th className="hide-mobile">Level</th><th>Menang</th><th>Main</th><th>Poin</th></tr></thead>
              <tbody>{lb.data.rows.map((r: any, i: number) => (
                <tr key={r.user_id} className={r.user_id === me.id ? 'me' : ''}><td style={{ fontSize: 18 }}>{['🥇', '🥈', '🥉'][i] || i + 1}</td><td><div className="row"><Avatar id={r.selected_character} /><b>{r.display_name}</b></div></td><td className="hide-mobile">{r.level}</td><td>{r.wins}</td><td>{r.games}</td><td className="gold-text bold">{num(r.points)}</td></tr>
              ))}</tbody></table>
            {!lb.data.rows.length && <div className="empty">Belum ada data untuk periode ini.</div>}
          </>
        )}
      </div>
      <div className="small muted center">Peringkat dihitung dari hasil pertandingan yang divalidasi server: menang = 10 poin + Rank Point yang diperoleh.</div>
    </div>
  );
}

// ------------------------------------------------------------------ EVENT
export function Events() {
  const ev = useAsync(() => get('/events'), []);
  const m = useAsync(() => get('/missions'), []);
  return (
    <div className="page">
      <PageHead icon="🎉" title="Event" />
      {ev.loading ? <Loading /> : (ev.data || []).map((e: any) => {
        const ms = (m.data?.missions || []).filter((x: any) => x.event_id === e.id);
        return (
          <div key={e.id} className="panel" style={{ overflow: 'hidden' }}>
            <div className="event-banner" style={{ background: `linear-gradient(120deg, ${e.color}, #2a1a5e)`, borderRadius: 0, border: 0 }}>
              <h3>🎉 {e.name}</h3><div className="bold small">{e.description}</div>
              <div className="row mt"><span className="chip">📅 {new Date(e.starts_at).toLocaleDateString('id-ID')} – {new Date(e.ends_at).toLocaleDateString('id-ID')}</span><span className="chip gold">⏳ {timeLeft(e.ends_at)}</span></div>
            </div>
            <div className="card-pad list">
              {ms.map((x: any) => <div key={x.id} className="item"><div className="grow col" style={{ gap: 4 }}><b className="small">{x.title}</b><div className="progress green"><div style={{ width: `${(x.progress / x.target) * 100}%` }} /></div><RewardLine r={x} /></div><span className="small bold">{x.progress}/{x.target}</span></div>)}
              <Btn kind="gold" onClick={() => navigate('missions')}>Klaim hadiah di menu Misi</Btn>
            </div>
          </div>
        );
      })}
      {ev.data && !ev.data.length && <div className="empty">Tidak ada event aktif saat ini. Nantikan event berikutnya!</div>}
    </div>
  );
}

// ------------------------------------------------------------------ TURNAMEN
export function Tournament() {
  const me = useStore((s) => s.me);
  const list = useAsync(() => get('/tournaments'), []);
  const [sel, setSel] = useState<string | null>(null);
  const detail = useAsync(() => (sel ? get(`/tournaments/${sel}`) : Promise.resolve(null)), [sel]);
  useEffect(() => { if (!sel && list.data?.length) setSel(list.data[0].id); }, [list.data, sel]);
  const join = async (id: string) => { if (await act(() => post(`/tournaments/${id}/join`), 'Berhasil mendaftar turnamen!')) { list.reload(); detail.reload(); refreshMe(); } };
  if (list.loading) return <Loading />;
  const t = detail.data;
  return (
    <div className="page">
      <PageHead icon="🏆" title="Turnamen"><Ticket n={me.wallet.tickets} /></PageHead>
      <div className="tabs">{(list.data || []).map((x: any) => <button key={x.id} className={`tab ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>{x.name} {x.status === 'finished' ? '(selesai)' : ''}</button>)}</div>
      {t && (
        <div className="grid c2">
          <div className="panel card-pad col">
            <div className="center" style={{ fontSize: 70 }}>🏆</div>
            <div style={{ fontSize: 24, fontWeight: 1000, textAlign: 'center' }}>{t.name}</div>
            <p className="bold small center" style={{ textAlign: 'center' }}>{t.description}</p>
            <div className="row wrap center"><span className="chip">🎟️ Biaya {t.entry_tickets} tiket</span><span className="chip gold">⏳ {t.status === 'open' ? `Berakhir ${timeLeft(t.ends_at)}` : t.status}</span><span className="chip">👥 {t.standings.length} peserta</span></div>
            <div className="col"><b>Hadiah</b>{[0, 1, 2].map((i) => <div key={i} className="item small"><span>{['🥇', '🥈', '🥉'][i]} Peringkat {i + 1}</span><span className="grow" /><Coin n={t.prize_coins[i]} /><Diamond n={t.prize_diamonds[i]} /></div>)}</div>
            {t.status === 'open' && (t.joined
              ? <Btn kind="gold" size="lg" onClick={() => quickPlay('tournament', t.id)}>⚔️ Main Pertandingan Turnamen</Btn>
              : <Btn kind="green" size="lg" disabled={me.wallet.tickets < t.entry_tickets} onClick={() => join(t.id)}>Daftar ({t.entry_tickets} tiket)</Btn>)}
            {!t.joined && me.wallet.tickets < t.entry_tickets && <div className="small muted center">Tiket kurang — dapatkan dari misi mingguan atau tukar diamond di Toko.</div>}
          </div>
          <div className="panel card-pad col">
            <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Klasemen</span>
            <table className="table"><thead><tr><th>#</th><th>Pemain</th><th>Main</th><th>Menang</th><th>Poin</th></tr></thead>
              <tbody>{t.standings.map((s: any, i: number) => <tr key={s.user_id} className={s.user_id === me.id ? 'me' : ''}><td>{i + 1}</td><td><div className="row"><Avatar id={s.selected_character} />{s.display_name}</div></td><td>{s.games}</td><td>{s.wins}</td><td className="gold-text bold">{s.points}</td></tr>)}</tbody></table>
            {!t.standings.length && <div className="empty">Belum ada peserta.</div>}
            <div className="tiny muted">Poin: menang 3, posisi kedua 1. Hadiah dikirim ke Inbox saat turnamen selesai.</div>
          </div>
        </div>
      )}
      {list.data && !list.data.length && <div className="empty">Belum ada turnamen.</div>}
    </div>
  );
}

// ------------------------------------------------------------------ ADVENTURE NUSANTARA
const REGION_ICON: Record<string, string> = { Sumatera: '🌋', Jawa: '🛕', Kalimantan: '🌳', Sulawesi: '⛵', 'Bali & Nusa Tenggara': '🦎', 'Maluku & Papua': '🐠' };
export function Adventure() {
  const st = useAsync(() => get('/adventure'), []);
  const start = async (id: string) => {
    const r = await emit('adventure:start', { stageId: id });
    if (!r.ok) return toast(r.error, 'error');
    setState({ chat: [] }); navigate('game');
  };
  if (st.loading) return <Loading />;
  if (st.error) return <ErrorBox error={st.error} retry={st.reload} />;
  const regions = [...new Set(st.data.map((s: any) => s.region))] as string[];
  const total = st.data.reduce((n: number, s: any) => n + s.stars, 0);
  return (
    <div className="page">
      <PageHead icon="🗺️" title="Adventure Nusantara"><span className="stars">★ {total}/{st.data.length * 3}</span></PageHead>
      <div className="panel card-pad small bold">Jelajahi pulau-pulau Indonesia! Setiap stage adalah permainan melawan bot dengan tujuan khusus. Bintang: ★ menang sesuai tujuan · ★★ dalam ≤60 ronde · ★★★ dalam ≤35 ronde. Hadiah eksklusif diberikan saat stage pertama kali diselesaikan.</div>
      {regions.map((reg) => (
        <div key={reg} className="panel card-pad col">
          <div className="row"><span style={{ fontSize: 30 }}>{REGION_ICON[reg] || '🏝️'}</span><b style={{ fontSize: 20 }}>{reg}</b></div>
          <div className="grid c2">
            {st.data.filter((s: any) => s.region === reg).map((s: any) => (
              <div key={s.id} className={`item stage-node ${s.unlocked ? '' : 'locked'}`}>
                <div className="col grow" style={{ gap: 4 }}>
                  <b>Stage {s.stage_no}: {s.title}</b>
                  <div className="small">{s.description}</div>
                  <div className="row wrap gap-s"><span className="chip">🤖 {s.bots} bot {({ easy: 'mudah', normal: 'normal', hard: 'sulit' } as any)[s.bot_level]}</span><RewardLine r={{ reward_coins: s.reward_coins, reward_xp: s.reward_xp, reward_item: s.reward_item }} /></div>
                  <span className="stars">{'★'.repeat(s.stars)}{'☆'.repeat(3 - s.stars)}</span>
                </div>
                {s.unlocked ? <Btn kind={s.completed_at ? 'ghost' : 'gold'} onClick={() => start(s.id)}>{s.completed_at ? 'Ulangi' : 'Mulai'}</Btn> : <span className="chip">🔒 Terkunci</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ TEMAN
export function Friends() {
  const me = useStore((s) => s.me);
  const f = useAsync(() => get('/friends'), []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [dm, setDm] = useState<any>(null);
  const [view, setView] = useState<any>(null);
  useEffect(() => { const h = () => f.reload(); window.addEventListener('mi:social', h); return () => window.removeEventListener('mi:social', h); }, []);
  const search = async () => { if (q.trim().length < 2) return; setFound(await get(`/players/search/${encodeURIComponent(q.trim())}`).catch(() => [])); };
  const add = async (id: string) => { if (await act(() => post('/friends/request', { userId: id }), 'Permintaan pertemanan terkirim.')) f.reload(); };
  if (f.loading) return <Loading />;
  if (f.error) return <ErrorBox error={f.error} retry={f.reload} />;
  const d = f.data;
  return (
    <div className="page">
      <PageHead icon="👥" title="Teman"><span className="chip">{d.friends.filter((x: any) => x.online).length} online</span></PageHead>
      <div className="grid c2">
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Daftar Teman ({d.friends.length})</span>
          <div className="list">
            {d.friends.map((x: any) => (
              <div key={x.id} className="item">
                <Avatar id={x.selected_character} />
                <div className="grow"><div className="bold">{x.display_name}</div><div className="small muted">Lv. {x.level} · {x.online ? (x.inRoom ? '🎲 Sedang bermain' : '🟢 Online') : `⚪ ${x.last_seen_at ? `terakhir ${ago(x.last_seen_at)}` : 'Offline'}`}</div></div>
                <Btn kind="blue" size="xs" onClick={() => setDm(x)}>💬</Btn>
                <Btn kind="ghost" size="xs" onClick={() => setView(x)}>⋯</Btn>
              </div>
            ))}
            {!d.friends.length && <div className="empty">Belum ada teman. Cari pemain dengan username!</div>}
          </div>
        </div>
        <div className="col">
          <div className="panel card-pad col">
            <b>Cari pemain</b>
            <div className="row"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Username atau nama" /><Btn kind="blue" onClick={search}>Cari</Btn></div>
            <div className="list">{found.map((p) => <div key={p.id} className="item"><Avatar id={p.selected_character} /><div className="grow"><b>{p.display_name}</b><div className="small muted">@{p.username} · Lv. {p.level}</div></div><Btn kind="green" size="xs" onClick={() => add(p.id)}>+ Tambah</Btn></div>)}</div>
          </div>
          <div className="panel card-pad col">
            <b>Permintaan masuk ({d.incoming.length})</b>
            {d.incoming.map((x: any) => <div key={x.id} className="item"><Avatar id={x.selected_character} /><b className="grow">{x.display_name}</b><Btn kind="green" size="xs" onClick={async () => { if (await act(() => post(`/friends/${x.id}/accept`), 'Pertemanan diterima!')) f.reload(); }}>Terima</Btn><Btn kind="ghost" size="xs" onClick={async () => { await act(() => api('DELETE', `/friends/${x.id}`)); f.reload(); }}>Tolak</Btn></div>)}
            {d.outgoing.length > 0 && <div className="small muted">Menunggu: {d.outgoing.map((x: any) => x.display_name).join(', ')}</div>}
            {d.blocked.length > 0 && <div className="small muted">Diblokir: {d.blocked.map((b: any) => <span key={b.id} className="chip" style={{ cursor: 'pointer' }} onClick={async () => { await act(() => api('DELETE', `/block/${b.id}`), 'Blokir dibuka.'); f.reload(); }}>{b.display_name} ✕</span>)}</div>}
          </div>
        </div>
      </div>
      {dm && <DmModal friend={dm} meId={me.id} onClose={() => setDm(null)} />}
      {view && <PlayerActions p={view} onClose={() => { setView(null); f.reload(); }} />}
    </div>
  );
}

function DmModal({ friend, meId, onClose }: any) {
  const msgs = useAsync(() => get(`/dm/${friend.other_id}`), []);
  const [text, setText] = useState('');
  useEffect(() => { const h = (e: any) => { if (e.detail.from === friend.other_id) msgs.setData((m: any) => [...(m || []), e.detail]); }; window.addEventListener('mi:dm', h); return () => window.removeEventListener('mi:dm', h); }, []);
  const send = async (e: any) => { e.preventDefault(); if (!text.trim()) return; const m = await act(() => post(`/dm/${friend.other_id}`, { text })); if (m) { msgs.setData((x: any) => [...(x || []), m]); setText(''); } };
  return (
    <Modal title={`💬 ${friend.display_name}`} onClose={onClose}>
      <div className="chat-msgs" style={{ height: 280 }}>{(msgs.data || []).map((m: any) => <div key={m.id} className="m" style={{ textAlign: m.sender_id === meId ? 'right' : 'left' }}><b>{m.sender_id === meId ? 'Kamu' : m.sender_name}:</b> {m.body}</div>)}</div>
      <form className="chat-input" onSubmit={send}><input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Tulis pesan..." /><Btn kind="blue" size="sm" type="submit">Kirim</Btn></form>
    </Modal>
  );
}

function PlayerActions({ p, onClose }: any) {
  const id = p.other_id || p.user_id || p.id;
  const prof = useAsync(() => get(`/players/${id}`), []);
  const [reason, setReason] = useState('toxic');
  return (
    <Modal title="Profil Pemain" onClose={onClose}>
      {prof.data && <div className="col center" style={{ textAlign: 'center' }}>
        <Avatar id={prof.data.selected_character} size="xl" />
        <b style={{ fontSize: 20 }}>{prof.data.display_name}</b>
        <div className="small muted">@{prof.data.username} · Lv. {prof.data.level} · {prof.data.title}</div>
        <div className="row wrap center"><span className="chip">🎲 {prof.data.games_played} main</span><span className="chip">🏆 {prof.data.wins} menang</span><span className="chip">🏅 {prof.data.rank_points} RP</span></div>
        {prof.data.achievements?.length > 0 && <div className="small">🎖️ {prof.data.achievements.join(' · ')}</div>}
        {p.id && p.status && <Btn kind="ghost" size="sm" onClick={async () => { await act(() => api('DELETE', `/friends/${p.id}`), 'Pertemanan dihapus.'); onClose(); }}>Hapus teman</Btn>}
        <div className="row"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="toxic">Perilaku kasar</option><option value="spam">Spam</option><option value="cheat">Curang</option><option value="nama_tidak_pantas">Nama tidak pantas</option><option value="lainnya">Lainnya</option></select>
          <Btn kind="gold" size="sm" onClick={async () => { await act(() => post('/report', { userId: id, reason }), 'Laporan terkirim ke moderator. Terima kasih!'); }}>Laporkan</Btn></div>
        <Btn kind="" size="sm" onClick={async () => { await act(() => post('/block', { userId: id }), 'Pemain diblokir.'); onClose(); }}>🚫 Blokir</Btn>
      </div>}
    </Modal>
  );
}

// ------------------------------------------------------------------ GUILD
export function Guild() {
  const me = useStore((s) => s.me);
  const list = useAsync(() => get('/guilds'), []);
  const mine = useAsync(() => (me.guild ? get(`/guilds/${me.guild.id}`) : Promise.resolve(null)), [me.guild?.id]);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', description: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { const h = (e: any) => mine.setData((g: any) => (g ? { ...g, chat: [...g.chat, e.detail] } : g)); window.addEventListener('mi:guild', h); return () => window.removeEventListener('mi:guild', h); }, []);
  const doCreate = async () => { if (await act(() => post('/guilds', form), 'Guild didirikan!')) { setCreate(false); refreshMe(); list.reload(); } };
  const join = async (id: string) => { if (await act(() => post(`/guilds/${id}/join`), 'Bergabung dengan guild!')) refreshMe(); };
  const leave = async () => { if (confirm('Keluar dari guild?') && await act(() => post('/guilds/leave'), 'Keluar dari guild.')) refreshMe(); };
  const g = mine.data;
  return (
    <div className="page">
      <PageHead icon="🛡️" title="Guild & Komunitas">{!me.guild && <Btn kind="gold" size="sm" onClick={() => setCreate(true)}>+ Dirikan Guild</Btn>}</PageHead>
      {g && (
        <div className="grid c2">
          <div className="panel card-pad col">
            <div className="row"><span style={{ fontSize: 46 }}>🛡️</span><div className="grow"><div style={{ fontSize: 24, fontWeight: 1000 }}>[{g.tag}] {g.name}</div><div className="small muted">{g.description || 'Tanpa deskripsi'}</div></div><span className="chip gold">{num(g.points)} poin</span></div>
            <b>Anggota ({g.members.length}/{g.max_members})</b>
            <div className="list" style={{ maxHeight: 300, overflowY: 'auto' }}>{g.members.map((m: any) => <div key={m.user_id} className="item"><Avatar id={m.selected_character} /><div className="grow"><b>{m.display_name}</b> {m.role === 'owner' && '👑'}<div className="small muted">Lv. {m.level} · {m.rank_points} RP</div></div><span>{m.online ? '🟢' : '⚪'}</span></div>)}</div>
            <Btn kind="ghost" size="sm" onClick={leave}>Keluar dari guild</Btn>
          </div>
          <div className="panel col" style={{ overflow: 'hidden' }}>
            <div className="panel-title">💬 Obrolan Guild</div>
            <div className="chat-msgs" style={{ height: 380 }}>{g.chat.map((m: any) => <div key={m.id} className="m"><b>{m.sender_name}:</b> {m.body}</div>)}</div>
            <form className="chat-input" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; if (await act(() => post(`/guilds/${g.id}/chat`, { text: msg }))) setMsg(''); }}><input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={200} placeholder="Pesan untuk guild..." /><Btn kind="blue" size="sm" type="submit">Kirim</Btn></form>
          </div>
        </div>
      )}
      <div className="panel card-pad col">
        <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Daftar Guild</span>
        <div className="list">
          {(list.data || []).map((x: any) => <div key={x.id} className="item"><span style={{ fontSize: 26 }}>🛡️</span><div className="grow"><b>[{x.tag}] {x.name}</b><div className="small muted">{x.description}</div></div><span className="chip">{x.members}/{x.max_members}</span><span className="chip gold">{num(x.points)}</span>{!me.guild && <Btn kind="green" size="xs" onClick={() => join(x.id)}>Gabung</Btn>}</div>)}
          {list.data && !list.data.length && <div className="empty">Belum ada guild. Jadilah pendiri pertama!</div>}
        </div>
      </div>
      {create && (
        <Modal title="Dirikan Guild" onClose={() => setCreate(false)}>
          <div className="col">
            <label className="field">Nama guild<input className="input" maxLength={24} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field">Tag (2–5 huruf)<input className="input" maxLength={5} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} /></label>
            <label className="field">Deskripsi<textarea className="input" rows={2} maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <Btn kind="gold" onClick={doCreate}>Dirikan (<Coin n={5000} />)</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ INBOX
export function Inbox() {
  const inbox = useAsync(() => get('/inbox'), []);
  const claim = async (id: number) => { const r = await act(() => post(`/inbox/${id}/claim`)); if (r) { sfx('buy'); toast('Hadiah diklaim!', 'reward'); inbox.reload(); refreshMe(); } };
  const read = async (m: any) => { if (!m.read_at) { await post(`/inbox/${m.id}/read`).catch(() => {}); inbox.reload(); refreshMe(); } };
  const ICON: any = { system: '📢', reward: '🎁', invite: '🎲', friend: '👥', tournament: '🏆', admin: '🛡️' };
  return (
    <div className="page">
      <PageHead icon="✉️" title="Inbox & Notifikasi"><Btn kind="ghost" size="sm" onClick={async () => { await post('/inbox/read-all'); inbox.reload(); refreshMe(); }}>Tandai semua dibaca</Btn></PageHead>
      {inbox.loading ? <Loading /> : (
        <div className="list">
          {(inbox.data || []).map((m: any) => (
            <div key={m.id} className="item" style={{ opacity: m.read_at ? 0.75 : 1, borderColor: m.read_at ? undefined : '#f2c14e' }} onClick={() => read(m)}>
              <span style={{ fontSize: 28 }}>{ICON[m.kind] || '✉️'}</span>
              <div className="grow"><div className="bold">{m.title} {!m.read_at && <span className="chip red">Baru</span>}</div><div className="small">{m.body}</div><div className="tiny muted">{ago(m.created_at)}</div>
                {m.reward && <div className="row gap-s mt">{m.reward.coins > 0 && <Coin n={m.reward.coins} />}{m.reward.diamonds > 0 && <Diamond n={m.reward.diamonds} />}{m.reward.tickets > 0 && <Ticket n={m.reward.tickets} />}{m.reward.item && <span className="chip">🎁 {m.reward.item}</span>}</div>}
              </div>
              {m.reward && (m.claimed_at ? <span className="chip green">✓</span> : <Btn kind="green" size="sm" onClick={(e: any) => { e.stopPropagation(); claim(m.id); }}>Klaim</Btn>)}
              {m.kind === 'invite' && m.data?.code && <Btn kind="blue" size="sm" onClick={async (e: any) => { e.stopPropagation(); const r = await emit('room:join', { code: m.data.code }); if (r.ok) { setState({ chat: [] }); navigate('room'); } else toast(r.error, 'error'); }}>Gabung</Btn>}
              {m.kind === 'friend' && <Btn kind="ghost" size="sm" onClick={() => navigate('friends')}>Lihat</Btn>}
            </div>
          ))}
          {inbox.data && !inbox.data.length && <div className="empty">Inbox kosong.</div>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ PENGATURAN
export function Settings() {
  const me = useStore((s) => s.me);
  const st = useStore((s) => s.settings);
  const set = (k: string, v: any) => setState((s) => ({ settings: { ...s.settings, [k]: v } }));
  const [up, setUp] = useState({ username: '', password: '', email: '' });
  const logout = async () => { await post('/auth/logout').catch(() => {}); logoutLocal(); };
  return (
    <div className="page">
      <PageHead icon="⚙️" title="Pengaturan" />
      <div className="grid c2">
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Audio</span>
          <div className="row"><span className="bold grow">Bisukan semua suara</span><Toggle on={st.muted} onChange={(v) => set('muted', v)} /></div>
          <label className="field">Musik & ambien ({Math.round(st.music * 100)}%)<input type="range" min={0} max={1} step={0.05} value={st.music} onChange={(e) => set('music', Number(e.target.value))} /></label>
          <label className="field">Efek suara ({Math.round(st.sfx * 100)}%)<input type="range" min={0} max={1} step={0.05} value={st.sfx} onChange={(e) => { set('sfx', Number(e.target.value)); sfx('coin'); }} /></label>
        </div>
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Grafis & Kamera</span>
          <div className="row wrap"><span className="bold" style={{ width: 120 }}>Kualitas</span><Seg value={st.graphics} options={[['low', 'Rendah'], ['medium', 'Sedang'], ['high', 'Tinggi']]} onChange={(v) => set('graphics', v)} /></div>
          <div className="tiny muted">Rendah: tanpa bayangan & dekorasi minimal (untuk HP spesifikasi menengah). Tinggi: bayangan halus & tekstur 4K.</div>
          <div className="row wrap"><span className="bold" style={{ width: 120 }}>Kamera</span><Seg value={st.camera} options={[['follow', 'Ikuti pion'], ['free', 'Bebas']]} onChange={(v) => set('camera', v)} /></div>
          <div className="row"><span className="bold grow">Animasi dipercepat</span><Toggle on={st.reducedMotion} onChange={(v) => set('reducedMotion', v)} /></div>
        </div>
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Akun</span>
          <div className="small">Masuk sebagai <b>@{me.username}</b> ({me.provider === 'guest' ? 'akun tamu' : me.provider === 'supabase' ? 'Google' : 'akun lokal'})</div>
          {me.provider === 'guest' && (
            <div className="col">
              <div className="small bold gold-text">Simpan progresmu dengan membuat akun permanen:</div>
              <input className="input" placeholder="Username baru" value={up.username} onChange={(e) => setUp({ ...up, username: e.target.value })} />
              <input className="input" type="password" placeholder="Password (min. 8)" value={up.password} onChange={(e) => setUp({ ...up, password: e.target.value })} />
              <input className="input" type="email" placeholder="Email (opsional)" value={up.email} onChange={(e) => setUp({ ...up, email: e.target.value })} />
              <Btn kind="green" onClick={async () => { if (await act(() => post('/auth/upgrade', up), 'Akun permanen dibuat!')) refreshMe(); }}>Jadikan Akun Permanen</Btn>
            </div>
          )}
          <Btn kind="" onClick={logout}>Keluar</Btn>
        </div>
        <div className="panel card-pad col">
          <span className="ribbon" style={{ alignSelf: 'flex-start' }}>Tentang</span>
          <div className="bold">Monopoli Indonesia v2.0</div>
          <div className="small muted">Game papan strategi bertema Nusantara. Semua karakter, papan, ikon, musik, dan efek suara dibuat secara orisinal dan prosedural. Hasil dadu & seluruh transaksi divalidasi server.</div>
          <div className="small"><b>Cara main singkat:</b> lempar dadu, beli kota, kuasai satu kelompok warna untuk membangun rumah & hotel, tagih sewa, dan buat lawan bangkrut!</div>
          {me.adminRole && <Btn kind="purple" onClick={() => { location.href = '/admin'; }}>Buka Admin Dashboard</Btn>}
        </div>
      </div>
    </div>
  );
}
