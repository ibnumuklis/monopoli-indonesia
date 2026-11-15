// Katalog konten original: karakter, skin pion, skin dadu, emote, misi, achievement, stage Adventure.
// Karakter terinspirasi pakaian adat Nusantara, digambar secara prosedural (Three.js) — tanpa aset pihak ketiga.

export const CHARACTERS = [
  { id: 'bima', name: 'Bima', region: 'Jawa', gender: 'pria', outfit: 'Beskap & blangkon', rarity: 'biasa', unlock_type: 'free', price_coins: 0, price_diamonds: 0,
    description: 'Pemuda Solo yang tenang dan penuh perhitungan. Mewarisi toko batik keluarga.',
    palette: { skin: '#c98e62', body: '#20305f', accent: '#d9a441', hat: 'blangkon', hatColor: '#6b3b1f', hair: '#1c120c', lower: '#7a4b2a' } },
  { id: 'sekar', name: 'Sekar', region: 'Jawa', gender: 'wanita', outfit: 'Kebaya & sanggul', rarity: 'biasa', unlock_type: 'free', price_coins: 0, price_diamonds: 0,
    description: 'Pengusaha kuliner dari Yogyakarta. Gudeg buatannya terkenal sampai luar pulau.',
    palette: { skin: '#d6a07a', body: '#c43b52', accent: '#f2c75c', hat: 'sanggul', hatColor: '#1c120c', hair: '#1c120c', lower: '#5b3a29' } },
  { id: 'ucok', name: 'Ucok', region: 'Sumatera Utara', gender: 'pria', outfit: 'Ulos & bulang', rarity: 'biasa', unlock_type: 'free', price_coins: 0, price_diamonds: 0,
    description: 'Pedagang lincah dari Medan, jago negosiasi dan bersuara lantang.',
    palette: { skin: '#b97f55', body: '#7b1e22', accent: '#e8c15a', hat: 'bulang', hatColor: '#7b1e22', hair: '#1c120c', lower: '#2b2b2b' } },
  { id: 'siti', name: 'Siti', region: 'Sumatera Barat', gender: 'wanita', outfit: 'Baju kurung & suntiang', rarity: 'langka', unlock_type: 'shop', price_coins: 6000, price_diamonds: 0,
    description: 'Arsitek muda dari Bukittinggi yang mencintai rumah gadang.',
    palette: { skin: '#d9a77f', body: '#b3122e', accent: '#f5c842', hat: 'suntiang', hatColor: '#f5c842', hair: '#1c120c', lower: '#b3122e' } },
  { id: 'daeng', name: 'Daeng', region: 'Sulawesi Selatan', gender: 'pria', outfit: 'Jas tutup & songkok recca', rarity: 'langka', unlock_type: 'shop', price_coins: 6000, price_diamonds: 0,
    description: 'Pelaut Makassar yang membangun armada pinisi dagang.',
    palette: { skin: '#b5794f', body: '#1c4f8f', accent: '#e9c25d', hat: 'songkok', hatColor: '#d9b04a', hair: '#1c120c', lower: '#3b2a5c' } },
  { id: 'ayu', name: 'Ayu', region: 'Bali', gender: 'wanita', outfit: 'Kebaya Bali & bunga jepun', rarity: 'langka', unlock_type: 'mission', price_coins: 0, price_diamonds: 0,
    description: 'Penari dan pemandu wisata dari Denpasar, ramah kepada semua tamu.',
    palette: { skin: '#d49b70', body: '#f2f0e6', accent: '#e8b33c', hat: 'bunga', hatColor: '#ffffff', hair: '#1c120c', lower: '#6b2f6b' } },
  { id: 'nyoman', name: 'Nyoman', region: 'Bali', gender: 'pria', outfit: 'Udeng & kamen', rarity: 'langka', unlock_type: 'adventure', price_coins: 0, price_diamonds: 0,
    description: 'Pemahat kayu dari Ubud yang sabar dan teliti.',
    palette: { skin: '#b9804f', body: '#ffffff', accent: '#d4a72c', hat: 'udeng', hatColor: '#ffffff', hair: '#1c120c', lower: '#2f6b4f' } },
  { id: 'lawing', name: 'Lawing', region: 'Kalimantan', gender: 'pria', outfit: 'Rompi manik & topi bulu', rarity: 'epik', unlock_type: 'shop', price_coins: 0, price_diamonds: 120,
    description: 'Penjaga hutan dari pedalaman Kalimantan, ahli ekowisata.',
    palette: { skin: '#c48b5c', body: '#2a2a2a', accent: '#e0b23a', hat: 'bulu', hatColor: '#e0b23a', hair: '#1c120c', lower: '#8a3b1f' } },
  { id: 'mutiara', name: 'Mutiara', region: 'Maluku', gender: 'wanita', outfit: 'Baju cele & sanggul konde', rarity: 'epik', unlock_type: 'event', price_coins: 0, price_diamonds: 0,
    description: 'Pengusaha rempah dari Banda yang memahami sejarah pala.',
    palette: { skin: '#a8714a', body: '#c23838', accent: '#f0d080', hat: 'sanggul', hatColor: '#1c120c', hair: '#1c120c', lower: '#ffffff' } },
  { id: 'yakob', name: 'Yakob', region: 'Papua', gender: 'pria', outfit: 'Kemeja motif & tas noken', rarity: 'epik', unlock_type: 'shop', price_coins: 15000, price_diamonds: 0,
    description: 'Pemandu selam Raja Ampat yang bersemangat menjaga laut.',
    palette: { skin: '#7a4a2c', body: '#d9622b', accent: '#f2d16b', hat: 'peci', hatColor: '#1f1f1f', hair: '#140c08', lower: '#2b3a55' } },
];

