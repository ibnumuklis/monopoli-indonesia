# 🎲 Monopoli Indonesia

**Jelajahi Nusantara, Bangun Kerajaan Bisnismu!**

Game papan strategi **multiplayer online berbasis web** bertema Indonesia: papan 3D 40 petak berisi kota-kota Nusantara, karakter berpakaian adat, multiplayer real-time 2–4 pemain dengan server authoritative, bot AI, mode Team Battle / Adventure / Turnamen / Latihan, ekonomi virtual, fitur sosial, dan Admin Dashboard dengan RBAC.

| Permainan (desktop) | Diorama Nusantara | HP |
|---|---|---|
| ![Permainan](docs/screenshots/game-desktop.png) | ![Diorama](docs/screenshots/diorama.png) | ![HP](docs/screenshots/game-mobile.png) |

> Versi 2.0 ini menggantikan MVP sebelumnya (papan 12 petak, gameplay lokal). Seluruh aturan permainan kini berjalan di server.

---

## Daftar isi
1. [Fitur](#fitur)
2. [Menjalankan secara lokal](#menjalankan-secara-lokal)
3. [Menjalankan test](#menjalankan-test)
4. [Struktur proyek](#struktur-proyek)
5. [Konfigurasi](#konfigurasi)
6. [Dokumentasi lain](#dokumentasi-lain)

---

## Fitur

| Area | Isi |
|---|---|
| **Gameplay** | 40 petak (22 kota, 4 transportasi, 2 utilitas, Kesempatan, Dana Umum, Kartu Budaya, 2 pajak, Penjara, Bebas Parkir, Masuk Penjara) · dadu ganda dari server (kembar = lempar lagi, 3× kembar = penjara) · beli / **lelang** properti · sewa (monopoli 2×, rumah 1–4, hotel) · bangun **merata** dengan stok bank 32 rumah / 12 hotel · jual bangunan · gadai & tebus (110%) · penjara (denda, kartu bebas, 3 percobaan) · 44 kartu dengan efek nyata · **utang & kebangkrutan** (aset ke kreditor/bank) · **dagang antarpemain** · akhir permainan: pemain terakhir, voting bersama, batas waktu |
| **Multiplayer** | Socket.IO real-time · room publik/privat dengan kode 6 digit · undang teman · status siap · host & pindah host · tambah/keluarkan bot · **Quick Play matchmaking** · timer giliran · **reconnect** (bot mengambil alih setelah masa tenggang) · mode Auto · chat room & chat tim · emote · pemulihan permainan setelah **server restart** |
| **Keamanan & fair play** | Server authoritative (dadu `crypto.randomInt`, saldo, posisi, kartu, kemenangan) · validasi & sanitasi setiap aksi · idempotensi aksi (`cid`) · rate limit (API, auth, aksi, chat) · deteksi spam · sensor kata kasar & tautan · password scrypt · token sesi ter-hash · RBAC admin + audit log · RLS Supabase |
| **Mode** | Klasik · Team Battle 2v2 (rekan setim bebas sewa) · Adventure Nusantara (8 stage, tujuan khusus, bintang) · Turnamen (tiket, klasemen, hadiah) · Latihan vs bot (mudah/normal/sulit) |
| **Visual 3D** | Three.js: papan 3D dengan tekstur prosedural 4K, diorama Nusantara (Monas, candi bertingkat, gunung berapi berasap, rumah gadang, meru Bali, kapal pinisi, pohon kelapa, awan), 10 karakter chibi berpakaian adat, dadu fisik beranimasi, rumah & hotel, bendera kepemilikan, efek beli/sewa (koin terbang)/konfeti, kamera mengikuti pion · 3 tingkat grafis |
| **Audio** | Disintesis 100% dengan Web Audio: musik latar gamelan slendro generatif, ambien burung & angin, efek dadu/tombol/beli/sewa/kartu/menang/notifikasi · volume & mute |
| **Pemain & ekonomi** | Koin, Diamond, Tiket, XP & level, Rank Point · login harian 7 hari · misi harian/mingguan/event · achievement · toko kosmetik (tanpa pay-to-win) · inventaris · kustomisasi karakter, alas pion, dadu, emote · buku besar transaksi |
| **Sosial** | Teman & permintaan · status online · pesan pribadi · undangan room · guild + chat guild · laporan & blokir pemain · inbox notifikasi & hadiah |
| **Kompetisi** | Leaderboard harian/mingguan/bulanan/musim/global/teman/guild · turnamen · riwayat pertandingan |
| **Admin** | Aplikasi terpisah `/admin` · 16 menu (Dashboard, Player, Room, Game Monitoring, Property, Card, Character, Item, Event, Tournament, Economy, Reward, Reports, Analytics, Moderation, System Settings) + Audit Log · role Super Admin / Admin / Moderator / Support |

Semua 20 menu pemain (Splash, Login/Register, Lobby, Quick Play, Buat Room, Gabung Room, Teman, Profil, Koleksi, Kustomisasi, Adventure, Turnamen, Peringkat, Event, Misi, Toko, Inventaris, Guild, Inbox, Pengaturan) terhubung ke API server — tidak ada tombol dekoratif.

## Menjalankan secara lokal

Prasyarat: **Node.js 20+**. PostgreSQL opsional (tanpa `DATABASE_URL`, server memakai **PGlite** — Postgres WASM yang disimpan di `.data/pglite`).

```bash
npm install          # juga memasang dependensi klien (postinstall)
npm run build        # build klien React + Three.js → client/dist
cp .env.example .env # lalu sesuaikan (minimal ADMIN_PASSWORD; hapus DATABASE_URL untuk memakai PGlite)
npm start            # http://localhost:3000  ·  admin: http://localhost:3000/admin
```

Mode pengembangan (hot reload):

```bash
npm run dev:server   # server di :3000
npm run dev:client   # Vite di :5173 (proxy /api & /socket.io ke :3000)
```

**Mencoba multiplayer:** buka dua browser berbeda (atau satu jendela biasa + satu jendela incognito / HP di jaringan yang sama), masuk sebagai dua akun, lalu **Main → Buat Room** di satu browser dan **Gabung Room** dengan kode 6 digit di browser lain.

Migration berjalan otomatis saat server start (idempoten). Bisa juga manual: `npm run migrate`.

## Menjalankan test

```bash
# Unit + simulasi + integrasi multiplayer + API/keamanan (butuh PostgreSQL untuk test integrasi)
TEST_DATABASE_URL=postgres://user:pass@localhost/monopoli_test npm test

# Hanya engine (tanpa database)
npm run test:unit

# E2E browser: 2 browser (desktop + mobile) bermain bersama lewat UI. Server harus berjalan.
pip install playwright && python3 scripts/e2e.py --base http://localhost:3000 --chrome /path/ke/chrome
```

Hasil pengujian terakhir ada di [`docs/LAPORAN_AKHIR.md`](docs/LAPORAN_AKHIR.md).

## Struktur proyek

```
shared/src/        Kode bersama server & klien
  board.js         Data 40 petak, kelompok warna, harga, sewa
  cards.js         44 kartu (Kesempatan, Dana Umum, Budaya)
  engine.js        Engine aturan permainan (murni, server-authoritative)
  bot.js           Bot AI (3 tingkat) — juga dipakai saat timeout/terputus
  catalog.js       Karakter, skin, misi, achievement, stage Adventure
server/
  src/index.js     Express + Socket.IO
  src/game/rooms.js        RoomManager: room, timer, bot, reconnect, matchmaking, pemulihan
  src/game/moderation.js   Sensor chat, rate limiter, anti-spam
  src/auth.js              Auth lokal/tamu/Supabase, sesi, RBAC
  src/services/            Ekonomi, persistensi pertandingan, konten
  src/routes/              REST API pemain, sosial, admin
  src/db/                  Adapter pg/PGlite, migrate, seed
  migrations/001_init.sql  Skema PostgreSQL (40 tabel, FK, index, constraint, RLS)
  test/                    Unit, simulasi, integrasi, keamanan
client/
  src/three/       Scene 3D (Board3D), karakter, diorama, tekstur prosedural
  src/ui/          Halaman & HUD permainan (React)
  src/admin/       Admin Dashboard
  src/lib/         API, socket, store, audio
scripts/e2e.py     Test E2E browser (Playwright)
docs/              Arsitektur, API, database, deployment, aturan, laporan akhir
```

## Konfigurasi

Lihat [`.env.example`](.env.example) (server) dan [`client/.env.example`](client/.env.example) (klien bila dideploy terpisah).

## Dokumentasi lain

- [Arsitektur & keputusan teknis](docs/ARCHITECTURE.md)
- [Dokumentasi API (REST & Socket.IO)](docs/API.md)
- [Dokumentasi database & ERD](docs/DATABASE.md)
- [Panduan deployment (Vercel + server WebSocket + Supabase)](docs/DEPLOYMENT.md)
- [Aturan permainan](docs/GAME_RULES.md)
- [Laporan akhir: fitur, hasil test, keterbatasan](docs/LAPORAN_AKHIR.md)

## Lisensi aset

Seluruh aset grafis (papan, ikon, karakter 3D, landmark, banner) dan audio dibuat secara prosedural dalam kode proyek ini — tidak ada aset, logo, atau karakter pihak ketiga. Pustaka yang dipakai berlisensi MIT (React, Three.js, Socket.IO, Express, node-postgres, PGlite: Apache-2.0/PostgreSQL).
