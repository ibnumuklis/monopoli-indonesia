# Laporan Akhir — Monopoli Indonesia v2.0

Tanggal: 16 November 2026 · Lingkungan uji: Node.js 22.23, PostgreSQL 16, PGlite 0.5, Google Chrome (headless, render perangkat lunak SwiftShader) via Playwright.

## 1. Ringkasan

MVP awal (papan 12 petak, gameplay hanya di browser, multiplayer setengah jadi) dibangun ulang menjadi game multiplayer online yang dapat dimainkan dari awal sampai selesai:

- **Gameplay lengkap di server** — 40 petak, lelang, monopoli, rumah/hotel merata dengan stok bank, gadai/tebus, penjara, 44 kartu, utang & kebangkrutan, dagang, 3 kondisi akhir.
- **Multiplayer nyata** — 2–4 pemain di browser/perangkat berbeda, sinkron lewat Socket.IO; reconnect, bot pengganti, matchmaking, pemulihan setelah server restart.
- **Visual 3D original** — papan, diorama Nusantara, 10 karakter berpakaian adat, dadu, bangunan, efek, kamera; UI premium responsif desktop & HP.
- **Sistem meta & admin** — ekonomi virtual teraudit, misi, achievement, toko kosmetik, sosial, guild, turnamen, leaderboard, Adventure, Admin Dashboard 16 menu + RBAC + audit log.

## 2. Fitur yang diimplementasikan & diuji

| Fitur | Implementasi | Diuji oleh |
|---|---|---|
| 40 petak, harga, sewa | `shared/src/board.js` | unit |
| Dadu server, kembar, 3× kembar → penjara | engine + `crypto.randomInt` | unit, integrasi, E2E |
| Beli, tolak → lelang | engine | unit, E2E (modal Beli) |
| Sewa (monopoli 2×, rumah, hotel, transportasi, utilitas) | engine | unit |
| Bangun/jual merata, stok 32/12, hotel | engine | unit, simulasi 360 game |
| Gadai/tebus 110% | engine | unit |
| Penjara (denda, kartu, 3 percobaan) | engine | unit, E2E |
| 44 kartu (Kesempatan, Dana Umum, Budaya) | `cards.js` + engine | simulasi (jumlah kartu konstan), E2E (popup kartu) |
| Utang, likuidasi, bangkrut ke kreditor/bank | engine | unit, simulasi, integrasi (2 pemain sampai bangkrut) |
| Dagang antarpemain | engine + UI | unit, simulasi |
| Akhir permainan: pemain terakhir / voting / waktu | engine | unit, integrasi, E2E |
| Team Battle 2v2 | engine + rooms | unit, simulasi 60 game, integrasi |
| Room privat/publik, kode, siap, host, bot, kick, start | `rooms.js` | integrasi, E2E |
| Matchmaking Quick Play (+ isi bot) | `rooms.js` | integrasi |
| Disconnect → bot ambil alih → reconnect | `rooms.js` | integrasi |
| Pemulihan setelah server restart | snapshot `game_sessions.state` | integrasi |
| Mode Auto | `rooms.js` | integrasi |
| Anti-cheat: aksi di luar giliran, aksi sistem, payload aneh, idempotensi `cid` | rooms + engine | unit, integrasi |
| Chat room/tim, sensor kata kasar & tautan, rate limit, anti-spam | `moderation.js` | integrasi, API, E2E |
| Auth lokal/tamu/upgrade, Supabase JWT (opsional) | `auth.js` | API (lokal/tamu); Supabase: belum diuji (butuh kredensial) |
| Ekonomi: dompet, buku besar, login harian, toko atomik, tiket | `economy.js`, routes | API (termasuk pembelian paralel) |
| Hadiah pertandingan, XP/level, Rank Point, misi, achievement, leaderboard | `matches.js` | integrasi, E2E |
| Teman, DM, blokir, laporan, guild, turnamen | `social.js` | API, E2E (halaman) |
| Adventure 8 stage + bintang | rooms + matches | E2E (halaman), PGlite manual |
| Admin RBAC 4 role, audit log, ban/mute/dompet/hadiah/konten | `admin.js` | API, E2E |
| PostgreSQL & PGlite | `db/index.js` | test di Postgres 16; instalasi bersih + permainan penuh di PGlite |
| UI 20 menu pemain + HUD permainan + mobile | `client/src/ui` | E2E (desktop 1440×860 & mobile 390×844) |
| Papan 3D, animasi, efek, audio | `client/src/three`, `audio.ts` | E2E + tangkapan layar (lihat bagian 4) |

## 3. Hasil pengujian (benar-benar dijalankan)

