// Diorama miniatur Nusantara di tengah papan: Monas, candi bertingkat, gunung berapi, rumah gadang,
// meru Bali, kapal pinisi, pohon kelapa, awan. Semua dibangun dari geometri prosedural.
import * as THREE from 'three';
import { mat } from './characters';
import { bannerTexture } from './textures';
import { mergeStatic } from './merge';

function m(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, material);
  o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true;
  return o;
}

function monas() {
  const g = new THREE.Group();
  const white = mat('#f4f1ea', { rough: 0.45 });
  g.add(m(new THREE.BoxGeometry(2.2, 0.18, 2.2), mat('#d9d2c3'), 0, 0.09, 0));
  g.add(m(new THREE.BoxGeometry(1.5, 0.35, 1.5), white, 0, 0.35, 0));
  const cup = m(new THREE.CylinderGeometry(0.72, 0.42, 0.18, 4), white, 0, 0.6, 0); cup.rotation.y = Math.PI / 4; g.add(cup);
  const shaft = m(new THREE.CylinderGeometry(0.13, 0.3, 3.2, 4), white, 0, 2.25, 0); shaft.rotation.y = Math.PI / 4; g.add(shaft);
  g.add(m(new THREE.CylinderGeometry(0.28, 0.16, 0.2, 12), white, 0, 3.92, 0));
  const flame = m(new THREE.ConeGeometry(0.2, 0.62, 12), mat('#f6c443', { rough: 0.2, metal: 0.8, emissive: '#c98a00' }), 0, 4.33, 0);
  g.add(flame);
  g.userData.flame = flame;
  return g;
}

function stupa(r: number, material: THREE.Material) {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r * 1.02, r * 0.35), new THREE.Vector2(r * 0.85, r * 0.85), new THREE.Vector2(r * 0.45, r * 1.15), new THREE.Vector2(r * 0.18, r * 1.25), new THREE.Vector2(r * 0.12, r * 1.7), new THREE.Vector2(0, r * 1.9)];
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 16), material);
}

function candi() {
  const g = new THREE.Group();
  const stone = mat('#8f8a7f', { rough: 0.95 });
  const dark = mat('#6f6a60', { rough: 0.95 });
  for (let k = 0; k < 5; k++) {
    const s = 3 - k * 0.45;
    g.add(m(new THREE.BoxGeometry(s, 0.26, s), k % 2 ? dark : stone, 0, 0.13 + k * 0.26, 0));
  }
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 8 : 12; const rad = ring ? 0.55 : 0.85;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const s = stupa(0.11, stone); s.position.set(Math.cos(a) * rad, 1.3 + ring * 0.12, Math.sin(a) * rad); s.castShadow = true; g.add(s);
    }
  }
  const main = stupa(0.32, stone); main.position.y = 1.35; main.castShadow = true; g.add(main);
  return g;
}

function volcano() {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector2(2.4 * (1 - t) ** 1.35 + 0.35 * t, t * 3)); }
  pts.push(new THREE.Vector2(0.25, 2.85));
  const cone = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const pos = cone.geometry.attributes.position;
  const colors = [];
  const green = new THREE.Color('#3f8f3a'); const brown = new THREE.Color('#8a6a4a'); const gray = new THREE.Color('#6d6259');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 3;
    const c = y < 0.45 ? green.clone().lerp(brown, y / 0.45) : brown.clone().lerp(gray, (y - 0.45) / 0.55);
    colors.push(c.r, c.g, c.b);
  }
  cone.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  cone.castShadow = true; cone.receiveShadow = true;
  g.add(cone);
  const smoke: THREE.Mesh[] = [];
  const smat = new THREE.MeshStandardMaterial({ color: '#eeeeee', transparent: true, opacity: 0.55, roughness: 1 });
  for (let k = 0; k < 6; k++) { const s = m(new THREE.SphereGeometry(0.28, 10, 8), smat.clone(), 0, 3 + k * 0.4, 0, false); smoke.push(s); g.add(s); }
  g.userData.smoke = smoke;
  return g;
}

