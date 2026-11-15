// Sinkronisasi konten papan & kartu dari database ke engine (hasil edit Admin Dashboard).
// Engine membaca TILES/CARDS dari modul bersama; di sini nilainya diperbarui in-place saat boot/edit.
import { many } from '../db/index.js';
import { TILES, CARDS, GROUPS } from '../../../shared/src/index.js';

// full=false: hanya teks (nama, landmark, judul kartu) yang diterapkan langsung; harga/sewa/nilai kartu
// diterapkan saat server dimulai ulang agar permainan yang sedang berjalan tidak berubah aturannya di tengah jalan.
export async function loadContentOverrides({ full = true } = {}) {
  const groups = await many(`SELECT * FROM property_groups`);
  for (const g of groups) if (GROUPS[g.id]) Object.assign(GROUPS[g.id], full ? { name: g.name, color: g.color, house: g.house_price } : { name: g.name });
  const props = await many(`SELECT * FROM properties ORDER BY id`);
  for (const p of props) {
    const t = TILES[p.id];
    if (!t || t.type !== p.type) continue;
    t.name = p.name;
    if (p.region) t.region = p.region;
    if (p.landmark) t.landmark = p.landmark;
    if (!full) continue;
    if (p.price) { t.price = p.price; t.mortgage = p.mortgage || Math.round(p.price / 2); }
    if (p.rent && p.rent.length === 6) t.rent = p.rent.map(Number);
    if (p.tax_amount) t.amount = p.tax_amount;
  }
  const cards = await many(`SELECT * FROM game_cards`);
  for (const c of cards) {
    const deck = CARDS[c.deck_id];
    const card = deck?.find((x) => x.id === c.id);
    if (!card) continue;
    card.title = c.title; card.text = c.body;
    if (full && c.effect && c.effect.kind === card.effect.kind) card.effect = c.effect;
  }
}

/** Data papan untuk klien (agar tampilan selalu sesuai konfigurasi server). */
export function boardPayload() {
  return { tiles: TILES, groups: GROUPS, cards: CARDS };
}