export const SKINS = [
  // Skin pion (bentuk dasar pion di papan)
  { id: 'pawn_classic', kind: 'pawn', name: 'Pion Karakter', description: 'Tampilkan karakter pilihanmu di papan.', unlock_type: 'free', price_coins: 0, price_diamonds: 0, data: { base: '#ffffff', ring: null } },
  { id: 'pawn_emas', kind: 'pawn', name: 'Alas Emas Nusantara', description: 'Alas pion berlapis emas dengan ukiran.', unlock_type: 'shop', price_coins: 3000, price_diamonds: 0, data: { base: '#f2c14e', ring: '#fff3b0' } },
  { id: 'pawn_batik', kind: 'pawn', name: 'Alas Batik Parang', description: 'Alas pion bermotif batik.', unlock_type: 'shop', price_coins: 2500, price_diamonds: 0, data: { base: '#6b3b1f', ring: '#d9a441' } },
  { id: 'pawn_laut', kind: 'pawn', name: 'Alas Biru Raja Ampat', description: 'Gradasi biru laut timur Indonesia.', unlock_type: 'mission', price_coins: 0, price_diamonds: 0, data: { base: '#1aa3c7', ring: '#bff3ff' } },
  { id: 'pawn_merahputih', kind: 'pawn', name: 'Alas Merah Putih', description: 'Edisi spesial kemerdekaan.', unlock_type: 'event', price_coins: 0, price_diamonds: 0, data: { base: '#e23b3b', ring: '#ffffff' } },
  { id: 'pawn_giok', kind: 'pawn', name: 'Alas Giok Kalimantan', description: 'Batu giok hijau berkilau.', unlock_type: 'shop', price_coins: 0, price_diamonds: 60, data: { base: '#1f9e6b', ring: '#c8ffe6' } },
  // Skin dadu
  { id: 'dice_classic', kind: 'dice', name: 'Dadu Putih', description: 'Dadu klasik.', unlock_type: 'free', price_coins: 0, price_diamonds: 0, data: { face: '#ffffff', pip: '#c81e1e' } },
  { id: 'dice_emas', kind: 'dice', name: 'Dadu Emas', description: 'Dadu emas dengan titik merah.', unlock_type: 'shop', price_coins: 4000, price_diamonds: 0, data: { face: '#f2c14e', pip: '#7a1010' } },
  { id: 'dice_wayang', kind: 'dice', name: 'Dadu Kulit Wayang', description: 'Warna coklat kulit dengan titik emas.', unlock_type: 'shop', price_coins: 0, price_diamonds: 40, data: { face: '#8a5a33', pip: '#ffd36b' } },
  { id: 'dice_laut', kind: 'dice', name: 'Dadu Samudra', description: 'Biru laut dengan titik putih.', unlock_type: 'mission', price_coins: 0, price_diamonds: 0, data: { face: '#1f6feb', pip: '#ffffff' } },
  // Emote
  { id: 'emote_senyum', kind: 'emote', name: 'Senyum', description: '😊', unlock_type: 'free', price_coins: 0, price_diamonds: 0, data: { icon: '😊', text: 'Salam kenal!' } },
  { id: 'emote_mantap', kind: 'emote', name: 'Mantap', description: '👍', unlock_type: 'free', price_coins: 0, price_diamonds: 0, data: { icon: '👍', text: 'Mantap!' } },
  { id: 'emote_wkwk', kind: 'emote', name: 'Wkwk', description: '😂', unlock_type: 'free', price_coins: 0, price_diamonds: 0, data: { icon: '😂', text: 'Wkwkwk' } },
  { id: 'emote_semangat', kind: 'emote', name: 'Semangat', description: '🔥', unlock_type: 'free', price_coins: 0, price_diamonds: 0, data: { icon: '🔥', text: 'Semangat!' } },
  { id: 'emote_sabar', kind: 'emote', name: 'Sabar', description: '😅', unlock_type: 'shop', price_coins: 800, price_diamonds: 0, data: { icon: '😅', text: 'Sabar ya...' } },
  { id: 'emote_juragan', kind: 'emote', name: 'Juragan', description: '🤑', unlock_type: 'shop', price_coins: 1500, price_diamonds: 0, data: { icon: '🤑', text: 'Juragan properti!' } },
  { id: 'emote_merdeka', kind: 'emote', name: 'Merdeka', description: '🇮🇩', unlock_type: 'event', price_coins: 0, price_diamonds: 0, data: { icon: '🇮🇩', text: 'Merdeka!' } },
  { id: 'emote_gg', kind: 'emote', name: 'GG', description: '🤝', unlock_type: 'mission', price_coins: 0, price_diamonds: 0, data: { icon: '🤝', text: 'Permainan bagus!' } },
];

