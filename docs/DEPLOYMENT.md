# Panduan Deployment

Ada dua pola. Keduanya memakai **satu server Node.js** yang mendukung WebSocket (Socket.IO) sebagai otoritas permainan.

## Pola A — satu layanan (paling sederhana)

Server Node menyajikan API, WebSocket, **dan** klien hasil build.

1. **Database**: buat proyek Supabase (atau PostgreSQL lain). Salin *connection string* (Session mode, port 5432) → `DATABASE_URL`.
2. **Deploy server** ke host yang mendukung WebSocket & proses jangka panjang (Render, Railway, Fly.io, VPS, dsb.):
   - Docker: `docker build -t monopoli-indonesia . && docker run -p 3000:3000 --env-file .env monopoli-indonesia`
   - Tanpa Docker: `npm install && npm run build && npm start`
   - Render: gunakan [`render.yaml`](../render.yaml) (Blueprint) lalu isi variabel rahasia.
   - Docker Compose (VPS): `ADMIN_PASSWORD=... docker compose up -d` (PostgreSQL ikut dijalankan).
3. Isi environment minimal: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TRUST_PROXY=1`.
4. Migration & seed berjalan otomatis saat start. Cek `GET /health`.
5. Arahkan domain (mis. `main.monopoli-indonesia.id`) ke layanan dan aktifkan HTTPS di platform.

## Pola B — Vercel (frontend) + server WebSocket + Supabase

1. Deploy server seperti Pola A (klien yang ikut disajikan boleh diabaikan). Set `ALLOWED_ORIGINS=https://<domain-vercel>`.
2. Di Vercel: **Root Directory** = `client`, framework *Vite*, env `VITE_SERVER_URL=https://<domain-server>`. Konfigurasi rewrite & header ada di [`client/vercel.json`](../client/vercel.json).
   - Catatan: klien mengimpor kode bersama dari `../shared`; aktifkan opsi Vercel *"Include files outside of the Root Directory in the Build Step"* (default aktif untuk monorepo).
3. Domain: frontend `monopoli-indonesia.id` (Vercel), server `api.monopoli-indonesia.id` (CNAME ke host server).

## Supabase Auth (Login dengan Google) — opsional

1. Supabase → Authentication → Providers → aktifkan Google (isi Client ID/Secret dari Google Cloud Console).
2. Tambahkan URL frontend ke *Redirect URLs*.
3. Isi di server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (Project Settings → API).
4. Alur: tombol "Masuk dengan Google" → Supabase OAuth → access token dikirim ke `POST /api/auth/supabase` → server memverifikasi tanda tangan JWT (HS256) → membuat/menautkan akun → memberi token sesi game.
   - Jika proyek Supabase memakai JWT asimetris (RS256/ES256, *JWT signing keys*), tambahkan verifikasi JWKS di `server/src/auth.js` (`verifySupabaseJwt`).

## Produksi — checklist

- [ ] `NODE_ENV=production`, `ADMIN_PASSWORD` kuat, ganti setelah login pertama bila perlu.
- [ ] `ALLOWED_ORIGINS` diisi (di produksi, CORS ditolak bila kosong).
- [ ] `TRUST_PROXY=1` di belakang load balancer.
- [ ] Backup database harian (Supabase: Point-in-Time Recovery / backup otomatis).
- [ ] Monitoring: cek `GET /health` (uptime checker), log stdout platform, Admin Dashboard → Game Monitoring & Analytics.
- [ ] Skala: satu instance menangani ratusan room secara nyaman. Untuk banyak instance diperlukan sticky session + `@socket.io/redis-adapter` + pemindahan state room ke Redis (belum diimplementasikan).

## Pembayaran uang sungguhan (belum aktif)

`POST /api/shop/topup` sengaja mengembalikan `501`. Untuk mengaktifkan top up diamond:
1. Integrasikan payment gateway berizin Bank Indonesia (mis. Midtrans/Xendit) di server: buat transaksi (Snap/Invoice), simpan pesanan pending.
2. Kreditkan diamond **hanya** dari webhook terverifikasi (cek signature), memakai `adjustWallet(..., idemKey = order_id)` agar idempoten.
3. Tampilkan harga final, kebijakan refund, dan perhatikan regulasi perlindungan konsumen & usia pengguna.
4. Isi `PAYMENT_PROVIDER` dan kredensial terkait sebagai environment rahasia.
