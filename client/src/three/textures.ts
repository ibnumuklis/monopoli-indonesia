// Tekstur prosedural: permukaan papan 40 petak, muka dadu, banner judul, teks melayang.
import * as THREE from 'three';
import { TILES, GROUPS } from '@shared/board.js';

export const BOARD = 24; // unit dunia
export const CORNER = 3;
export const TILE_W = 2;

const rpShort = (n: number) => (n >= 1e6 ? `Rp${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt` : `Rp${Math.round(n / 1e3)}rb`);
const rpFull = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');

/** Info posisi petak: pusat dunia, vektor sepanjang (a) dan keluar (o), sudut kanvas. */
export function tileFrame(i: number) {
  const h = BOARD / 2 - CORNER / 2; // 10.5
  if (i === 0) return { x: h, z: h, a: [1, 0], o: [0, 1], rot: 0, corner: true };
  if (i === 10) return { x: -h, z: h, a: [0, 1], o: [-1, 0], rot: Math.PI / 2, corner: true };
  if (i === 20) return { x: -h, z: -h, a: [-1, 0], o: [0, -1], rot: Math.PI, corner: true };
  if (i === 30) return { x: h, z: -h, a: [0, -1], o: [1, 0], rot: -Math.PI / 2, corner: true };
  if (i < 10) return { x: 10 - 2 * i, z: h, a: [1, 0], o: [0, 1], rot: 0, corner: false };
  if (i < 20) return { x: -h, z: 10 - 2 * (i - 10), a: [0, 1], o: [-1, 0], rot: Math.PI / 2, corner: false };
  if (i < 30) return { x: -10 + 2 * (i - 20), z: -h, a: [-1, 0], o: [0, -1], rot: Math.PI, corner: false };
  return { x: h, z: -10 + 2 * (i - 30), a: [0, -1], o: [1, 0], rot: -Math.PI / 2, corner: false };
}

/** Konversi koordinat lokal petak (lx sepanjang, ly ke arah luar) ke dunia. */
export function tileLocal(i: number, lx: number, ly: number) {
  const f = tileFrame(i);
  return { x: f.x + f.a[0] * lx + f.o[0] * ly, z: f.z + f.a[1] * lx + f.o[1] * ly };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = '800', family = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 1; } while (ctx.measureText(text).width > maxW && s > 8);
}

