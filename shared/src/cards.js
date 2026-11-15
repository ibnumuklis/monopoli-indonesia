// Kartu Kesempatan, Dana Umum, dan Kartu Budaya.
// Efek: money, moveTo, moveBy, jail, jailFree, repairs, collectEach, payEach, nearest
import { RP } from './board.js';

export const CARDS = {
  chance: [
    { id: 'c1', title: 'Perjalanan Dinas!', text: 'Terbang ke Jakarta.', effect: { kind: 'moveTo', to: 39 } },
    { id: 'c2', title: 'Mudik Lebaran', text: 'Maju ke START dan terima gaji.', effect: { kind: 'moveTo', to: 0 } },
    { id: 'c3', title: 'Liburan ke Bali', text: 'Maju ke Denpasar. Jika melewati START, terima gaji.', effect: { kind: 'moveTo', to: 27 } },
    { id: 'c4', title: 'Rapat di Makassar', text: 'Maju ke Makassar.', effect: { kind: 'moveTo', to: 19 } },
    { id: 'c5', title: 'Naik Transportasi Umum', text: 'Maju ke transportasi terdekat. Bayar 2x sewa jika dimiliki pemain lain.', effect: { kind: 'nearest', target: 'transport' } },
    { id: 'c6', title: 'Cek Tagihan', text: 'Maju ke utilitas terdekat. Bayar 10x dadu jika dimiliki pemain lain.', effect: { kind: 'nearest', target: 'utility' } },
    { id: 'c7', title: 'Dividen Saham', text: 'Bank membayar dividen Rp500.000.', effect: { kind: 'money', amount: 50 * RP } },
    { id: 'c8', title: 'Bebas dari Penjara', text: 'Simpan kartu ini untuk keluar dari penjara.', effect: { kind: 'jailFree' } },
    { id: 'c9', title: 'Salah Jalan', text: 'Mundur 3 langkah.', effect: { kind: 'moveBy', steps: -3 } },
    { id: 'c10', title: 'Tilang Elektronik', text: 'Masuk penjara! Tidak melewati START.', effect: { kind: 'jail' } },
    { id: 'c11', title: 'Renovasi Properti', text: 'Bayar Rp250.000 per rumah dan Rp1.000.000 per hotel.', effect: { kind: 'repairs', house: 25 * RP, hotel: 100 * RP } },
    { id: 'c12', title: 'Denda Ngebut', text: 'Bayar denda Rp150.000.', effect: { kind: 'money', amount: -15 * RP } },
    { id: 'c13', title: 'Ketua Arisan', text: 'Bayar Rp500.000 kepada setiap pemain.', effect: { kind: 'payEach', amount: 50 * RP } },
    { id: 'c14', title: 'Proyek Infrastruktur Selesai', text: 'Terima Rp1.500.000.', effect: { kind: 'money', amount: 150 * RP } },
    { id: 'c15', title: 'Kereta ke Stasiun Gambir', text: 'Maju ke Stasiun Gambir.', effect: { kind: 'moveTo', to: 5 } },
    { id: 'c16', title: 'Festival Kuliner', text: 'Maju ke Medan. Jika melewati START, terima gaji.', effect: { kind: 'moveTo', to: 24 } },
  ],
  chest: [
    { id: 'd1', title: 'Kesalahan Bank', text: 'Bank keliru menghitung. Terima Rp2.000.000.', effect: { kind: 'money', amount: 200 * RP } },
    { id: 'd2', title: 'Biaya Dokter', text: 'Bayar Rp500.000.', effect: { kind: 'money', amount: -50 * RP } },
    { id: 'd3', title: 'Penjualan Saham', text: 'Terima Rp500.000.', effect: { kind: 'money', amount: 50 * RP } },
    { id: 'd4', title: 'Bebas dari Penjara', text: 'Simpan kartu ini untuk keluar dari penjara.', effect: { kind: 'jailFree' } },
    { id: 'd5', title: 'Pemeriksaan Pajak', text: 'Masuk penjara! Tidak melewati START.', effect: { kind: 'jail' } },
    { id: 'd6', title: 'Dana Liburan Cair', text: 'Terima Rp1.000.000.', effect: { kind: 'money', amount: 100 * RP } },
    { id: 'd7', title: 'Restitusi Pajak', text: 'Terima Rp200.000.', effect: { kind: 'money', amount: 20 * RP } },
    { id: 'd8', title: 'Ulang Tahun', text: 'Terima Rp100.000 dari setiap pemain.', effect: { kind: 'collectEach', amount: 10 * RP } },
    { id: 'd9', title: 'Asuransi Jiwa', text: 'Polis jatuh tempo. Terima Rp1.000.000.', effect: { kind: 'money', amount: 100 * RP } },
    { id: 'd10', title: 'Biaya Rumah Sakit', text: 'Bayar Rp1.000.000.', effect: { kind: 'money', amount: -100 * RP } },
    { id: 'd11', title: 'Biaya Sekolah', text: 'Bayar Rp500.000.', effect: { kind: 'money', amount: -50 * RP } },
    { id: 'd12', title: 'Jasa Konsultan', text: 'Terima Rp250.000.', effect: { kind: 'money', amount: 25 * RP } },
    { id: 'd13', title: 'Perbaikan Jalan', text: 'Bayar Rp400.000 per rumah dan Rp1.150.000 per hotel.', effect: { kind: 'repairs', house: 40 * RP, hotel: 115 * RP } },
    { id: 'd14', title: 'Juara Lomba 17 Agustus', text: 'Terima Rp100.000.', effect: { kind: 'money', amount: 10 * RP } },
    { id: 'd15', title: 'Warisan', text: 'Terima Rp1.000.000.', effect: { kind: 'money', amount: 100 * RP } },
    { id: 'd16', title: 'Kembali ke START', text: 'Maju ke START dan terima gaji.', effect: { kind: 'moveTo', to: 0 } },
  ],
  budaya: [
    { id: 'b1', title: 'Tari Saman', text: 'Pertunjukanmu memukau penonton dari Aceh. Terima Rp750.000.', effect: { kind: 'money', amount: 75 * RP } },
    { id: 'b2', title: 'Batik Warisan Dunia', text: 'Karya batikmu laku di pameran. Terima Rp1.000.000.', effect: { kind: 'money', amount: 100 * RP } },
    { id: 'b3', title: 'Festival Danau Toba', text: 'Maju ke Medan untuk menikmati festival.', effect: { kind: 'moveTo', to: 24 } },
    { id: 'b4', title: 'Ziarah Budaya Borobudur', text: 'Maju ke Yogyakarta.', effect: { kind: 'moveTo', to: 34 } },
    { id: 'b5', title: 'Sponsor Pagelaran Wayang', text: 'Bayar Rp300.000 untuk mendukung seniman.', effect: { kind: 'money', amount: -30 * RP } },
    { id: 'b6', title: 'Pesta Rakyat', text: 'Setiap pemain memberimu Rp200.000 untuk tumpeng.', effect: { kind: 'collectEach', amount: 20 * RP } },
    { id: 'b7', title: 'Upacara Rambu Solo Toraja', text: 'Hormati adat setempat. Maju ke Makassar.', effect: { kind: 'moveTo', to: 19 } },
    { id: 'b8', title: 'Pelestarian Rumah Gadang', text: 'Bayar Rp200.000 per rumah dan Rp800.000 per hotel.', effect: { kind: 'repairs', house: 20 * RP, hotel: 80 * RP } },
    { id: 'b9', title: 'Pinisi Berlayar', text: 'Maju ke Pelabuhan Tanjung Perak.', effect: { kind: 'moveTo', to: 15 } },
    { id: 'b10', title: 'Lomba Karapan Sapi', text: 'Juara! Maju 4 langkah.', effect: { kind: 'moveBy', steps: 4 } },
    { id: 'b11', title: 'Ngaben di Bali', text: 'Maju ke Denpasar.', effect: { kind: 'moveTo', to: 27 } },
    { id: 'b12', title: 'Komodo Bersahabat', text: 'Pemandu wisata membayarmu Rp500.000.', effect: { kind: 'money', amount: 50 * RP } },
  ],
};

export const DECK_NAMES = { chance: 'Kesempatan', chest: 'Dana Umum', budaya: 'Kartu Budaya' };

export function findCard(id) {
  for (const deck of Object.keys(CARDS)) {
    const c = CARDS[deck].find((x) => x.id === id);
    if (c) return { ...c, deck };
  }
  return null;
}