export const MISSIONS = [
  { id: 'd_play3', kind: 'daily', title: 'Main 3 kali permainan', metric: 'games', target: 3, reward_coins: 300, reward_xp: 60 },
  { id: 'd_buy3', kind: 'daily', title: 'Beli 3 properti', metric: 'bought', target: 3, reward_coins: 200, reward_xp: 40 },
  { id: 'd_build2', kind: 'daily', title: 'Bangun 2 rumah', metric: 'built', target: 2, reward_coins: 250, reward_xp: 50 },
  { id: 'd_win1', kind: 'daily', title: 'Menang 1 kali', metric: 'wins', target: 1, reward_coins: 400, reward_xp: 80, reward_diamonds: 5 },
  { id: 'w_play15', kind: 'weekly', title: 'Main 15 permainan', metric: 'games', target: 15, reward_coins: 2000, reward_xp: 400, reward_tickets: 1 },
  { id: 'w_win5', kind: 'weekly', title: 'Menang 5 kali', metric: 'wins', target: 5, reward_coins: 2500, reward_xp: 500, reward_diamonds: 25 },
  { id: 'w_rent', kind: 'weekly', title: 'Terima sewa total Rp50 juta', metric: 'rent_million', target: 50, reward_coins: 1500, reward_xp: 300, reward_item: 'pawn_laut' },
  { id: 'w_hotel', kind: 'weekly', title: 'Bangun 3 hotel', metric: 'hotels', target: 3, reward_coins: 1500, reward_xp: 300, reward_item: 'dice_laut' },
];

