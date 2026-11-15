// Moderasi chat & rate limiting.

const BAD_WORDS = [
  'anjing', 'anjg', 'anjir', 'bangsat', 'bajingan', 'kontol', 'memek', 'ngentot', 'goblok', 'tolol', 'babi', 'asu', 'jancok', 'jancuk',
  'kampret', 'tai', 'bego', 'idiot', 'fuck', 'shit', 'bitch', 'bastard', 'dick', 'pussy', 'kafir', 'pelacur', 'lonte',
];
const RE = new RegExp(`(^|[^a-z])(${BAD_WORDS.join('|')})(?=[^a-z]|$)`, 'gi');
const LINK_RE = /(https?:\/\/|www\.)\S+/gi;

/** Sensor kata kasar & tautan. Mengembalikan {text, flagged}. */
export function moderate(raw) {
  let text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  let flagged = false;
  // normalisasi leetspeak sederhana untuk deteksi
  const norm = text.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/@/g, 'a').replace(/\$/g, 's');
  if (RE.test(norm)) {
    flagged = true;
    RE.lastIndex = 0;
    // sensor berdasarkan posisi pada teks yang dinormalisasi (panjang sama)
    const chars = text.split('');
    let m;
    while ((m = RE.exec(norm))) {
      const start = m.index + m[1].length;
      for (let k = start; k < start + m[2].length; k++) chars[k] = '*';
    }
    text = chars.join('');
  }
  RE.lastIndex = 0;
  if (LINK_RE.test(text)) { text = text.replace(LINK_RE, '[tautan dihapus]'); flagged = true; }
  LINK_RE.lastIndex = 0;
  return { text, flagged };
}

/** Token bucket per kunci. */
export class RateLimiter {
  constructor(capacity, refillPerSec) { this.capacity = capacity; this.refill = refillPerSec; this.buckets = new Map(); }
  take(key, cost = 1) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: this.capacity, at: now }; this.buckets.set(key, b); }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refill);
    b.at = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    if (this.buckets.size > 50_000) this.buckets.clear();
    return true;
  }
}

/** Deteksi spam: pesan identik berulang. */
export class SpamGuard {
  constructor() { this.last = new Map(); }
  check(key, text) {
    const now = Date.now();
    const prev = this.last.get(key);
    this.last.set(key, { text, at: now, count: prev && prev.text === text ? prev.count + 1 : 1 });
    const cur = this.last.get(key);
    return !(cur.count >= 3 && now - prev.at < 30_000);
  }
}
