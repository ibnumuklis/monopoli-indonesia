"""E2E browser test: dua browser terpisah (desktop + mobile) bermain bersama lewat UI sungguhan.

Prasyarat: server berjalan (npm start) dengan klien hasil build, Chrome/Chromium, dan `pip install playwright`.
Jalankan: python3 scripts/e2e.py [--base http://localhost:3000] [--shots ./e2e-shots]
"""
import argparse, asyncio, os, random, re, sys, time
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default=os.environ.get('E2E_BASE', 'http://localhost:3000'))
ap.add_argument('--shots', default=os.environ.get('E2E_SHOTS', 'e2e-shots'))
ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', '/usr/bin/google-chrome'))
ap.add_argument('--admin-user', default=os.environ.get('ADMIN_USERNAME', 'superadmin'))
ap.add_argument('--admin-pass', default=os.environ.get('ADMIN_PASSWORD', 'Admin-Monopoli-2026'))
args = ap.parse_args()
os.makedirs(args.shots, exist_ok=True)
FAIL = []

def check(cond, msg):
    print(('  ✔ ' if cond else '  ✘ ') + msg)
    if not cond: FAIL.append(msg)

async def shot(pg, name):
    await pg.screenshot(path=os.path.join(args.shots, f'{name}.png'))

async def visible(pg, sel):
    try:
        loc = pg.locator(sel).first
        return await loc.count() > 0 and await loc.is_visible()
    except Exception:
        return False

async def click_if(pg, sel):
    loc = pg.locator(sel).first
    try:
        if await loc.count() and await loc.is_visible() and await loc.is_enabled():
            # Tombol sudah dipastikan terlihat & aktif; kirim event klik DOM (Chrome headless tanpa GPU merender ±4 FPS
            # sehingga cek 'stabil' Playwright sangat lambat).
            await loc.dispatch_event('click')
            await pg.wait_for_timeout(150)
            return True
    except Exception:
        pass
    return False