function rumahGadang() {
  const g = new THREE.Group();
  // panggung
  for (const x of [-0.8, 0, 0.8]) for (const z of [-0.35, 0.35]) g.add(m(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), mat('#5b3a22'), x, 0.2, z));
  g.add(m(new THREE.BoxGeometry(2.0, 0.6, 1.0), mat('#8b3a1e', { rough: 0.7 }), 0, 0.7, 0));
  // ukiran
  for (let k = -3; k <= 3; k++) g.add(m(new THREE.BoxGeometry(0.18, 0.4, 0.02), mat(k % 2 ? '#d9a441' : '#2a5a8a', { rough: 0.5 }), k * 0.26, 0.72, 0.51, false));
  // atap gonjong melengkung (extrude)
  const sh = new THREE.Shape();
  sh.moveTo(-1.35, 0.95); sh.quadraticCurveTo(-0.9, 0.05, -0.45, 0.35); sh.quadraticCurveTo(-0.22, 0.05, 0, 0.42); sh.quadraticCurveTo(0.22, 0.05, 0.45, 0.35);
  sh.quadraticCurveTo(0.9, 0.05, 1.35, 0.95); sh.lineTo(1.15, 0.0); sh.lineTo(-1.15, 0.0); sh.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.15, bevelEnabled: false, curveSegments: 12 }), mat('#2b2420', { rough: 0.95 }));
  roof.position.set(0, 0.98, -0.575); roof.castShadow = true;
  g.add(roof);
  for (const x of [-1.35, -0.45, 0, 0.45, 1.35]) g.add(m(new THREE.ConeGeometry(0.04, 0.25, 6), mat('#d9a441', { metal: 0.6, rough: 0.3 }), x, x === 0 ? 1.5 : Math.abs(x) > 1 ? 2.05 : 1.45, 0));
  return g;
}

function meru() {
  const g = new THREE.Group();
  g.add(m(new THREE.BoxGeometry(1.0, 0.5, 1.0), mat('#b5523b', { rough: 0.9 }), 0, 0.25, 0));
  g.add(m(new THREE.BoxGeometry(0.7, 0.4, 0.7), mat('#d8c7a2'), 0, 0.7, 0));
  const thatch = mat('#2e2620', { rough: 1 });
  for (let k = 0; k < 5; k++) {
    const r = 0.85 - k * 0.13;
    const tier = m(new THREE.CylinderGeometry(r * 0.55, r, 0.22, 4), thatch, 0, 1.0 + k * 0.32, 0);
    tier.rotation.y = Math.PI / 4; g.add(tier);
    if (k < 4) g.add(m(new THREE.BoxGeometry(0.2, 0.1, 0.2), mat('#5b3a22'), 0, 1.16 + k * 0.32, 0));
  }
  g.add(m(new THREE.ConeGeometry(0.06, 0.3, 6), mat('#f2c14e', { metal: 0.6 }), 0, 2.7, 0));
  return g;
}

function pinisi() {
  const g = new THREE.Group();
  const hs = new THREE.Shape();
  hs.moveTo(-1.1, 0.35); hs.quadraticCurveTo(-0.6, -0.05, 0, -0.08); hs.quadraticCurveTo(0.7, -0.05, 1.25, 0.45); hs.lineTo(-1.1, 0.35);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }), mat('#7a3f1d', { rough: 0.7 }));
  hull.position.z = -0.25; hull.castShadow = true; g.add(hull);
  g.add(m(new THREE.BoxGeometry(2.1, 0.06, 0.45), mat('#c98a4a'), 0.05, 0.36, 0));
  for (const x of [-0.35, 0.35]) g.add(m(new THREE.CylinderGeometry(0.025, 0.03, 1.7, 6), mat('#4a2d17'), x, 1.2, 0));
  const sail = new THREE.MeshStandardMaterial({ color: '#fbf6ea', side: THREE.DoubleSide, roughness: 0.8 });
  for (const x of [-0.35, 0.35]) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, 1.25); s.lineTo(0.55, 0.15); s.closePath();
    const sm = new THREE.Mesh(new THREE.ShapeGeometry(s), sail); sm.position.set(x + 0.03, 0.45, 0); sm.castShadow = true; g.add(sm);
  }
  const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(-0.02, 1.0); jib.lineTo(0.75, 0.05); jib.closePath();
  const jm = new THREE.Mesh(new THREE.ShapeGeometry(jib), sail); jm.position.set(0.4, 0.5, 0.01); g.add(jm);
  const flag = m(new THREE.BoxGeometry(0.22, 0.07, 0.01), mat('#e23b3b'), 0.47, 2.0, 0, false); g.add(flag);
  g.add(m(new THREE.BoxGeometry(0.22, 0.07, 0.01), mat('#ffffff'), 0.47, 1.93, 0, false));
  return g;
}

