// Monopoli Indonesia — data papan 40 petak.
// Skala ekonomi: 1 unit klasik = Rp10.000. Saldo awal Rp15.000.000, gaji START Rp2.000.000.

export const RP = 10000;

export const GROUPS = {
  coklat:    { id: 'coklat',    name: 'Papua & Maluku',     color: '#8d5a3b', house: 50 * RP },
  biruMuda:  { id: 'biruMuda',  name: 'Nusa Tenggara',      color: '#5ec8f2', house: 50 * RP },
  merahMuda: { id: 'merahMuda', name: 'Kalimantan',         color: '#e0529c', house: 100 * RP },
  oranye:    { id: 'oranye',    name: 'Sulawesi',           color: '#f39221', house: 100 * RP },
  merah:     { id: 'merah',     name: 'Sumatera',           color: '#e23b3b', house: 150 * RP },
  kuning:    { id: 'kuning',    name: 'Jawa Timur & Bali',  color: '#f5cf2a', house: 150 * RP },
  hijau:     { id: 'hijau',     name: 'Jawa Tengah & DIY',  color: '#22a356', house: 200 * RP },
  biruTua:   { id: 'biruTua',   name: 'Jawa Barat & DKI',   color: '#1f4fbf', house: 200 * RP },
};

const r = (arr) => arr.map((v) => v * RP);
const P = (name, group, price, rent, region, landmark) =>
  ({ type: 'property', name, group, price: price * RP, rent: r(rent), mortgage: (price * RP) / 2, region, landmark });

export const TILES = [
  { type: 'start', name: 'START', desc: 'Terima Rp2.000.000 setiap melewati START.' },
  P('Jayapura', 'coklat', 60, [2, 10, 30, 90, 160, 250], 'Papua', 'Danau Sentani'),
  { type: 'chest', name: 'Dana Umum' },
  P('Ambon', 'coklat', 60, [4, 20, 60, 180, 320, 450], 'Maluku', 'Pantai Natsepa'),
  { type: 'tax', name: 'Pajak Penghasilan', amount: 200 * RP },
  { type: 'transport', name: 'Stasiun Gambir', price: 200 * RP, mortgage: 100 * RP, landmark: 'Kereta api' },
  P('Kupang', 'biruMuda', 100, [6, 30, 90, 270, 400, 550], 'NTT', 'Pantai Lasiana'),
  { type: 'chance', name: 'Kesempatan' },
  P('Labuan Bajo', 'biruMuda', 100, [6, 30, 90, 270, 400, 550], 'NTT', 'Pulau Komodo'),
  P('Mataram', 'biruMuda', 120, [8, 40, 100, 300, 450, 600], 'NTB', 'Gunung Rinjani'),
  { type: 'jail', name: 'Penjara', desc: 'Hanya berkunjung, atau ditahan.' },
  P('Pontianak', 'merahMuda', 140, [10, 50, 150, 450, 625, 750], 'Kalimantan Barat', 'Tugu Khatulistiwa'),
  { type: 'utility', name: 'Pembangkit Listrik', price: 150 * RP, mortgage: 75 * RP, landmark: 'Listrik' },
  P('Banjarmasin', 'merahMuda', 140, [10, 50, 150, 450, 625, 750], 'Kalimantan Selatan', 'Pasar Terapung'),
  P('Balikpapan', 'merahMuda', 160, [12, 60, 180, 500, 700, 900], 'Kalimantan Timur', 'Rumah Betang'),
  { type: 'transport', name: 'Pelabuhan Tanjung Perak', price: 200 * RP, mortgage: 100 * RP, landmark: 'Kapal pinisi' },
  P('Palu', 'oranye', 180, [14, 70, 200, 550, 750, 950], 'Sulawesi Tengah', 'Jembatan Kuning'),
  { type: 'chest', name: 'Dana Umum' },
  P('Manado', 'oranye', 180, [14, 70, 200, 550, 750, 950], 'Sulawesi Utara', 'Bunaken'),
  P('Makassar', 'oranye', 200, [16, 80, 220, 600, 800, 1000], 'Sulawesi Selatan', 'Benteng Rotterdam'),
  { type: 'parking', name: 'Bebas Parkir', desc: 'Istirahat sejenak. Tidak terjadi apa-apa.' },
  P('Padang', 'merah', 220, [18, 90, 250, 700, 875, 1050], 'Sumatera Barat', 'Jam Gadang'),
  { type: 'budaya', name: 'Kartu Budaya' },
  P('Palembang', 'merah', 220, [18, 90, 250, 700, 875, 1050], 'Sumatera Selatan', 'Jembatan Ampera'),
  P('Medan', 'merah', 240, [20, 100, 300, 750, 925, 1100], 'Sumatera Utara', 'Danau Toba'),
  { type: 'transport', name: 'Bandara Ngurah Rai', price: 200 * RP, mortgage: 100 * RP, landmark: 'Pesawat' },
  P('Malang', 'kuning', 260, [22, 110, 330, 800, 975, 1150], 'Jawa Timur', 'Gunung Bromo'),
  P('Denpasar', 'kuning', 260, [22, 110, 330, 800, 975, 1150], 'Bali', 'Pura'),
  { type: 'utility', name: 'Perusahaan Air Minum', price: 150 * RP, mortgage: 75 * RP, landmark: 'Air bersih' },
  P('Surabaya', 'kuning', 280, [24, 120, 360, 850, 1025, 1200], 'Jawa Timur', 'Tugu Pahlawan'),
  { type: 'gotojail', name: 'Masuk Penjara' },
  P('Solo', 'hijau', 300, [26, 130, 390, 900, 1100, 1275], 'Jawa Tengah', 'Keraton Surakarta'),
  P('Semarang', 'hijau', 300, [26, 130, 390, 900, 1100, 1275], 'Jawa Tengah', 'Lawang Sewu'),
  { type: 'chest', name: 'Dana Umum' },
  P('Yogyakarta', 'hijau', 320, [28, 150, 450, 1000, 1200, 1400], 'DI Yogyakarta', 'Candi Prambanan'),
  { type: 'transport', name: 'Stasiun Tugu', price: 200 * RP, mortgage: 100 * RP, landmark: 'Kereta api' },
  { type: 'chance', name: 'Kesempatan' },
  P('Bandung', 'biruTua', 350, [35, 175, 500, 1100, 1300, 1500], 'Jawa Barat', 'Gedung Sate'),
  { type: 'tax', name: 'Pajak Barang Mewah', amount: 100 * RP },
  P('Jakarta', 'biruTua', 400, [50, 200, 600, 1400, 1700, 2000], 'DKI Jakarta', 'Monas'),
].map((t, i) => ({ ...t, i }));

export const TRANSPORT_RENT = [25 * RP, 50 * RP, 100 * RP, 200 * RP];
export const UTILITY_MULT = [4 * RP, 10 * RP]; // sewa = total dadu x pengali
export const JAIL_INDEX = 10;
export const JAIL_FINE = 50 * RP;
export const MAX_HOUSES = 32;
export const MAX_HOTELS = 12;

export const BUYABLE = new Set(['property', 'transport', 'utility']);

export function groupTiles(group) {
  return TILES.filter((t) => t.group === group).map((t) => t.i);
}

export function formatRp(n) {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-Rp' : 'Rp') + s;
}