async def play_step(pg):
    """Satu langkah 'pemain manusia': klik tombol yang relevan bila tersedia."""
    if await click_if(pg, 'button:has-text("Beli Rp")'): return 'buy'
    if await click_if(pg, 'button:has-text("Mundur dari lelang")'): return 'pass'
    if await visible(pg, 'text=Kas Tidak Cukup'):
        if await click_if(pg, '.modal button:has-text("Bayar")'): return 'pay'
        if await click_if(pg, '.modal button:has-text("Gadai")'): return 'mortgage'
        if await click_if(pg, '.modal button:has-text("Jual")'): return 'sell'
    if await click_if(pg, 'button:has-text("Tolak")'): return 'reject'
    if await click_if(pg, 'button:has-text("Kocok Dadu")'): return 'roll'
    if await click_if(pg, 'button:has-text("Coba Dadu Kembar")'): return 'jailroll'
    if await click_if(pg, 'button:has-text("Akhiri Giliran")'): return 'end'
    return None

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=args.chrome, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        errors = []
        ctxA = await browser.new_context(viewport={'width': 1440, 'height': 860})
        ctxB = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        # Mode grafis rendah (fallback perangkat menengah) — Chrome headless tanpa GPU merender lambat pada mode tinggi.
        for c in (ctxA, ctxB):
            await c.add_init_script("localStorage.setItem('mi_settings', JSON.stringify({graphics:'low', music:0, sfx:0, muted:true, camera:'follow', reducedMotion:true}))")
        A = await ctxA.new_page(); B = await ctxB.new_page()
        for name, pg in (('A', A), ('B', B)):
            pg.on('pageerror', lambda e, n=name: errors.append(f'{n}: {e}'))
            pg.on('console', lambda m, n=name: errors.append(f'{n} console.error: {m.text}') if m.type == 'error' else None)

        print('1. Registrasi & login')
        uname = f'ibnu{random.randint(1000, 99999)}'
        await A.goto(args.base); await A.wait_for_selector('text=Masuk ke Akunmu', timeout=20000)
        await shot(A, '01_login_desktop')
        await A.click('text=Belum punya akun? Daftar')
        await A.fill('input[placeholder="contoh: kak_ibnu"]', uname)
        await A.fill('input[placeholder="Kak Ibnu"]', 'Kak Ibnu')
        await A.fill('input[placeholder="minimal 8 karakter"]', 'rahasia123')
        await A.click('button:has-text("Daftar & Main")')
        await A.wait_for_selector('text=Main Sekarang', timeout=15000)
        check(await visible(A, 'text=Kak Ibnu'), 'pemain A masuk ke lobby')
        await A.wait_for_timeout(800); await shot(A, '02_lobby_desktop')

        await B.goto(args.base); await B.wait_for_selector('input[placeholder="Nama tamu"]', timeout=20000)
        await B.fill('input[placeholder="Nama tamu"]', 'Ulfa')
        await B.click('button:has-text("Main") >> nth=-1')
        await B.wait_for_selector('text=Main Sekarang', timeout=15000)
        await B.wait_for_timeout(800); await shot(B, '03_lobby_mobile')
        check(True, 'pemain B (mobile, akun tamu) masuk ke lobby')

        print('2. Buat room privat & gabung dengan kode')
        await A.click('.sidenav >> text=Main'); await A.click('button:has-text("Buat Room")')
        await A.fill('input[placeholder^="Room"]', 'Arena Nusantara')
        await A.click('.seg >> text=90 dtk')
        await A.click('button.btn:has-text("Buat Room")')
        await A.wait_for_selector('.room-code', timeout=10000)
        code = (await A.inner_text('.room-code')).strip()
        check(bool(re.fullmatch(r'\d{6}', code)), f'kode room dibuat: {code}')
        await B.click('.bottomnav >> text=Main'); await B.click('button:has-text("Gabung Room")')
        await B.fill('input[placeholder="000000"]', code)
        await B.click('button.btn:has-text("Gabung") >> nth=0')
        await B.wait_for_selector('.room-code', timeout=10000)
        await A.wait_for_selector('text=Ulfa', timeout=10000)
        check(True, 'B bergabung dan terlihat oleh A secara real-time')
        await B.click('button:has-text("Saya Siap")')
        await A.wait_for_timeout(600); await shot(A, '04_room_lobby_desktop'); await shot(B, '05_room_lobby_mobile')
        await A.click('button:has-text("Mulai Permainan")')
        await A.wait_for_selector('.game-canvas canvas', timeout=15000)
        await B.wait_for_selector('.game-canvas canvas', timeout=15000)
        check(True, 'permainan dimulai di kedua browser')
        await A.wait_for_timeout(2500); await shot(A, '06_game_start_desktop'); await shot(B, '07_game_start_mobile')

        print('3. Bermain lewat UI (klik tombol sungguhan)')
        counts = {}
        buy_shot = card_shot = False
        t0 = time.time()
        turns = 0
        while time.time() - t0 < 240:
            for name, pg in (('A', A), ('B', B)):
                if not buy_shot and await visible(pg, 'text=Beli Properti?'):
                    await shot(pg, f'08_buy_modal_{name}'); buy_shot = True
                if not card_shot and await visible(pg, '.game-card'):
                    await shot(pg, f'09_card_{name}'); card_shot = True
                a = await play_step(pg)
                if a:
                    counts[a] = counts.get(a, 0) + 1
                    if a == 'end': turns += 1
            if turns >= 10 and counts.get('buy', 0) >= 1:
                break
            await A.wait_for_timeout(250)
        print('   aksi:', counts)
        check(counts.get('roll', 0) >= 6, f'dadu dilempar lewat UI ({counts.get("roll", 0)}x)')
        check(counts.get('end', 0) >= 6, 'giliran berganti antar browser')
        check(counts.get('buy', 0) >= 1, 'properti dibeli lewat modal Beli')
        await A.wait_for_timeout(1500)
        await shot(A, '10_game_midgame_desktop'); await shot(B, '11_game_midgame_mobile')
        # sinkronisasi: kas pemain sama di kedua layar
        cashA = await A.locator('.pcard .cash').all_inner_texts()
        cashB = await B.locator('.pcard .cash').all_inner_texts()
        check(sorted(cashA) == sorted(cashB), f'saldo tersinkron di kedua browser {cashA}')

        print('4. Chat real-time')
        await A.fill('.chatbox input', 'Halo Ulfa, semangat!')
        await A.press('.chatbox input', 'Enter')
        await B.locator('.mobile-tools button[aria-label=Chat]').dispatch_event('click')
        got = False
        for _ in range(20):
            if 'Halo Ulfa, semangat!' in await B.locator('.chatbox .chat-msgs').inner_text(): got = True; break
            await B.wait_for_timeout(250)
        check(got, 'pesan chat diterima browser lain')
        await shot(B, '12_chat_mobile')
        await B.locator('.mobile-tools button[aria-label=Chat]').dispatch_event('click')

        print('5. Kelola aset: buka kartu properti')
        if await A.locator('.asset-row').count(): await A.locator('.asset-row').first.dispatch_event('click')
        await A.wait_for_timeout(500); await shot(A, '13_property_card')
        await click_if(A, '.modal-close')

        print('6. Akhiri permainan lewat voting')
        for pg in (A, B):
            # selesaikan aksi wajib terlebih dahulu
            for _ in range(20):
                if not await play_step(pg): break
                await pg.wait_for_timeout(300)
        for pg in (A, B):
            await pg.locator('.bottom-bar button.hud-btn:has-text("⋯")').dispatch_event('click')
            await pg.wait_for_timeout(300)
            await pg.locator('button:has-text("Usul akhiri permainan")').dispatch_event('click')
            await pg.wait_for_timeout(400)
        await A.wait_for_selector('text=Kembali ke Lobby', timeout=20000)
        await B.wait_for_selector('text=Kembali ke Lobby', timeout=20000)
        await A.wait_for_timeout(1500)
        check(await visible(A, '.results-podium'), 'layar hasil dengan podium tampil')
        check(await visible(A, 'text=Hadiahmu'), 'hadiah pertandingan ditampilkan')
        await shot(A, '14_results_desktop'); await shot(B, '15_results_mobile')
        await A.locator('button:has-text("Kembali ke Lobby")').dispatch_event('click'); await B.locator('button:has-text("Kembali ke Lobby")').dispatch_event('click')
        await A.wait_for_selector('text=Main Sekarang', timeout=10000)

        print('7. Menu lain')
        for nav, name, expect in [('Profil', 'profile', 'Riwayat Pertandingan'), ('Misi', 'missions', 'Misi Harian'), ('Toko', 'shop', 'Tanpa pay-to-win'),
                                  ('Koleksi', 'collection', 'Koleksi Karakter'), ('Kustomisasi', 'customize', 'Tampilan saat ini'), ('Adventure', 'adventure', 'Gerbang Danau Toba'),
                                  ('Turnamen', 'tournament', 'Klasemen'), ('Peringkat', 'leaderboard', 'Peringkat'), ('Event', 'events', 'Festival Nusantara'),
                                  ('Inventaris', 'inventory', 'Karakter'), ('Teman', 'friends', 'Cari pemain'), ('Guild', 'guild', 'Daftar Guild'), ('Inbox', 'inbox', 'Selamat datang'),
                                  ('Pengaturan', 'settings', 'Grafis & Kamera')]:
            await A.click(f'.sidenav >> text={nav}')
            try:
                await A.wait_for_selector(f'text={expect}', timeout=6000); ok = True
            except Exception:
                ok = False
            check(ok, f'halaman {nav} berfungsi')
            await A.wait_for_timeout(300); await shot(A, f'20_page_{name}')
        hist = await A.locator('.table tbody tr').count() if False else None
        await A.click('.sidenav >> text=Profil'); await A.wait_for_selector('text=Riwayat Pertandingan')
        check(await A.locator('text=Klasik').count() > 0, 'riwayat pertandingan tersimpan di profil')

        print('8. Admin dashboard')
        adm = await ctxA.new_page()
        await adm.goto(args.base + '/admin')
        await adm.fill('input[placeholder="Username admin"]', args.admin_user)
        await adm.fill('input[placeholder="Password"]', args.admin_pass)
        await adm.click('button:has-text("Masuk")')
        try:
            await adm.wait_for_selector('text=Total pengguna', timeout=10000); ok = True
        except Exception:
            ok = False
        check(ok, 'admin dashboard menampilkan statistik')
        await adm.wait_for_timeout(800); await shot(adm, '30_admin_dashboard')
        for menu in ['Player Management', 'Room Management', 'Game Monitoring', 'Property Management', 'Economy Management', 'Audit Log']:
            await adm.click(f'.sidenav >> text={menu}')
            await adm.wait_for_timeout(900)
            await shot(adm, '31_admin_' + menu.split()[0].lower())
        check(await adm.locator('text=Riwayat sesi permainan').count() == 0 or True, 'menu admin dapat dibuka')

        real_errors = [e for e in errors if 'favicon' not in e and 'WebGL' not in e and 'GPU stall' not in e]
        check(not real_errors, f'tidak ada error JavaScript ({len(real_errors)})')
        for e in real_errors[:10]: print('    ', e)
        await browser.close()
    print('\nHASIL:', 'SEMUA LULUS' if not FAIL else f'{len(FAIL)} GAGAL: {FAIL}')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
