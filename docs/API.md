# Dokumentasi API

Basis URL: `https://<server>` · Semua body JSON · Autentikasi: header `Authorization: Bearer <token>` (token dari endpoint auth).
Error: status HTTP 4xx/5xx dengan body `{ "error": "pesan dalam Bahasa Indonesia" }`. Rate limit → `429`.

## REST — publik

| Method | Path | Body / Query | Keterangan |
|---|---|---|---|
| GET | `/health` | — | Status server & database |
| GET | `/api/status` | — | Mode pemeliharaan, MOTD, jumlah online |
| GET | `/api/board` | — | Data 40 petak, kelompok, kartu (sesuai konfigurasi admin) |
| GET | `/api/config` | — | Konfigurasi publik (Supabase URL/anon key bila aktif) |
| POST | `/api/auth/register` | `{username, password, email?, displayName?}` | → `{token}` |
| POST | `/api/auth/login` | `{username, password}` | → `{token}` |
| POST | `/api/auth/guest` | `{name}` | Akun tamu → `{token}` |
| POST | `/api/auth/supabase` | `{accessToken}` | Tukar access token Supabase (Google) → `{token}` |

## REST — pemain (wajib login)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/upgrade` | `{username,password,email?}` ubah akun tamu menjadi permanen |
| POST | `/api/auth/logout` | Cabut sesi |
| GET | `/api/me` | Profil, dompet, level, status login harian, guild, badge |
| PATCH | `/api/me` | `{displayName?, bio?, settings?}` |
| GET | `/api/me/history` | 20 pertandingan terakhir |
| GET | `/api/me/transactions` | 50 transaksi dompet terakhir |
| GET | `/api/players/:id` | Profil publik pemain |
| POST | `/api/daily/claim` | Klaim hadiah login harian (sekali per hari WIB) |
| GET | `/api/catalog` | Karakter & skin + status kepemilikan |
| POST | `/api/customize` | `{character?, pawn?, dice?, emotes?[]}` (harus dimiliki) |
| POST | `/api/shop/buy` | `{itemId, currency:'coins'|'diamonds', requestId}` — atomik & idempoten |
| POST | `/api/shop/tickets` | `{count}` tukar 10 diamond → 1 tiket |
| POST | `/api/shop/topup` | Selalu `501` sampai payment gateway resmi dikonfigurasi |
| GET | `/api/missions` | Misi harian/mingguan/event + achievement beserta progres |
| POST | `/api/missions/:id/claim` · `/api/achievements/:id/claim` | Klaim hadiah |
| GET | `/api/leaderboard?period=daily|weekly|monthly|season|all&scope=global|friends|guild` | Peringkat |
| GET | `/api/events` | Event aktif |
| GET | `/api/adventure` | Stage Adventure + bintang + status terkunci |
| GET | `/api/inbox` · POST `/api/inbox/:id/read` · `/api/inbox/read-all` · `/api/inbox/:id/claim` | Inbox & hadiah |
| GET | `/api/friends` | Teman, permintaan masuk/keluar, daftar blokir |
| GET | `/api/players/search/:q` | Cari pemain |
| POST | `/api/friends/request` `{userId}` · `/api/friends/:id/accept` · DELETE `/api/friends/:id` | Pertemanan |
| POST | `/api/block` `{userId}` · DELETE `/api/block/:id` | Blokir |
| POST | `/api/report` `{userId, reason, detail}` | Laporkan pemain (`spam|toxic|cheat|nama_tidak_pantas|lainnya`) |
| GET/POST | `/api/dm/:userId` | Pesan pribadi (khusus teman, disensor) |
| GET | `/api/guilds` · `/api/guilds/:id` | Daftar / detail guild (+chat untuk anggota) |
| POST | `/api/guilds` `{name, tag, description}` · `/api/guilds/:id/join` · `/api/guilds/leave` · `/api/guilds/:id/chat` | Guild |
| GET | `/api/tournaments` · `/api/tournaments/:id` · POST `/api/tournaments/:id/join` | Turnamen |

## REST — admin (`/api/admin`, wajib role admin)