| Suite | Perintah | Hasil |
|---|---|---|
| Unit engine (15) | `npm run test:unit` | **15/15 lulus** |
| Simulasi bot | termasuk di atas | **300 game klasik + 60 game tim selesai**, 0 pelanggaran invarian (kas ≥ 0, stok bangunan, jumlah kartu, aset pemain bangkrut) — 254 berakhir karena kebangkrutan, 46 karena batas 250 ronde |
| Integrasi multiplayer (8) | `npm test` | **lulus** — 4 klien terpisah bermain sinkron sampai selesai (state akhir identik di semua klien), 2 pemain sampai bangkrut, disconnect/reconnect, host pindah, matchmaking, practice & team, **server restart**, mode Auto |
| API & keamanan (6) | `npm test` | **lulus** — login harian ganda ditolak, pembelian paralel hanya didebit sekali, RBAC (moderator tidak bisa ubah dompet), audit log, ban mencabut sesi, payload 100 KB → 413, rate limit chat, header keamanan |
| **Total server** | `npm test` | **32/32 lulus** (±20 detik) |
| E2E browser | `python3 scripts/e2e.py` | **30/30 pemeriksaan lulus** — 2 browser (desktop + HP) daftar/masuk, buat & gabung room via kode, bermain lewat klik tombol (lempar dadu, beli, akhiri giliran, penjara), saldo sinkron, chat real-time, voting selesai, layar hasil & hadiah, 14 halaman menu, Admin Dashboard, **0 error JavaScript** |
| Instalasi bersih | salin tanpa `node_modules` → `npm install && npm run build && npm start` (PGlite) | berhasil; satu permainan penuh dimainkan & hadiah tersimpan |

### Bug yang ditemukan lewat pengujian dan diperbaiki
- Race pembelian toko paralel bisa mendebit dua kali → item dimasukkan dulu (unique index mengunci), baru debit.
- Parameter SQL bertipe ambigu pada progres misi → cast eksplisit.
- Pencarian pemain menghapus `_` dari kata kunci → di-escape dengan benar.
- Tata letak HUD mobile: tombol panel tertutup panel chat; grid halaman melebar keluar layar; konten Koleksi tidak terlihat; kamera HP terlalu dekat → diperbaiki & diverifikasi ulang.
- Antrean animasi 3D menumpuk saat permainan lebih cepat dari animasi (bangunan tidak muncul) → mekanisme kejar-ketertinggalan.
- Timer room dibuat setelah server berhenti → shutdown bersih; state room aktif disimpan saat SIGTERM.
- Draw call scene dikurangi (geometri statis digabung per material, ±130 draw call).

## 4. Catatan performa
- Bundle klien ±260 KB gzip (Three.js 132 KB). Tekstur & audio dibuat di perangkat, tanpa unduhan aset.
- 3 tingkat grafis: Rendah (tanpa bayangan, tekstur 1,5K, pixel ratio 1), Sedang (default perangkat ber-RAM ≤ 4 GB/HP), Tinggi (bayangan 2K, tekstur 4K).
- Pengukuran FPS di lingkungan ini **tidak representatif**: Chrome headless tanpa GPU (rasterisasi CPU) hanya 2–5 FPS. Target 60 FPS pada perangkat ber-GPU **belum diukur** di perangkat nyata.

## 5. Cara menjalankan
Lihat [README](../README.md): `npm install && npm run build && npm start` → `http://localhost:3000`, admin di `/admin`. Server multiplayer adalah proses yang sama (Socket.IO di port yang sama). Database: `DATABASE_URL` (PostgreSQL/Supabase) atau kosongkan untuk PGlite. Deployment: [DEPLOYMENT.md](DEPLOYMENT.md).

## 6. Keterbatasan & pekerjaan lanjutan (jujur)
| Item | Status |
|---|---|
| Login Google via Supabase | Kode siap (verifikasi JWT HS256 di server, tombol di UI) — **belum diuji** karena butuh proyek Supabase & OAuth Google. Proyek dengan JWT asimetris (RS256/ES256) perlu verifikasi JWKS. |
| Deploy ke Vercel/hosting & domain | Konfigurasi siap (`Dockerfile`, `docker-compose.yml`, `render.yaml`, `client/vercel.json`) — **belum dideploy** (butuh akun & kredensial). Build Docker **belum diuji** (daemon Docker tidak tersedia di lingkungan ini). |
| Pembayaran uang sungguhan | Sengaja nonaktif (`501`) sampai payment gateway resmi diintegrasikan; panduan di DEPLOYMENT.md. |
| Skala horizontal (banyak instance) | Belum: state room ada di memori satu proses (dengan snapshot DB). Perlu sticky session + Redis adapter. |
| FPS di perangkat nyata | Belum diukur (lihat bagian 4). |
| Monitoring produksi | Endpoint `/health`, log, dan Admin Analytics tersedia; integrasi APM/alerting (mis. Sentry) belum. |
| Seni visual | Seluruhnya prosedural & low-poly orisinal. Untuk kualitas setara render pra-produksi mockup (ilustrasi karakter detail), diperlukan aset 3D buatan seniman (GLB) — arsitektur `buildCharacter` dapat diganti dengan model GLB. |
| Turnamen bracket | Implementasi berbasis poin (liga) dengan matchmaking; bracket eliminasi belum. |
| Bahasa | Antarmuka Bahasa Indonesia saja. |
| Mode Adventure | 8 stage di 6 wilayah; konten tambahan dapat ditambah lewat tabel `adventure_stages`. |
