// Karakter chibi 3D prosedural berpakaian adat Nusantara (aset original, tanpa model pihak ketiga).
import * as THREE from 'three';
import { CHARACTERS } from '@shared/catalog.js';
import { mergeStatic } from './merge';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string } = {}) {
  const k = `${color}|${opts.rough ?? 0.6}|${opts.metal ?? 0}|${opts.emissive || ''}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0 });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 0.35; }
    matCache.set(k, m);
  }
  return m;
}

const S = (r: number, w = 20, h = 16) => new THREE.SphereGeometry(r, w, h);

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

export function charById(id: string) {
  return CHARACTERS.find((c: any) => c.id === id) || CHARACTERS[0];
}

/**
 * Bangun karakter. Tinggi total ±1.25 unit, titik pivot di kaki.
 * @param id id karakter
 * @param base warna alas pion (skin pion)
 */
export function buildCharacter(id: string, base?: { base: string; ring: string | null }, ringColor?: string) {
  const c: any = charById(id);
  const p = c.palette;
  const g = new THREE.Group();
  g.name = `char-${id}`;
  const body = new THREE.Group();
  g.add(body);

  // Alas pion
  if (base) {
    const disc = mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.12, 28), mat(base.base, { rough: 0.35, metal: base.base === '#f2c14e' ? 0.7 : 0.15 }), 0, 0.06, 0);
    disc.receiveShadow = true;
    g.add(disc);
    const ring = mesh(new THREE.TorusGeometry(0.39, 0.035, 8, 32), mat(ringColor || base.ring || '#ffffff', { rough: 0.3, emissive: ringColor || undefined }), 0, 0.12, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    body.position.y = 0.12;
  }

  const skin = mat(p.skin, { rough: 0.7 });
  const outfit = mat(p.body, { rough: 0.55 });
  const accent = mat(p.accent, { rough: 0.35, metal: 0.4 });
  const lower = mat(p.lower, { rough: 0.6 });
  const female = c.gender === 'wanita';

  // Kaki & kain bawah
  if (female) {
    body.add(mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.36, 18), lower, 0, 0.18, 0));
  } else {
    body.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.22, 10), lower, -0.09, 0.11, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.22, 10), lower, 0.09, 0.11, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.14, 18), lower, 0, 0.26, 0)); // kain/sarung
  }
  // Badan
  const torso = mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.34, 18), outfit, 0, 0.5, 0);
  body.add(torso);
  // Sabuk/selempang aksen
  const belt = mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 22), accent, 0, 0.38, 0);
  belt.rotation.x = Math.PI / 2;
  body.add(belt);
  // Kancing / motif
  for (let i = 0; i < 3; i++) body.add(mesh(S(0.018, 8, 6), accent, 0, 0.47 + i * 0.07, 0.17));
  // Lengan
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), outfit, sx * 0.22, 0.5, 0);
    arm.rotation.z = sx * 0.35;
    body.add(arm);
    body.add(mesh(S(0.055, 10, 8), skin, sx * 0.27, 0.37, 0.02));
  }
  // Kepala
  const head = new THREE.Group();
  head.position.y = 0.86;
  body.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), skin, 0, -0.17, 0)); // leher
  head.add(mesh(S(0.22, 24, 18), skin));
  // Rambut
  const hair = mat(p.hair, { rough: 0.8 });
  const hairCap = mesh(new THREE.SphereGeometry(0.228, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.012, -0.015);
  head.add(hairCap);
  if (female) head.add(mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.22, 18, 1, true), hair, 0, -0.07, -0.05));
  // Wajah
  const eye = mat('#1a1410', { rough: 0.2 });
  const white = mat('#ffffff', { rough: 0.2 });
  for (const sx of [-1, 1]) {
    head.add(mesh(S(0.034, 10, 8), eye, sx * 0.075, 0.02, 0.19));
    head.add(mesh(S(0.011, 6, 4), white, sx * 0.068, 0.033, 0.222));
    head.add(mesh(S(0.03, 8, 6), mat('#e8837a', { rough: 0.8 }), sx * 0.13, -0.05, 0.16)); // pipi merona
  }
  const smile = mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI), mat('#7a2b22'), 0, -0.06, 0.205);
  smile.rotation.z = Math.PI;
  head.add(smile);

  // Penutup kepala khas daerah
  const hc = mat(p.hatColor, { rough: 0.5, metal: ['suntiang', 'songkok'].includes(p.hat) ? 0.6 : 0.05 });
  switch (p.hat) {
    case 'blangkon': {
      head.add(mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.13, 24), hc, 0, 0.12, 0));
      head.add(mesh(new THREE.SphereGeometry(0.236, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), hc, 0, 0.13, 0));
      head.add(mesh(S(0.07, 12, 10), hc, 0, 0.06, -0.24)); // mondolan
      head.add(mesh(new THREE.TorusGeometry(0.236, 0.012, 6, 28), mat('#d9a441', { metal: 0.5 }), 0, 0.07, 0).rotateX(Math.PI / 2));
      break;
    }
    case 'sanggul':
      head.add(mesh(S(0.12, 16, 12), hc, 0, 0.06, -0.24));
      head.add(mesh(S(0.03, 8, 6), mat('#f2c14e', { metal: 0.6, rough: 0.3 }), 0.07, 0.12, -0.25));
      head.add(mesh(S(0.03, 8, 6), mat('#ffffff'), -0.08, 0.1, -0.22));
      break;
    case 'bulang': {
      const band = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 24), hc, 0, 0.12, 0);
      head.add(band);
      head.add(mesh(new THREE.ConeGeometry(0.09, 0.22, 4), hc, 0, 0.26, 0.06));
      for (let i = 0; i < 3; i++) head.add(mesh(new THREE.TorusGeometry(0.242, 0.009, 4, 24), accent, 0, 0.08 + i * 0.04, 0).rotateX(Math.PI / 2));
      break;
    }
    case 'suntiang': {
      // mahkota emas berbentuk kipas bertingkat
      for (let row = 0; row < 3; row++) {
        for (let k = -6; k <= 6; k++) {
          const a = (k / 6) * 1.2;
          const len = 0.22 - row * 0.05 - Math.abs(k) * 0.008;
          const leaf = mesh(new THREE.BoxGeometry(0.02, len, 0.012), hc, Math.sin(a) * (0.17 - row * 0.02), 0.2 + Math.cos(a) * 0.05 + len / 2 - row * 0.02, 0.05 - row * 0.04);
          leaf.rotation.z = -a * 0.9;
          head.add(leaf);
          if (row === 0) head.add(mesh(S(0.016, 6, 4), hc, Math.sin(a) * 0.19, 0.2 + Math.cos(a) * 0.05 + len, 0.05));
        }
      }
      break;
    }
    case 'songkok':
      head.add(mesh(new THREE.CylinderGeometry(0.2, 0.235, 0.17, 24), hc, 0, 0.17, 0));
      head.add(mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 24), mat('#7a3b1f'), 0, 0.12, 0).rotateX(Math.PI / 2));
      break;
    case 'peci':
      head.add(mesh(new THREE.CylinderGeometry(0.21, 0.235, 0.15, 24), hc, 0, 0.16, -0.01));
      break;
    case 'udeng': {
      head.add(mesh(new THREE.CylinderGeometry(0.235, 0.24, 0.1, 24), hc, 0, 0.11, 0));
      const peak = mesh(new THREE.ConeGeometry(0.07, 0.16, 4), hc, 0, 0.2, 0.17);
      peak.rotation.x = 0.4;
      head.add(peak);
      break;
    }
    case 'bunga':
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        head.add(mesh(S(0.035, 8, 6), mat('#ffffff', { rough: 0.4 }), 0.2 + Math.cos(a) * 0.04, 0.12 + Math.sin(a) * 0.04, 0.05));
      }
      head.add(mesh(S(0.028, 8, 6), mat('#f5cf2a'), 0.2, 0.12, 0.07));
      head.add(mesh(S(0.1, 14, 10), hair, 0, 0.05, -0.23));
      break;
    case 'bulu': {
      head.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 24), mat('#2a2a2a'), 0, 0.1, 0));
      for (let k = 0; k < 5; k++) head.add(mesh(new THREE.TorusGeometry(0.242, 0.01, 4, 24), accent, 0, 0.075 + k * 0.012, 0).rotateX(Math.PI / 2));
      for (let k = -2; k <= 2; k++) {
        const f = mesh(new THREE.ConeGeometry(0.03, 0.34, 6), mat(k % 2 ? '#ffffff' : '#1a1a1a'), k * 0.05, 0.3, -0.12);
        f.rotation.z = -k * 0.15; f.rotation.x = -0.25;
        head.add(f);
      }
      break;
    }
    default: break;
  }
  // Aksesori khusus
  if (c.id === 'yakob') {
    const noken = mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), mat('#c9873d', { rough: 0.9 }), 0.2, 0.36, 0.08);
    noken.rotation.z = -0.2; body.add(noken);
  }
  if (c.id === 'ucok' || c.id === 'siti') {
    const sash = mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 20, Math.PI), accent, 0, 0.55, 0);
    sash.rotation.set(0.2, 0, 0.9); body.add(sash);
  }
  mergeStatic(body);
  g.userData = { body, head, character: id };
  return g;
}

// ------------------------------------------------------------- potret 2D (render offscreen sekali, lalu di-cache)
const portraitCache = new Map<string, string>();
let pr: THREE.WebGLRenderer | null = null;

export function portrait(id: string, bg = 'transparent'): string {
  const key = `${id}|${bg}`;
  if (portraitCache.has(key)) return portraitCache.get(key)!;
  try {
    if (!pr) {
      const canvas = document.createElement('canvas');
      pr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      pr.setSize(160, 160, false);
      pr.outputColorSpace = THREE.SRGBColorSpace;
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#6b5a7a', 1.6));
    const d = new THREE.DirectionalLight('#fff4dd', 2.2); d.position.set(2, 3, 4); scene.add(d);
    const ch = buildCharacter(id);
    scene.add(ch);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    cam.position.set(0.35, 1.05, 2.3);
    cam.lookAt(0, 0.82, 0);
    pr.setClearColor(0x000000, 0);
    pr.render(scene, cam);
    const url = pr.domElement.toDataURL('image/png');
    portraitCache.set(key, url);
    scene.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
    return url;
  } catch {
    return '';
  }
}