export const ACHIEVEMENTS = [
  { id: 'a_first_game', title: 'Langkah Pertama', description: 'Selesaikan permainan pertamamu.', metric: 'games', target: 1, reward_coins: 500 },
  { id: 'a_first_win', title: 'Juragan Muda', description: 'Menangkan permainan pertamamu.', metric: 'wins', target: 1, reward_coins: 1000, reward_diamonds: 10 },
  { id: 'a_win10', title: 'Raja Properti', description: 'Menangkan 10 permainan.', metric: 'wins', target: 10, reward_diamonds: 50, reward_item: 'emote_gg' },
  { id: 'a_games50', title: 'Penjelajah Nusantara', description: 'Mainkan 50 permainan.', metric: 'games', target: 50, reward_diamonds: 60, reward_item: 'ayu' },
  { id: 'a_hotel10', title: 'Pengembang Hotel', description: 'Bangun total 10 hotel.', metric: 'hotels', target: 10, reward_coins: 3000 },
  { id: 'a_rent100', title: 'Tuan Tanah', description: 'Terima total sewa Rp100 juta.', metric: 'rent_million', target: 100, reward_coins: 3000, reward_diamonds: 20 },
  { id: 'a_jakarta', title: 'Penguasa Ibu Kota', description: 'Akhiri permainan dengan memiliki Jakarta.', metric: 'own_jakarta', target: 1, reward_coins: 1500 },
];

export const ADVENTURE_STAGES = [
  { id: 'sum1', region: 'Sumatera', stage_no: 1, title: 'Gerbang Danau Toba', description: 'Menangkan permainan melawan 1 bot.', objective: { kind: 'win' }, bots: 1, bot_level: 'easy', reward_coins: 500, reward_xp: 100 },
  { id: 'sum2', region: 'Sumatera', stage_no: 2, title: 'Jam Gadang Berdetak', description: 'Kuasai seluruh kota Sumatera (Padang, Palembang, Medan) dan menang.', objective: { kind: 'win_own_group', group: 'merah' }, bots: 2, bot_level: 'easy', reward_coins: 800, reward_xp: 150 },
  { id: 'jaw1', region: 'Jawa', stage_no: 1, title: 'Pagi di Borobudur', description: 'Menangkan permainan melawan 2 bot.', objective: { kind: 'win' }, bots: 2, bot_level: 'normal', reward_coins: 800, reward_xp: 150 },
  { id: 'jaw2', region: 'Jawa', stage_no: 2, title: 'Bisnis di Ibu Kota', description: 'Menang dengan total aset minimal Rp40 juta.', objective: { kind: 'win_worth', worth: 40_000_000 }, bots: 2, bot_level: 'normal', reward_coins: 1000, reward_xp: 200, reward_item: 'pawn_batik' },
  { id: 'kal1', region: 'Kalimantan', stage_no: 1, title: 'Rumah Betang', description: 'Kuasai seluruh kota Kalimantan dan menang.', objective: { kind: 'win_own_group', group: 'merahMuda' }, bots: 2, bot_level: 'normal', reward_coins: 1000, reward_xp: 200 },
  { id: 'sul1', region: 'Sulawesi', stage_no: 1, title: 'Senja di Losari', description: 'Menangkan permainan melawan 3 bot.', objective: { kind: 'win' }, bots: 3, bot_level: 'normal', reward_coins: 1200, reward_xp: 250 },
  { id: 'bal1', region: 'Bali & Nusa Tenggara', stage_no: 1, title: 'Pulau Komodo', description: 'Menang dengan minimal 3 hotel.', objective: { kind: 'win_hotels', hotels: 3 }, bots: 2, bot_level: 'hard', reward_coins: 1500, reward_xp: 300, reward_item: 'nyoman' },
  { id: 'pap1', region: 'Maluku & Papua', stage_no: 1, title: 'Surga Raja Ampat', description: 'Menangkan permainan melawan 3 bot tingkat sulit.', objective: { kind: 'win' }, bots: 3, bot_level: 'hard', reward_coins: 2500, reward_xp: 500, reward_item: 'pawn_giok' },
];

export const LEVEL_XP = (level) => 200 + (level - 1) * 150; // XP yang dibutuhkan untuk naik dari level ini

export const TITLES = [
  [1, 'Pengusaha Pemula'], [5, 'Pedagang Pasar'], [10, 'Juragan Kampung'], [15, 'Saudagar Kota'],
  [20, 'Konglomerat Daerah'], [30, 'Taipan Nusantara'], [40, 'Legenda Nusantara'],
];
export const titleFor = (level) => TITLES.filter(([l]) => level >= l).pop()[1];