// ---------------------------------------------------------------- ikon vektor sederhana
function icon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const fillStroke = (fill: string, stroke = '#1d2347', lw = s * 0.06) => { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); };
  switch (kind) {
    case 'train':
      roundRect(ctx, -s * 0.4, -s * 0.38, s * 0.8, s * 0.62, s * 0.12); fillStroke('#e23b3b');
      roundRect(ctx, -s * 0.3, -s * 0.28, s * 0.6, s * 0.22, s * 0.05); fillStroke('#bfe7ff');
      for (const dx of [-0.22, 0.22]) { ctx.beginPath(); ctx.arc(dx * s, s * 0.3, s * 0.1, 0, Math.PI * 2); fillStroke('#333'); }
      break;
    case 'ship':
      ctx.beginPath(); ctx.moveTo(-s * 0.48, s * 0.05); ctx.lineTo(s * 0.48, s * 0.05); ctx.lineTo(s * 0.32, s * 0.32); ctx.lineTo(-s * 0.36, s * 0.32); ctx.closePath(); fillStroke('#8a4b22');
      ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.45); ctx.lineTo(-s * 0.05, s * 0.0); ctx.lineTo(-s * 0.38, s * 0.0); ctx.closePath(); fillStroke('#fff');
      ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.4); ctx.lineTo(s * 0.05, s * 0.0); ctx.lineTo(s * 0.34, s * 0.0); ctx.closePath(); fillStroke('#fff');
      break;
    case 'plane':
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.46, s * 0.1, -0.5, 0, Math.PI * 2); fillStroke('#e9eef7');
      ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.02); ctx.lineTo(s * 0.12, -s * 0.36); ctx.lineTo(s * 0.2, -s * 0.33); ctx.lineTo(s * 0.12, s * 0.02); ctx.closePath(); fillStroke('#1f6feb');
      ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.02); ctx.lineTo(-s * 0.2, s * 0.32); ctx.lineTo(-s * 0.1, s * 0.33); ctx.lineTo(s * 0.08, s * 0.05); ctx.closePath(); fillStroke('#1f6feb');
      break;
    case 'bolt':
      ctx.beginPath(); ctx.moveTo(s * 0.1, -s * 0.45); ctx.lineTo(-s * 0.25, s * 0.05); ctx.lineTo(0, s * 0.05); ctx.lineTo(-s * 0.1, s * 0.45); ctx.lineTo(s * 0.25, -s * 0.08); ctx.lineTo(0, -s * 0.08); ctx.closePath(); fillStroke('#f5cf2a');
      break;
    case 'drop':
      ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.bezierCurveTo(s * 0.35, -s * 0.05, s * 0.32, s * 0.38, 0, s * 0.38); ctx.bezierCurveTo(-s * 0.32, s * 0.38, -s * 0.35, -s * 0.05, 0, -s * 0.42); fillStroke('#3ab0ff');
      break;
    case 'question':
      ctx.font = `900 ${s * 0.95}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = s * 0.08; ctx.strokeStyle = '#7a3b00'; ctx.strokeText('?', 0, s * 0.04); ctx.fillStyle = '#f5a623'; ctx.fillText('?', 0, s * 0.04);
      break;
    case 'chest':
      roundRect(ctx, -s * 0.42, -s * 0.12, s * 0.84, s * 0.46, s * 0.06); fillStroke('#c98a2e');
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.1); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.42, -s * 0.1); ctx.closePath(); fillStroke('#e0a845');
      roundRect(ctx, -s * 0.08, -s * 0.06, s * 0.16, s * 0.18, s * 0.03); fillStroke('#f5cf2a');
      break;
    case 'gunungan': // siluet gunungan wayang (kartu budaya)
      ctx.beginPath(); ctx.moveTo(0, -s * 0.46); ctx.bezierCurveTo(s * 0.3, -s * 0.2, s * 0.42, s * 0.15, s * 0.3, s * 0.4); ctx.lineTo(-s * 0.3, s * 0.4); ctx.bezierCurveTo(-s * 0.42, s * 0.15, -s * 0.3, -s * 0.2, 0, -s * 0.46); fillStroke('#7b2fbe');
      ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(0, s * 0.35); ctx.moveTo(0, -s * 0.05); ctx.lineTo(s * 0.15, -s * 0.18); ctx.moveTo(0, s * 0.08); ctx.lineTo(-s * 0.15, -s * 0.04); ctx.strokeStyle = '#f5cf2a'; ctx.lineWidth = s * 0.05; ctx.stroke();
      break;
    case 'tax':
      roundRect(ctx, -s * 0.3, -s * 0.4, s * 0.6, s * 0.8, s * 0.05); fillStroke('#ffffff');
      ctx.fillStyle = '#1d2347';
      for (let k = 0; k < 4; k++) ctx.fillRect(-s * 0.2, -s * 0.25 + k * s * 0.14, s * 0.4, s * 0.04);
      ctx.beginPath(); ctx.arc(s * 0.18, s * 0.28, s * 0.13, 0, Math.PI * 2); fillStroke('#e23b3b');
      break;
    case 'jail':
      roundRect(ctx, -s * 0.42, -s * 0.42, s * 0.84, s * 0.84, s * 0.06); fillStroke('#f39221');
      ctx.fillStyle = '#2b2b2b';
      for (let k = -2; k <= 2; k++) ctx.fillRect(k * s * 0.16 - s * 0.03, -s * 0.38, s * 0.06, s * 0.76);
      break;
    case 'car':
      roundRect(ctx, -s * 0.44, -s * 0.05, s * 0.88, s * 0.28, s * 0.08); fillStroke('#e23b3b');
      ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.05); ctx.lineTo(-s * 0.14, -s * 0.28); ctx.lineTo(s * 0.18, -s * 0.28); ctx.lineTo(s * 0.3, -s * 0.05); ctx.closePath(); fillStroke('#bfe7ff');
      for (const dx of [-0.25, 0.25]) { ctx.beginPath(); ctx.arc(dx * s, s * 0.24, s * 0.1, 0, Math.PI * 2); fillStroke('#333'); }
      break;
    case 'police':
      ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.36, 0, Math.PI * 2); fillStroke('#1f4fbf');
      ctx.beginPath(); ctx.moveTo(0, -s * 0.22); ctx.lineTo(s * 0.18, -s * 0.05); ctx.lineTo(s * 0.12, s * 0.22); ctx.lineTo(-s * 0.12, s * 0.22); ctx.lineTo(-s * 0.18, -s * 0.05); ctx.closePath(); fillStroke('#f5cf2a');
      break;
    case 'start':
      ctx.beginPath(); ctx.moveTo(s * 0.45, 0); ctx.lineTo(s * 0.05, -s * 0.35); ctx.lineTo(s * 0.05, -s * 0.14); ctx.lineTo(-s * 0.45, -s * 0.14); ctx.lineTo(-s * 0.45, s * 0.14); ctx.lineTo(s * 0.05, s * 0.14); ctx.lineTo(s * 0.05, s * 0.35); ctx.closePath(); fillStroke('#e23b3b', '#fff');
      break;
    default: break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- landmark mini di petak properti
function landmarkGlyph(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.globalAlpha = 0.85;
  const L = name.toLowerCase();
  ctx.beginPath();
  if (L.includes('monas') || L.includes('tugu') || L.includes('jam')) {
    ctx.moveTo(-s * 0.05, s * 0.4); ctx.lineTo(-s * 0.03, -s * 0.3); ctx.lineTo(0, -s * 0.42); ctx.lineTo(s * 0.03, -s * 0.3); ctx.lineTo(s * 0.05, s * 0.4);
    ctx.rect(-s * 0.3, s * 0.32, s * 0.6, s * 0.08);
  } else if (L.includes('gunung') || L.includes('bromo') || L.includes('rinjani') || L.includes('danau')) {
    ctx.moveTo(-s * 0.45, s * 0.38); ctx.lineTo(-s * 0.08, -s * 0.3); ctx.lineTo(s * 0.05, -s * 0.18); ctx.lineTo(s * 0.18, -s * 0.32); ctx.lineTo(s * 0.45, s * 0.38);
  } else if (L.includes('candi') || L.includes('pura') || L.includes('keraton')) {
    for (let k = 0; k < 4; k++) ctx.rect(-s * (0.4 - k * 0.09), s * (0.3 - k * 0.15), s * (0.8 - k * 0.18), s * 0.12);
    ctx.moveTo(-s * 0.04, -s * 0.3); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.04, -s * 0.3);
  } else if (L.includes('jembatan')) {
    ctx.rect(-s * 0.45, s * 0.1, s * 0.9, s * 0.07);
    ctx.rect(-s * 0.3, -s * 0.3, s * 0.06, s * 0.6); ctx.rect(s * 0.24, -s * 0.3, s * 0.06, s * 0.6);
  } else if (L.includes('rumah') || L.includes('lawang') || L.includes('gedung') || L.includes('benteng')) {
    ctx.rect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.4);
    ctx.moveTo(-s * 0.45, -s * 0.02); ctx.quadraticCurveTo(-s * 0.3, -s * 0.15, -s * 0.48, -s * 0.38); ctx.lineTo(0, -s * 0.18); ctx.lineTo(s * 0.48, -s * 0.38); ctx.quadraticCurveTo(s * 0.3, -s * 0.15, s * 0.45, -s * 0.02);
  } else {
    // ombak / pantai
    for (let k = 0; k < 3; k++) { ctx.moveTo(-s * 0.4, s * (-0.15 + k * 0.18)); ctx.quadraticCurveTo(-s * 0.2, s * (-0.3 + k * 0.18), 0, s * (-0.15 + k * 0.18)); ctx.quadraticCurveTo(s * 0.2, s * (0 + k * 0.18), s * 0.4, s * (-0.15 + k * 0.18)); ctx.lineTo(s * 0.4, s * (-0.09 + k * 0.18)); ctx.quadraticCurveTo(s * 0.2, s * (0.06 + k * 0.18), 0, s * (-0.09 + k * 0.18)); ctx.quadraticCurveTo(-s * 0.2, s * (-0.24 + k * 0.18), -s * 0.4, s * (-0.09 + k * 0.18)); }
  }
  ctx.fill();
  ctx.restore();
}

/** Gambar seluruh permukaan papan ke satu kanvas (1 tekstur → 1 draw call, teks tajam). */
export function boardTexture(size = 2048, tiles: any[] = TILES, groups: any = GROUPS) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const u = size / BOARD; // piksel per unit
  // dasar
  const grd = ctx.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, '#fbf6ea'); grd.addColorStop(1, '#f1e6cc');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, size, size);
  // tengah (akan tertutup diorama) – pola batik kawung lembut
  ctx.fillStyle = '#1aa3c7'; ctx.fillRect(CORNER * u, CORNER * u, (BOARD - 2 * CORNER) * u, (BOARD - 2 * CORNER) * u);
  ctx.globalAlpha = 0.12; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = u * 0.05;
  for (let gx = CORNER; gx < BOARD - CORNER; gx += 1.2) for (let gz = CORNER; gz < BOARD - CORNER; gz += 1.2) {
    ctx.beginPath(); ctx.ellipse((gx + 0.6) * u, (gz + 0.3) * u, u * 0.18, u * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse((gx + 0.3) * u, (gz + 0.6) * u, u * 0.28, u * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const t of tiles) {
    const f = tileFrame(t.i);
    const w = (f.corner ? CORNER : TILE_W) * u;
    const d = CORNER * u;
    ctx.save();
    ctx.translate((f.x + BOARD / 2) * u, (f.z + BOARD / 2) * u);
    ctx.rotate(f.rot);
    // kotak petak (lokal: x sepanjang, y ke luar)
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = '#1d2347'; ctx.lineWidth = u * 0.04;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const title = (txt: string, y: number, size: number, color = '#1d2347', maxW = w * 0.9) => { fitText(ctx, txt, maxW, size); ctx.fillStyle = color; ctx.fillText(txt, 0, y); };
    if (t.type === 'property') {
      const col = groups[t.group].color;
      // pita warna kelompok di sisi dalam
      const band = d * 0.24;
      const bg = ctx.createLinearGradient(0, -d / 2, 0, -d / 2 + band);
      bg.addColorStop(0, col); bg.addColorStop(1, shade(col, -18));
      ctx.fillStyle = bg; ctx.fillRect(-w / 2, -d / 2, w, band);
      ctx.strokeRect(-w / 2, -d / 2, w, band);
      landmarkGlyph(ctx, t.landmark || '', 0, -d * 0.02, u * 0.85, shade(col, -30));
      title(t.name.toUpperCase(), d * 0.2, u * 0.34);
      title(rpShort(t.price), d * 0.36, u * 0.3, '#b3122e');
    } else if (t.type === 'transport') {
      icon(ctx, t.name.includes('Bandara') ? 'plane' : t.name.includes('Pelabuhan') ? 'ship' : 'train', 0, -d * 0.1, u * 1.05);
      title(t.name.toUpperCase(), d * 0.21, u * 0.24);
      title(rpShort(t.price), d * 0.36, u * 0.3, '#b3122e');
    } else if (t.type === 'utility') {
      icon(ctx, t.name.includes('Listrik') ? 'bolt' : 'drop', 0, -d * 0.1, u * 1.0);
      title(t.name.toUpperCase(), d * 0.21, u * 0.24);
      title(rpShort(t.price), d * 0.36, u * 0.3, '#b3122e');
    } else if (t.type === 'chance' || t.type === 'chest' || t.type === 'budaya') {
      const bgc = t.type === 'chance' ? '#ffe9c2' : t.type === 'chest' ? '#d9ecff' : '#efe0ff';
      ctx.fillStyle = bgc; ctx.fillRect(-w / 2 + u * 0.05, -d / 2 + u * 0.05, w - u * 0.1, d - u * 0.1);
      icon(ctx, t.type === 'chance' ? 'question' : t.type === 'chest' ? 'chest' : 'gunungan', 0, -d * 0.08, u * 1.15);
      title(t.name.toUpperCase(), d * 0.3, u * 0.3, t.type === 'chance' ? '#b3122e' : t.type === 'chest' ? '#1f4fbf' : '#6b21a8');
    } else if (t.type === 'tax') {
      icon(ctx, 'tax', 0, -d * 0.1, u * 0.95);
      title(t.name.toUpperCase(), d * 0.2, u * 0.24);
      title(`Bayar ${rpShort(t.amount)}`, d * 0.36, u * 0.26, '#b3122e');
    } else if (t.type === 'start') {
      const sg = ctx.createLinearGradient(-w / 2, -d / 2, w / 2, d / 2);
      sg.addColorStop(0, '#fff3e0'); sg.addColorStop(1, '#ffd9d9');
      ctx.fillStyle = sg; ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.save(); ctx.rotate(-Math.PI / 4);
      title('START', -u * 0.15, u * 0.95, '#c81e1e', w * 1.1);
      icon(ctx, 'start', 0, u * 0.75, u * 1.2);
      ctx.restore();
      ctx.save(); ctx.rotate(-Math.PI / 4);
      title(`Terima ${rpShort(2_000_000)}`, -u * 0.95, u * 0.28, '#1d2347', w);
      ctx.restore();
    } else if (t.type === 'jail') {
      // kotak sel di sudut dalam
      ctx.fillStyle = '#ffe1b8'; ctx.fillRect(-w / 2, -d / 2, w * 0.66, d * 0.66);
      icon(ctx, 'jail', -w / 2 + w * 0.33, -d / 2 + d * 0.33, u * 1.6);
      ctx.save(); ctx.translate(-w / 2 + w * 0.33, -d / 2 + d * 0.33); ctx.rotate(-Math.PI / 4); title('PENJARA', 0, u * 0.32, '#ffffff', u * 1.8); ctx.restore();
      ctx.fillStyle = '#1d2347'; ctx.font = `800 ${u * 0.24}px system-ui, sans-serif`;
      ctx.save(); ctx.translate(-w / 2 + w * 0.83, -u * 0.2); ctx.rotate(Math.PI / 2); ctx.fillText('HANYA', 0, 0); ctx.restore();
      ctx.fillText('BERKUNJUNG', 0, d / 2 - u * 0.25);
    } else if (t.type === 'parking') {
      ctx.save(); ctx.rotate(Math.PI * 0.75);
      icon(ctx, 'car', 0, -u * 0.2, u * 1.5);
      title('BEBAS PARKIR', u * 0.75, u * 0.34, '#c81e1e', w);
      ctx.restore();
    } else if (t.type === 'gotojail') {
      ctx.save(); ctx.rotate(-Math.PI * 0.75);
      icon(ctx, 'police', 0, -u * 0.25, u * 1.3);
      title('MASUK PENJARA', u * 0.7, u * 0.32, '#1f4fbf', w);
      ctx.restore();
    }
    ctx.restore();
  }
  // bingkai luar emas
  ctx.strokeStyle = '#c9952b'; ctx.lineWidth = u * 0.12; ctx.strokeRect(u * 0.06, u * 0.06, size - u * 0.12, size - u * 0.12);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- dadu
export function diceFaces(face = '#ffffff', pip = '#c81e1e') {
  const pos: Record<number, number[][]> = {
    1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
  };
  const order = [3, 4, 1, 6, 2, 5]; // +x,-x,+y,-y,+z,-z
  return order.map((v) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = face; ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 90); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = v === 1 ? '#c81e1e' : pip;
    for (const [x, y] of pos[v]) { ctx.beginPath(); ctx.arc(x * 128, y * 128, v === 1 ? 17 : 12, 0, Math.PI * 2); ctx.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: face === '#f2c14e' ? 0.5 : 0.05 });
  });
}

// ---------------------------------------------------------------- banner judul & teks
export function bannerTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 360;
  const ctx = cv.getContext('2d')!;
  // pita merah
  ctx.save();
  ctx.translate(512, 220);
  ctx.beginPath(); ctx.moveTo(-470, -40); ctx.lineTo(-400, -60); ctx.lineTo(400, -60); ctx.lineTo(470, -40); ctx.lineTo(450, 70); ctx.lineTo(380, 60); ctx.lineTo(-380, 60); ctx.lineTo(-450, 70); ctx.closePath();
  const rg = ctx.createLinearGradient(0, -60, 0, 70); rg.addColorStop(0, '#ff5a4f'); rg.addColorStop(1, '#b3122e');
  ctx.fillStyle = rg; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = '#f5c842'; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '900 76px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('INDONESIA', 0, 4);
  ctx.restore();
  // judul MONOPOLI
  ctx.font = '900 150px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 26; ctx.strokeStyle = '#7a0f1f'; ctx.strokeText('MONOPOLI', 512, 105);
  ctx.lineWidth = 12; ctx.strokeStyle = '#f5c842'; ctx.strokeText('MONOPOLI', 512, 105);
  const tg = ctx.createLinearGradient(0, 40, 0, 170); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#ffe7a8');
  ctx.fillStyle = tg; ctx.fillText('MONOPOLI', 512, 105);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function textSprite(text: string, color = '#ffffff', stroke = '#1d2347', size = 64) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width + size * 0.6);
  cv.width = w; cv.height = Math.ceil(size * 1.5);
  ctx.font = `900 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.18; ctx.strokeStyle = stroke; ctx.strokeText(text, w / 2, cv.height / 2);
  ctx.fillStyle = color; ctx.fillText(text, w / 2, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set((w / cv.height) * 0.7, 0.7, 1);
  return sp;
}

export function mortgageTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 384;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(30,30,40,0.55)'; ctx.fillRect(0, 0, 256, 384);
  ctx.save(); ctx.translate(128, 192); ctx.rotate(-0.5);
  ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 10; ctx.strokeRect(-110, -40, 220, 80);
  ctx.fillStyle = '#ffdddd'; ctx.font = '900 46px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('GADAI', 0, 4);
  ctx.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { rpShort, rpFull };