function palm(h = 1.6) {
  const g = new THREE.Group();
  const trunk = m(new THREE.CylinderGeometry(0.05, 0.09, h, 7), mat('#8a6a43', { rough: 1 }), 0.1, h / 2, 0);
  trunk.rotation.z = -0.12; g.add(trunk);
  const leaf = mat('#2f9e44', { rough: 0.8 });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const l = m(new THREE.ConeGeometry(0.09, 0.95, 4), leaf, 0.2 + Math.cos(a) * 0.38, h - 0.05, Math.sin(a) * 0.38);
    l.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    g.add(l);
  }
  for (let k = 0; k < 3; k++) g.add(m(new THREE.SphereGeometry(0.06, 8, 6), mat('#6b4a1f'), 0.18 + (k - 1) * 0.07, h - 0.12, 0.05));
  return g;
}

function tree(scale = 1) {
  const g = new THREE.Group();
  g.add(m(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6), mat('#6b4a2b'), 0, 0.2, 0));
  g.add(m(new THREE.SphereGeometry(0.32, 10, 8), mat('#3fa34d', { rough: 0.9 }), 0, 0.55, 0));
  g.add(m(new THREE.SphereGeometry(0.22, 10, 8), mat('#52b85e', { rough: 0.9 }), 0.15, 0.75, 0.05));
  g.scale.setScalar(scale);
  return g;
}

function cloud() {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 });
  for (let k = 0; k < 5; k++) g.add(m(new THREE.SphereGeometry(0.5 + Math.random() * 0.35, 12, 10), cm, k * 0.55 - 1.1, Math.random() * 0.25, Math.random() * 0.4, false));
  return g;
}