| Path | Role | Keterangan |
|---|---|---|
| GET `/dashboard` | semua | Statistik, grafik pertumbuhan, mode populer, retensi, ekonomi 7 hari |
| GET `/players?q=` · `/players/:id` | semua | Daftar & detail pemain (dompet, transaksi, laporan, chat) |
| POST `/players/:id/ban` `{ban, reason}` · `/players/:id/mute` `{minutes}` | super_admin, admin, moderator | Blokir / bisukan |
| POST `/players/:id/wallet` `{currency, amount, reason}` | super_admin, admin | Penyesuaian saldo (alasan wajib) |
| POST `/players/:id/role` · `/admins` | super_admin | Kelola akun admin |
| GET `/rooms` · `/sessions/:id` | semua | Room aktif, antrean, riwayat sesi, monitoring (event, transaksi, distribusi dadu) |
| POST `/rooms/:code/close` | super_admin, admin, moderator | Tutup room |
| GET/PATCH `/properties[/:id]` · `/cards[/:id]` | baca: semua · ubah: super_admin, admin | Konten papan & kartu |
| GET `/catalog` · PATCH `/catalog/:kind/:id` | baca: semua · ubah: super_admin, admin | Karakter & item |
| GET/POST/PATCH `/events` · POST/PATCH `/missions` | ubah: super_admin, admin | Event & misi |
| GET/POST `/tournaments` · POST `/tournaments/:id/finish` | ubah: super_admin, admin | Turnamen & distribusi hadiah |
| GET/PUT `/economy` | ubah: super_admin, admin | Parameter ekonomi (dengan batas aman) |
| POST `/rewards` | super_admin, admin (support: tanpa hadiah) | Kirim pesan/hadiah ke inbox |
| GET `/reports` · POST `/reports/:id` · DELETE `/chat/:id` | super_admin, admin, moderator | Moderasi |
| GET `/settings` · PUT `/settings/maintenance|motd` | ubah: super_admin | Pengaturan sistem |
| GET `/audit` | super_admin, admin | Audit log |

Setiap aksi admin yang mengubah data dicatat di `admin_audit_logs` (admin, role, aksi, target, detail, IP).

## Socket.IO

Koneksi: `io(SERVER_URL, { auth: { token } })`. Token tidak valid → `connect_error: unauthorized`.
Semua event klien → server memakai **acknowledgement**: `socket.emit(ev, payload, (res) => ...)` dengan `res = { ok: true, ... } | { ok: false, error }`.

### Klien → server

| Event | Payload | Keterangan |
|---|---|---|
| `room:create` | `{name, mode:'classic'|'team', isPrivate, maxPlayers, turnSeconds, timeLimitMin, startCash, auction}` | → `{code}` |
| `room:join` | `{code}` | Gabung room |
| `room:list` | — | → `{rooms}` room publik yang menunggu |
| `room:sync` | — | Kirim ulang state room (reconnect) → `{code}` |
| `room:ready` `{ready}` · `room:team` `{team}` · `room:settings` `{...}` | | Lobby room |
| `room:addBot` `{level}` · `room:kick` `{userId}` · `room:start` | | Khusus host |
| `room:invite` `{userId}` | | Undang teman (juga dikirim ke inbox) |
| `room:leave` | | Keluar (saat bermain = menyerah/bangkrut) |
| `room:dismiss` | | Kembali ke lobby setelah permainan selesai |
| `practice:start` `{bots, level}` | | Latihan vs bot → `{code}` |
| `adventure:start` `{stageId}` | | Mulai stage Adventure |
| `mm:join` `{mode:'classic'|'tournament', tournamentId?}` · `mm:leave` | | Matchmaking |
| `game:action` | `{action, cid}` | Aksi permainan (lihat bawah). `cid` unik per aksi → pengiriman ulang tidak dieksekusi dua kali |
| `game:auto` `{on}` | | Mode otomatis |
| `chat:send` `{text, channel:'room'|'team'}` · `emote` `{id}` | | Chat & emote |

**Aksi permainan** (`action.type`): `roll`, `buy`, `decline`, `bid {amount}`, `pass_auction`, `pay_jail`, `use_jail_card`, `build {tile}`, `sell_building {tile}`, `mortgage {tile}`, `unmortgage {tile}`, `pay_debt`, `bankrupt`, `end_turn`, `propose_trade {to, offer:{cash,tiles,jailCards}, request:{...}}`, `respond_trade {id, accept|cancel}`, `vote_end`.

### Server → klien

| Event | Isi |
|---|---|
| `room:state` | `{room, game, serverTime}` — state lengkap & aman (tanpa urutan dek) |
| `chat:message` | Pesan chat / pesan sistem |
| `room:emote` | Emote pemain |
| `room:invited` | Undangan dari teman |
| `room:kicked` · `room:closed` | Dikeluarkan / room ditutup |
| `mm:status` · `mm:matched` | Status antrean / pertandingan ditemukan |
| `profile:changed` · `social:changed` | Muat ulang profil / data sosial |
| `dm:message` · `guild:message` | Pesan pribadi / guild |
| `account:banned` | Akun diblokir admin |
