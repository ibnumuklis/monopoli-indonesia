// Seed data katalog (idempoten): papan, kartu, karakter, skin, misi, achievement, stage adventure, pengaturan.
import { q } from './index.js';
import { TILES, GROUPS, CARDS, DECK_NAMES, CHARACTERS, SKINS, MISSIONS, ACHIEVEMENTS, ADVENTURE_STAGES } from '../../../shared/src/index.js';

export async function seed() {
  for (const g of Object.values(GROUPS)) {
    await q(`INSERT INTO property_groups(id,name,color,house_price) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [g.id, g.name, g.color, g.house]);
  }
  for (const t of TILES) {
    await q(`INSERT INTO properties(id,name,type,group_id,price,rent,mortgage,tax_amount,region,landmark)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [t.i, t.name, t.type, t.group || null, t.price || null, t.rent || null, t.mortgage || null, t.amount || null, t.region || null, t.landmark || null]);
  }
  for (const [id, name] of Object.entries(DECK_NAMES)) await q(`INSERT INTO card_decks(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, name]);
  for (const [deck, cards] of Object.entries(CARDS)) {
    for (const c of cards) await q(`INSERT INTO game_cards(id,deck_id,title,body,effect) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, [c.id, deck, c.title, c.text, c.effect]);
  }
  let n = 0;
  for (const c of CHARACTERS) {
    await q(`INSERT INTO characters(id,name,region,gender,outfit,description,rarity,unlock_type,price_coins,price_diamonds,palette,sort_order)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name, c.region, c.gender, c.outfit, c.description, c.rarity, c.unlock_type, c.price_coins, c.price_diamonds, c.palette, n++]);
  }
  n = 0;
  for (const s of SKINS) {
    await q(`INSERT INTO character_skins(id,kind,name,description,unlock_type,price_coins,price_diamonds,data,sort_order)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.kind, s.name, s.description, s.unlock_type, s.price_coins, s.price_diamonds, s.data, n++]);
  }
  n = 0;
  for (const m of MISSIONS) {
    await q(`INSERT INTO missions(id,kind,title,metric,target,reward_coins,reward_diamonds,reward_xp,reward_tickets,reward_item,sort_order)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.kind, m.title, m.metric, m.target, m.reward_coins || 0, m.reward_diamonds || 0, m.reward_xp || 0, m.reward_tickets || 0, m.reward_item || null, n++]);
  }
  n = 0;
  for (const a of ACHIEVEMENTS) {
    await q(`INSERT INTO achievements(id,title,description,metric,target,reward_coins,reward_diamonds,reward_item,sort_order)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.title, a.description, a.metric, a.target, a.reward_coins || 0, a.reward_diamonds || 0, a.reward_item || null, n++]);
  }
  n = 0;
  for (const s of ADVENTURE_STAGES) {
    await q(`INSERT INTO adventure_stages(id,region,stage_no,title,description,objective,bots,bot_level,reward_coins,reward_xp,reward_item,sort_order)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.region, s.stage_no, s.title, s.description, s.objective, s.bots, s.bot_level, s.reward_coins, s.reward_xp, s.reward_item || null, n++]);
  }
  const settings = {
    economy: { winCoins: 500, placeCoins: [500, 250, 150, 100], winXp: 120, playXp: 60, winRp: 25, lossRp: -12, dailyLogin: [100, 150, 200, 250, 300, 400, 1000], dailyLoginDiamondDay7: 10, guildCreateCost: 5000, startCoins: 2000, startDiamonds: 30, startTickets: 2 },
    maintenance: { enabled: false, message: '' },
    motd: { text: 'Selamat datang di Monopoli Indonesia! Jelajahi Nusantara, bangun kerajaan bisnismu.' },
  };
  for (const [k, v] of Object.entries(settings)) await q(`INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]);
  // Event & turnamen bawaan agar menu tidak kosong pada instalasi baru
  const ev = await q(`SELECT count(*)::int AS n FROM live_events`);
  if (ev.rows[0].n === 0) {
    const e = await q(`INSERT INTO live_events(name,description,color,starts_at,ends_at) VALUES
      ('Festival Nusantara','Kumpulkan kemenangan selama festival dan dapatkan karakter eksklusif Mutiara dari Maluku!','#c43b52', now() - interval '1 day', now() + interval '30 days') RETURNING id`);
    const eid = e.rows[0].id;
    await q(`INSERT INTO missions(id,kind,event_id,title,metric,target,reward_coins,reward_diamonds,reward_xp,reward_item,sort_order) VALUES
      ('e_fest_play5','event',$1,'Main 5 permainan selama festival','games',5,800,0,150,'emote_merdeka',100),
      ('e_fest_win3','event',$1,'Menang 3 kali selama festival','wins',3,1000,20,200,'mutiara',101),
      ('e_fest_buy10','event',$1,'Beli 10 properti selama festival','bought',10,600,0,120,'pawn_merahputih',102)
      ON CONFLICT (id) DO NOTHING`, [eid]);
  }
  const tr = await q(`SELECT count(*)::int AS n FROM tournaments`);
  if (tr.rows[0].n === 0) {
    await q(`INSERT INTO tournaments(name,description,status,entry_tickets,ends_at) VALUES
      ('Turnamen Nasional Mingguan','Kumpulkan poin dari pertandingan turnamen. Menang = 3 poin, posisi 2 = 1 poin. 3 besar mendapat hadiah.','open',1, now() + interval '7 days')`);
  }
}