export function buildDiorama(quality: 'low' | 'medium' | 'high') {
  const root = new THREE.Group();
  root.name = 'diorama';
  // Air laut di area tengah
  const water = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 17.6, 1, 1), new THREE.MeshStandardMaterial({ color: '#2bb3d9', roughness: 0.15, metalness: 0.15, emissive: '#0a4f6b', emissiveIntensity: 0.25 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.33; water.receiveShadow = true;
  root.add(water);
  // Pulau
  const island = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 7.3, 0.5, 64), mat('#59b25a', { rough: 0.95 }));
  island.position.y = 0.45; island.scale.z = 0.92; island.receiveShadow = true;
  root.add(island);
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(7.35, 7.6, 0.18, 64), mat('#f0dca0', { rough: 1 }));
  beach.position.y = 0.32; beach.scale.z = 0.92; beach.receiveShadow = true;
  root.add(beach);
  const top = 0.7;

  const mon = monas(); mon.position.set(0, top, -1.2); root.add(mon);
  const cdi = candi(); cdi.position.set(-3.6, top, -2.6); cdi.scale.setScalar(0.95); root.add(cdi);
  const vol = volcano(); vol.position.set(3.7, top, -3.0); vol.scale.setScalar(0.95); root.add(vol);
  const rg = rumahGadang(); rg.position.set(-3.9, top, 1.4); rg.rotation.y = 0.35; root.add(rg);
  const mr = meru(); mr.position.set(4.0, top, 1.0); mr.rotation.y = -0.3; root.add(mr);
  const ship = pinisi(); ship.position.set(6.6, 0.33, 5.9); ship.rotation.y = -0.6; ship.scale.setScalar(0.85); root.add(ship);
  const ship2 = pinisi(); ship2.position.set(-6.9, 0.33, -6.2); ship2.rotation.y = 2.3; ship2.scale.setScalar(0.7); root.add(ship2);

  // Banner judul
  const bt = bannerTexture();
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.6), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false }));
  banner.position.set(0, 1.55, 3.2); banner.rotation.x = -0.55;
  banner.renderOrder = 2;
  root.add(banner);

  // Vegetasi
  const palms: THREE.Object3D[] = [];
  const spots = [[-5.6, 3.6], [5.7, 3.4], [-1.9, 2.0], [2.2, 2.3], [-5.9, -1.0], [6.0, -1.0], [-1.7, -3.9], [1.6, -4.4], [0.2, -4.8], [-2.7, 4.6], [2.9, 4.7]];
  const nPalm = quality === 'low' ? 5 : spots.length;
  for (let k = 0; k < nPalm; k++) { const p = palm(1.3 + (k % 3) * 0.25); p.position.set(spots[k][0], top, spots[k][1]); p.rotation.y = k; root.add(p); palms.push(p); }
  if (quality !== 'low') {
    const ts = [[-2.4, -1.6], [2.0, -1.8], [-4.8, -3.8], [5.2, -4.4], [-0.9, 4.2], [1.0, 4.4], [-6.2, 1.8], [6.3, 2.2], [-4.9, 3.0], [4.9, -0.2]];
    for (const [x, z] of ts) { const t = tree(0.7 + Math.random() * 0.5); t.position.set(x, top, z); root.add(t); }
    // rumah kecil warga
    for (const [x, z, r] of [[-2.4, 0.4, 0.3], [2.6, 0.2, -0.4], [-1.0, -3.0, 0], [1.2, -2.9, 0.2]]) {
      const h = new THREE.Group();
      h.add(m(new THREE.BoxGeometry(0.5, 0.35, 0.45), mat('#fff3d6'), 0, 0.175, 0));
      const roof = m(new THREE.ConeGeometry(0.42, 0.3, 4), mat('#c2462f'), 0, 0.5, 0); roof.rotation.y = Math.PI / 4; h.add(roof);
      h.position.set(x, top, z); h.rotation.y = r; root.add(h);
    }
  }
  // Awan
  const clouds: THREE.Object3D[] = [];
  if (quality !== 'low') {
    for (const [x, y, z] of [[-9, 7, -6], [8, 8, -9], [11, 6.5, 6], [-12, 7.5, 7]]) { const c = cloud(); c.position.set(x, y, z); root.add(c); clouds.push(c); }
  }
  // gabungkan semua geometri statis (pulau, landmark, pohon, rumah) per material → sedikit draw call
  mergeStatic(root, [mon.userData.flame, ...vol.userData.smoke, ship, ship2, ...clouds, water, banner]);
  root.userData = { flame: mon.userData.flame, smoke: vol.userData.smoke, ships: [ship, ship2], clouds, water, palms: [] };
  return root;
}

export function animateDiorama(root: THREE.Object3D, t: number) {
  const u = root.userData;
  if (u.flame) { u.flame.scale.y = 1 + Math.sin(t * 9) * 0.08; (u.flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.sin(t * 13) * 0.15; }
  if (u.smoke) u.smoke.forEach((s: THREE.Mesh, k: number) => {
    const p = ((t * 0.25 + k / u.smoke.length) % 1);
    s.position.y = 3 + p * 2.6; s.position.x = Math.sin(p * 4 + k) * 0.3 * p;
    s.scale.setScalar(0.6 + p * 1.6);
    (s.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - p);
  });
  if (u.ships) u.ships.forEach((s: THREE.Object3D, k: number) => { s.position.y = 0.33 + Math.sin(t * 1.4 + k) * 0.04; s.rotation.z = Math.sin(t * 1.1 + k) * 0.04; });
  if (u.clouds) u.clouds.forEach((c: THREE.Object3D, k: number) => { c.position.x += 0.004 * (k % 2 ? 1 : -1); if (c.position.x > 16) c.position.x = -16; if (c.position.x < -16) c.position.x = 16; });
  if (u.water) (u.water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.22 + Math.sin(t * 0.8) * 0.06;
  if (u.palms) u.palms.forEach((p: THREE.Object3D, k: number) => { p.rotation.z = Math.sin(t * 1.2 + k) * 0.025; });
}
