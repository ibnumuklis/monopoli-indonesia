// Scene 3D papan Monopoli Indonesia: papan, bangunan, pion karakter, dadu, kamera, dan efek.
// Scene hanya MERENDER state dari server; animasi diturunkan dari log event (roll, move, buy, rent, ...).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TILES, GROUPS } from '@shared/board.js';
import { SKINS } from '@shared/catalog.js';
import { buildCharacter, mat } from './characters';
import { boardTexture, tileFrame, tileLocal, diceFaces, textSprite, mortgageTexture, BOARD, rpShort } from './textures';
import { buildDiorama, animateDiorama } from './diorama';
import { sfx } from '../lib/audio';

type Quality = 'low' | 'medium' | 'high';
const SURFACE = 0.31;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Board3D {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  clock = new THREE.Clock();
  quality: Quality;
  me: string | null = null;
  raf = 0;
  tweens: { t0: number; dur: number; fn: (t: number) => void; done: () => void }[] = [];
  queue: (() => Promise<void>)[] = [];
  running = false;
  speed = 1;
  lastSeq = -1;
  game: any = null;
  pawns = new Map<string, { obj: THREE.Group; tile: number; color: string; ring: THREE.Mesh; bankrupt: boolean }>();
  owners = new Map<number, THREE.Object3D>();
  buildings = new Map<number, THREE.Group>();
  mortgaged = new Map<number, THREE.Mesh>();
  dice: THREE.Mesh[] = [];
  diceSkin = 'dice_classic';
  diorama: THREE.Object3D;
  boardTop: THREE.Mesh;
  marker: THREE.Mesh;
  highlight: THREE.Mesh;
  effects: { obj: THREE.Object3D; life: number; max: number; update: (o: THREE.Object3D, k: number, dt: number) => void }[] = [];
  followUntil = 0;
  userInteractUntil = 0;
  camTarget = new THREE.Vector3(0, 0, 1.5);
  activePawn: string | null = null;
  busyCb: (b: boolean) => void = () => {};
  tileClickCb: (i: number) => void = () => {};
  cameraMode: 'follow' | 'free' = 'follow';
  mortTex = mortgageTexture();
  disposed = false;

  constructor(container: HTMLElement, opts: { quality: Quality; me: string | null; camera?: 'follow' | 'free' }) {
    this.container = container;
    this.quality = opts.quality;
    this.me = opts.me;
    this.cameraMode = opts.camera || 'follow';
    const r = new THREE.WebGLRenderer({ antialias: opts.quality !== 'low', powerPreference: 'high-performance', alpha: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === 'high' ? 2 : opts.quality === 'medium' ? 1.5 : 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = opts.quality !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    container.appendChild(r.domElement);
    r.domElement.style.display = 'block';
    r.domElement.style.touchAction = 'none';

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 24, 25);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minPolarAngle = 0.2;
    this.controls.enablePan = true;
    this.controls.target.copy(this.camTarget);
    this.controls.addEventListener('start', () => { this.userInteractUntil = performance.now() + 6000; });

    this.buildEnvironment();
    this.boardTop = this.buildBoard();
    this.diorama = buildDiorama(this.quality);
    this.scene.add(this.diorama);
    this.buildDice();
    // penanda giliran (panah) & sorotan petak
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), mat('#f5c842', { metal: 0.6, rough: 0.25, emissive: '#c98a00' }));
    this.marker.rotation.x = Math.PI;
    this.scene.add(this.marker);
    this.highlight = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0, depthWrite: false }));
    this.highlight.rotation.x = -Math.PI / 2; this.highlight.position.y = SURFACE + 0.012;
    this.scene.add(this.highlight);

    this.resize();
    window.addEventListener('resize', this.resize);
    r.domElement.addEventListener('pointerup', this.onPointer);
    this.loop();
    (window as any).__mi_board = this; // hook diagnostik (FPS/draw call)
  }

  // -------------------------------------------------------------- setup
  buildEnvironment() {
    const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
    const ctx = sky.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5aa9e6'); g.addColorStop(0.55, '#b9e0f7'); g.addColorStop(1, '#f7e7c6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(sky); tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.fog = new THREE.Fog('#cfe6f2', 60, 140);
    this.scene.add(new THREE.HemisphereLight('#fff7e6', '#5a6b8a', 1.15));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    sun.position.set(14, 26, 12);
    sun.castShadow = this.quality !== 'low';
    const sz = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#bcd7ff', 0.5); fill.position.set(-12, 10, -8); this.scene.add(fill);
    // meja kayu di bawah papan
    const table = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 1, 64), mat('#7a4e2d', { rough: 0.8 }));
    table.position.y = -0.55; table.receiveShadow = true;
    this.scene.add(table);
    // kain batik/merah-putih di bawah papan
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), mat('#9e1b2f', { rough: 0.95 }));
    cloth.rotation.x = -Math.PI / 2; cloth.rotation.z = Math.PI / 4; cloth.position.y = -0.04; cloth.receiveShadow = true;
    this.scene.add(cloth);
  }

  buildBoard() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.6, 0.5, BOARD + 0.6), mat('#1d2347', { rough: 0.5 }));
    slab.position.y = 0.05; slab.receiveShadow = true; slab.castShadow = true;
    this.scene.add(slab);
    // bingkai emas
    const gold = mat('#d4a73a', { metal: 0.75, rough: 0.3 });
    for (const [x, z, w, d] of [[0, BOARD / 2 + 0.3, BOARD + 0.8, 0.22], [0, -BOARD / 2 - 0.3, BOARD + 0.8, 0.22], [BOARD / 2 + 0.3, 0, 0.22, BOARD + 0.8], [-BOARD / 2 - 0.3, 0, 0.22, BOARD + 0.8]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.62, d), gold);
      b.position.set(x, 0.08, z); b.castShadow = true; this.scene.add(b);
    }
    const size = this.quality === 'high' ? 4096 : this.quality === 'medium' ? 2048 : 1536;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshStandardMaterial({ map: boardTexture(size), roughness: 0.65 }));
    top.rotation.x = -Math.PI / 2; top.position.y = SURFACE;
    top.receiveShadow = true;
    this.scene.add(top);
    // tepi dalam emas (pembatas area tengah)
    const inner = BOARD - 6;
    for (const [x, z, w, d] of [[0, inner / 2, inner + 0.12, 0.12], [0, -inner / 2, inner + 0.12, 0.12], [inner / 2, 0, 0.12, inner], [-inner / 2, 0, 0.12, inner]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), gold);
      b.position.set(x, SURFACE + 0.04, z); this.scene.add(b);
    }
    return top;
  }

  buildDice() {
    const skin = SKINS.find((s: any) => s.id === this.diceSkin)?.data || { face: '#ffffff', pip: '#c81e1e' };
    for (const d of this.dice) this.scene.remove(d);
    this.dice = [0, 1].map((k) => {
      const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8, 2, 2, 2);
      // bulatkan sudut sedikit
      const p = geo.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize().multiplyScalar(0.5); v.lerp(n.multiplyScalar(1.06), 0.12); p.setXYZ(i, v.x, v.y, v.z); }
      geo.computeVertexNormals();
      const d = new THREE.Mesh(geo, diceFaces(skin.face, skin.pip));
      d.castShadow = true;
      d.position.set(k ? 0.75 : -0.75, SURFACE + 0.4 + 0.42, 5.6);
      d.quaternion.copy(this.faceQuat(k ? 6 : 5, k * 0.6));
      this.scene.add(d);
      return d;
    });
  }

  setDiceSkin(id: string) { if (id && id !== this.diceSkin) { this.diceSkin = id; this.buildDice(); } }

  faceQuat(v: number, yaw = 0) {
    const q = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0); const Z = new THREE.Vector3(0, 0, 1);
    if (v === 6) q.setFromAxisAngle(X, Math.PI);
    if (v === 2) q.setFromAxisAngle(X, -Math.PI / 2);
    if (v === 5) q.setFromAxisAngle(X, Math.PI / 2);
    if (v === 3) q.setFromAxisAngle(Z, Math.PI / 2);
    if (v === 4) q.setFromAxisAngle(Z, -Math.PI / 2);
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
  }

  // -------------------------------------------------------------- loop & tween
  resize = () => {
    const w = this.container.clientWidth || window.innerWidth; const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // layar potret (HP) → FOV lebih lebar & kamera lebih tinggi agar seluruh papan muat
    const wasPortrait = this.portrait;
    this.portrait = w / h < 0.8;
    this.camera.fov = this.portrait ? 68 : w / h < 1.2 ? 50 : 42;
    this.camera.updateProjectionMatrix();
    if (wasPortrait !== this.portrait) this.resetCamera();
  };
  portrait: boolean | null = null;

  loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();
    for (const tw of [...this.tweens]) {
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done(); }
    }
    for (const e of [...this.effects]) {
      e.life += dt;
      e.update(e.obj, e.life / e.max, dt);
      if (e.life >= e.max) { this.scene.remove(e.obj); this.effects.splice(this.effects.indexOf(e), 1); disposeObj(e.obj); }
    }
    animateDiorama(this.diorama, t);
    // pion idle & penanda giliran
    this.pawns.forEach((p, id) => {
      const body = p.obj.userData.body as THREE.Object3D;
      if (body && !p.bankrupt) body.position.y = (p.obj.userData.baseY ?? 0.12) + Math.abs(Math.sin(t * 2.2 + id.length)) * 0.03;
      (p.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = id === this.activePawn ? 0.6 + Math.sin(t * 6) * 0.35 : 0.2;
    });
    const act = this.activePawn && this.pawns.get(this.activePawn);
    if (act && !act.bankrupt) {
      this.marker.visible = true;
      this.marker.position.set(act.obj.position.x, act.obj.position.y + 2.35 + Math.sin(t * 4) * 0.12, act.obj.position.z);
      this.marker.rotation.y = t * 2;
    } else this.marker.visible = false;
    (this.highlight.material as THREE.MeshBasicMaterial).opacity *= 0.97;
    // kamera mengikuti
    if (this.cameraMode === 'follow' && now > this.userInteractUntil) {
      this.controls.target.lerp(this.camTarget, 0.05);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  tween(ms: number, fn: (t: number) => void) {
    return new Promise<void>((done) => this.tweens.push({ t0: performance.now(), dur: Math.max(16, ms / this.speed), fn, done }));
  }

  wait(ms: number) { return this.tween(ms, () => {}); }

  enqueue(task: () => Promise<void>) {
    this.queue.push(task);
    if (!this.running) this.runQueue();
  }

  async runQueue() {
    this.running = true;
    this.busyCb(true);
    while (this.queue.length) {
      this.speed = this.queue.length > 14 ? 4 : this.queue.length > 6 ? 2 : 1;
      if (this.settingsReduced) this.speed = Math.max(this.speed, 2);
      const task = this.queue.shift()!;
      try { await task(); } catch (e) { console.warn('[anim]', e); }
    }
    this.running = false;
    this.speed = 1;
    if (this.game) this.reconcile(this.game, true);
    this.busyCb(false);
  }
  settingsReduced = false;

  // -------------------------------------------------------------- state
  /** Terima state baru dari server. */
  setGame(game: any, room: any) {
    if (!game) return;
    const first = this.lastSeq < 0;
    this.game = game;
    const mySeat = room?.seats?.find((s: any) => s.userId === this.me);
    if (mySeat?.dice) this.setDiceSkin(mySeat.dice);
    this.ensurePawns(game, room);
    if (first) {
      this.lastSeq = game.seq;
      this.reconcile(game, true);
      this.activePawn = game.players[game.turn]?.id;
      this.focusPlayer(this.activePawn);
      return;
    }
    const evs = game.log.filter((e: any) => e.seq > this.lastSeq);
    this.lastSeq = game.seq;
    // Jika tertinggal terlalu jauh (tab di latar belakang, perangkat lambat, atau permainan bergerak lebih cepat
    // dari animasi), buang antrean & langsung samakan scene dengan state server.
    if (evs.length > 40 || document.hidden || this.queue.length > 24) {
      this.queue = [];
      this.reconcile(game, true);
      this.activePawn = game.players[game.turn]?.id;
      if (!this.running) this.busyCb(false);
      return;
    }
    for (const e of evs) this.enqueueEvent(e, game);
    this.enqueue(async () => { this.reconcile(game, false); });
  }

  ensurePawns(game: any, room: any) {
    game.players.forEach((p: any, n: number) => {
      if (this.pawns.has(p.id)) return;
      const seat = room?.seats?.find((s: any) => s.userId === p.id);
      const skin: any = (SKINS as any[]).find((s: any) => s.id === (seat?.pawn || p.pawn))?.data || { base: '#ffffff', ring: null };
      const obj = buildCharacter(seat?.character || p.avatar || 'bima', skin, p.color);
      obj.userData.baseY = 0.12;
      obj.scale.setScalar(1.4);
      const ring = obj.children.find((c: any) => c.geometry?.type === 'TorusGeometry') as THREE.Mesh;
      // material ring unik per pemain agar bisa berkedip sendiri
      ring.material = (ring.material as THREE.Material).clone();
      this.scene.add(obj);
      this.pawns.set(p.id, { obj, tile: p.pos, color: p.color, ring, bankrupt: false });
      void n;
    });
  }

  slotOffset(tile: number, id: string) {
    const here = this.game.players.filter((p: any) => !p.bankrupt && this.pawns.get(p.id)?.tile === tile).map((p: any) => p.id);
    const k = Math.max(0, here.indexOf(id));
    const n = Math.max(1, here.length);
    const f = tileFrame(tile);
    if (tile === 10) {
      const p = this.game.players.find((x: any) => x.id === id);
      if (p?.inJail) return { lx: -0.5 + (k % 2) * 0.55, ly: -0.5 - Math.floor(k / 2) * 0.5 };
      return { lx: 1.15, ly: -0.9 + k * 0.6 };
    }
    if (f.corner) return { lx: (k % 2 ? 0.45 : -0.45), ly: (k < 2 ? 0.2 : -0.6) };
    if (n === 1) return { lx: 0, ly: 0.35 };
    return { lx: k % 2 ? 0.45 : -0.45, ly: k < 2 ? 0.8 : -0.25 };
  }

  pawnWorld(tile: number, id: string) {
    const o = this.slotOffset(tile, id);
    const w = tileLocal(tile, o.lx, o.ly);
    return new THREE.Vector3(w.x, SURFACE, w.z);
  }

  /** Samakan scene dengan state (posisi pion, pemilik, bangunan, gadai). */
  reconcile(game: any, snapPawns: boolean) {
    for (const p of game.players) {
      const pw = this.pawns.get(p.id); if (!pw) continue;
      if (snapPawns || !this.running) pw.tile = p.pos;
      pw.bankrupt = p.bankrupt;
      pw.obj.visible = !p.bankrupt;
    }
    for (const p of game.players) {
      const pw = this.pawns.get(p.id); if (!pw || p.bankrupt) continue;
      if (snapPawns || !this.running) {
        const pos = this.pawnWorld(pw.tile, p.id);
        pw.obj.position.copy(pos);
        pw.obj.rotation.y = this.faceInward(pw.tile);
      }
    }
    for (const [k, s] of Object.entries<any>(game.props)) {
      const i = Number(k);
      this.setOwner(i, s.owner ? game.players.find((p: any) => p.id === s.owner)?.color : null);
      this.setBuildings(i, s.houses || 0, false);
      this.setMortgage(i, !!s.mortgaged);
    }
    this.activePawn = game.status === 'playing' ? game.players[game.turn]?.id : null;
  }

  faceInward(tile: number) {
    const f = tileFrame(tile);
    return Math.atan2(-f.o[0], -f.o[1]);
  }

  setOwner(i: number, color: string | null) {
    const cur = this.owners.get(i);
    if (cur && cur.userData.color === color) return;
    if (cur) { this.scene.remove(cur); this.owners.delete(i); }
    if (!color) return;
    const f = tileFrame(i);
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
    plate.rotation.x = -Math.PI / 2;
    g.add(plate);
    const w = tileLocal(i, 0, 1.33);
    g.position.set(w.x, SURFACE + 0.015, w.z);
    g.rotation.y = -f.rot;
    // bendera kecil
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), mat('#eeeeee'));
    pole.position.set(0.8, 0.3, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.02), mat(color, { emissive: color }));
    flag.position.set(0.95, 0.5, 0); g.add(flag);
    g.userData.color = color;
    this.scene.add(g);
    this.owners.set(i, g);
  }

  setBuildings(i: number, n: number, animate: boolean) {
    const cur = this.buildings.get(i);
    if (cur && cur.userData.n === n) return;
    if (cur) { this.scene.remove(cur); disposeObj(cur); this.buildings.delete(i); }
    if (!n) return;
    const g = new THREE.Group();
    g.userData.n = n;
    const f = tileFrame(i);
    if (n === 5) {
      const h = new THREE.Group();
      h.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.5), mat('#c81e3a', { rough: 0.5 })), { castShadow: true }));
      h.children[0].position.y = 0.28;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.75, 0.32, 4), mat('#f2c14e', { metal: 0.5, rough: 0.3 }));
      roof.rotation.y = Math.PI / 4; roof.scale.z = 0.5; roof.position.y = 0.72; roof.castShadow = true; h.add(roof);
      for (let k = -1; k <= 1; k++) { const wdw = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), mat('#ffe9a8', { emissive: '#ffcc55' })); wdw.position.set(k * 0.35, 0.3, 0.26); h.add(wdw); }
      const w = tileLocal(i, 0, -1.15);
      h.position.set(w.x, SURFACE, w.z);
      h.rotation.y = -f.rot;
      g.add(h);
    } else {
      for (let k = 0; k < n; k++) {
        const h = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), mat('#2f9e44', { rough: 0.5 }));
        body.position.y = 0.14; body.castShadow = true; h.add(body);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 4), mat('#b5522f', { rough: 0.6 }));
        roof.rotation.y = Math.PI / 4; roof.position.y = 0.4; roof.castShadow = true; h.add(roof);
        const w = tileLocal(i, -0.66 + k * 0.44, -1.15);
        h.position.set(w.x, SURFACE, w.z);
        h.rotation.y = -f.rot;
        g.add(h);
      }
    }
    this.scene.add(g);
    this.buildings.set(i, g);
    if (animate) {
      g.scale.setScalar(0.01);
      this.tween(380, (t) => { const s = t < 0.7 ? (t / 0.7) * 1.2 : 1.2 - ((t - 0.7) / 0.3) * 0.2; g.children.forEach((c) => c.scale.setScalar(Math.max(0.01, s))); g.scale.setScalar(1); });
    }
  }

  setMortgage(i: number, on: boolean) {
    const cur = this.mortgaged.get(i);
    if (!!cur === on) return;
    if (cur) { this.scene.remove(cur); this.mortgaged.delete(i); return; }
    const f = tileFrame(i);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial({ map: this.mortTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -f.rot;
    m.position.set(f.x, SURFACE + 0.02, f.z);
    this.scene.add(m);
    this.mortgaged.set(i, m);
  }

  // -------------------------------------------------------------- animasi event
  enqueueEvent(e: any, game: any) {
    const pw = e.player ? this.pawns.get(e.player) : null;
    switch (e.type) {
      case 'roll':
        this.enqueue(() => this.rollDice(e.dice));
        break;
      case 'move':
        this.enqueue(() => (e.jump || Math.abs(e.steps) > 12 || e.steps < 0 ? this.jumpPawn(e.player, e.to) : this.walkPawn(e.player, e.from, e.steps)));
        break;
      case 'jail':
        if (e.to === 10) this.enqueue(async () => { sfx('jail'); await this.jumpPawn(e.player, 10); });
        break;
      case 'buy':
        this.enqueue(async () => {
          sfx('buy');
          const color = game.players.find((p: any) => p.id === e.player)?.color;
          this.setOwner(e.tile, color);
          this.sparkle(e.tile, '#ffd34d');
          this.floatText(this.tileCenter(e.tile, 1), 'TERBELI!', '#ffe066');
          await this.wait(500);
        });
        break;
      case 'rent':
        this.enqueue(async () => { sfx('rent'); await this.coinFlow(e.player, e.to, e.amount); });
        break;
      case 'salary':
        this.enqueue(async () => { sfx('coin'); if (pw) this.floatText(pw.obj.position.clone().add(new THREE.Vector3(0, 2, 0)), `+${rpShort(e.amount || 2_000_000)}`, '#7dff9b'); await this.wait(250); });
        break;
      case 'tax':
        this.enqueue(async () => { sfx('coin'); if (pw) this.floatText(pw.obj.position.clone().add(new THREE.Vector3(0, 2, 0)), `-${rpShort(e.amount)}`, '#ff8080'); await this.wait(300); });
        break;
      case 'build': case 'sell':
        this.enqueue(async () => { sfx('build'); this.setBuildings(e.tile, e.houses, e.type === 'build'); if (e.type === 'build') this.sparkle(e.tile, '#7dff9b'); await this.wait(350); });
        break;
      case 'mortgage':
        this.enqueue(async () => { sfx('coin'); await this.wait(150); });
        break;
      case 'card':
        this.enqueue(async () => { sfx('card'); window.dispatchEvent(new CustomEvent('mi:card', { detail: e })); await this.wait(900); });
        break;
      case 'bankrupt':
        this.enqueue(async () => {
          if (!pw) return;
          const o = pw.obj;
          await this.tween(900, (t) => { o.scale.setScalar(1.4 * (1 - t * 0.95)); o.rotation.y += 0.25; });
          pw.bankrupt = true; o.visible = false; o.scale.setScalar(1.4);
        });
        break;
      case 'turn':
        this.enqueue(async () => {
          this.activePawn = e.player;
          this.focusPlayer(e.player);
          if (e.player === this.me) sfx('turn');
          await this.wait(150);
        });
        break;
      case 'auction':
        this.enqueue(async () => { if (e.tile !== undefined) { sfx('auction'); this.flashTile(e.tile); } await this.wait(100); });
        break;
      case 'offer':
        this.enqueue(async () => { this.flashTile(e.tile); await this.wait(80); });
        break;
      case 'win':
        this.enqueue(async () => { this.confetti(); this.camTarget.set(0, 0, 1.5); await this.wait(300); });
        break;
      default: break;
    }
  }

  tileCenter(i: number, lift = 0.5) {
    const f = tileFrame(i);
    return new THREE.Vector3(f.x, SURFACE + lift, f.z);
  }

  focusPlayer(id: string | null) {
    const pw = id && this.pawns.get(id);
    if (!pw) return;
    const p = pw.obj.position;
    const k = this.portrait ? 0.18 : 0.45;
    this.camTarget.set(p.x * k, 0, p.z * k + (this.portrait ? 2 : 1.0));
  }

  focusTile(i: number) {
    const f = tileFrame(i);
    this.flashTile(i);
    const k = this.portrait ? 0.18 : 0.45;
    this.camTarget.set(f.x * k, 0, f.z * k + (this.portrait ? 2 : 1.0));
    this.userInteractUntil = 0;
  }

  flashTile(i: number) {
    const f = tileFrame(i);
    this.highlight.scale.set(f.corner ? 1.5 : 1, 1, 1);
    this.highlight.position.set(f.x, SURFACE + 0.012, f.z);
    this.highlight.rotation.z = -f.rot;
    (this.highlight.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  async rollDice(values: number[]) {
    sfx('dice');
    const starts = [new THREE.Vector3(-3.5, 4.5, 9), new THREE.Vector3(-2.8, 5, 9.6)];
    const ends = [new THREE.Vector3(-0.75, SURFACE + 0.4 + 0.42, 5.4 + Math.random() * 0.4), new THREE.Vector3(0.75, SURFACE + 0.4 + 0.42, 5.7 + Math.random() * 0.4)];
    const spins = this.dice.map(() => new THREE.Vector3(Math.random() * 14 + 8, Math.random() * 10, Math.random() * 14 + 8));
    const finals = values.map((v, k) => this.faceQuat(v, (Math.random() - 0.5) * 0.8 + k * 0.3));
    const qStart = this.dice.map((d) => d.quaternion.clone());
    await this.tween(1150, (t) => {
      this.dice.forEach((d, k) => {
        const e = ease(t);
        d.position.lerpVectors(starts[k], ends[k], e);
        const bounce = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 1.6;
        d.position.y = THREE.MathUtils.lerp(starts[k].y, ends[k].y, Math.min(1, t * 1.6)) + bounce;
        if (t < 0.72) {
          const s = spins[k];
          d.quaternion.copy(qStart[k]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.x * t, s.y * t, s.z * t)));
        } else {
          d.quaternion.slerp(finals[k], (t - 0.72) / 0.28);
        }
      });
    });
    this.dice.forEach((d, k) => d.quaternion.copy(finals[k]));
    await this.wait(250);
  }

  async walkPawn(id: string, from: number, steps: number) {
    const pw = this.pawns.get(id); if (!pw) return;
    this.activePawn = id;
    for (let s = 1; s <= steps; s++) {
      const prev = pw.obj.position.clone();
      const tile = (from + s) % 40;
      pw.tile = tile;
      const next = this.pawnWorld(tile, id);
      pw.obj.rotation.y = Math.atan2(next.x - prev.x, next.z - prev.z);
      sfx('move');
      await this.tween(190, (t) => {
        pw.obj.position.lerpVectors(prev, next, t);
        pw.obj.position.y = SURFACE + Math.sin(t * Math.PI) * 0.45;
      });
      if (s % 3 === 0 || s === steps) this.focusPlayer(id);
    }
    pw.obj.rotation.y = this.faceInward(pw.tile);
  }

  async jumpPawn(id: string, to: number) {
    const pw = this.pawns.get(id); if (!pw) return;
    const prev = pw.obj.position.clone();
    pw.tile = to;
    const next = this.pawnWorld(to, id);
    const h = Math.min(6, 2 + prev.distanceTo(next) * 0.25);
    await this.tween(700, (t) => {
      pw.obj.position.lerpVectors(prev, next, ease(t));
      pw.obj.position.y = SURFACE + Math.sin(t * Math.PI) * h;
      pw.obj.rotation.y += 0.25;
    });
    pw.obj.rotation.y = this.faceInward(to);
    this.focusPlayer(id);
  }

  async coinFlow(fromId: string, toId: string, amount: number) {
    const a = this.pawns.get(fromId); const b = this.pawns.get(toId);
    if (!a || !b) return;
    const from = a.obj.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const to = b.obj.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const coinMat = mat('#f6c443', { metal: 0.85, rough: 0.25, emissive: '#7a5200' });
    const n = 7;
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), coinMat);
      c.rotation.x = Math.PI / 2;
      this.scene.add(c);
      const delay = k * 0.07;
      this.effects.push({ obj: c, life: 0, max: 1.0 + delay, update: (o, k2) => {
        const tt = Math.max(0, Math.min(1, (k2 * (1.0 + delay) - delay) / 1.0));
        o.position.lerpVectors(from, to, ease(tt));
        o.position.y += Math.sin(tt * Math.PI) * 2.2;
        o.rotation.z += 0.3;
        o.visible = tt > 0 && tt < 1;
      } });
    }
    this.floatText(from.clone().add(new THREE.Vector3(0, 0.6, 0)), `-${rpShort(amount)}`, '#ff8080');
    await this.wait(700);
    this.floatText(to.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${rpShort(amount)}`, '#7dff9b');
    await this.wait(350);
  }

  sparkle(tile: number, color: string) {
    const n = this.quality === 'low' ? 24 : 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3); const vel: number[] = [];
    const c = this.tileCenter(tile, 0.2);
    for (let k = 0; k < n; k++) { pos[k * 3] = c.x + (Math.random() - 0.5) * 1.6; pos[k * 3 + 1] = c.y; pos[k * 3 + 2] = c.z + (Math.random() - 0.5) * 2.4; vel.push(Math.random() * 2.5 + 1); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.effects.push({ obj: pts, life: 0, max: 1.3, update: (o: any, k, dt) => {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < n; i++) p.setY(i, p.getY(i) + vel[i] * dt);
      p.needsUpdate = true;
      o.material.opacity = 1 - k;
    } });
  }

  floatText(at: THREE.Vector3, text: string, color: string) {
    const sp = textSprite(text, color);
    sp.position.copy(at);
    this.scene.add(sp);
    this.effects.push({ obj: sp, life: 0, max: 1.6, update: (o: any, k, dt) => { o.position.y += dt * 0.9; o.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; } });
  }

  confetti() {
    const n = this.quality === 'low' ? 150 : 500;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3); const vel: number[] = [];
    const palette = ['#e23b3b', '#ffffff', '#f5c842', '#1f6feb', '#22a356'].map((c) => new THREE.Color(c));
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (Math.random() - 0.5) * 22; pos[k * 3 + 1] = 10 + Math.random() * 8; pos[k * 3 + 2] = (Math.random() - 0.5) * 22;
      const c = palette[k % palette.length]; col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      vel.push(1.5 + Math.random() * 2.5);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false }));
    this.scene.add(pts);
    this.effects.push({ obj: pts, life: 0, max: 7, update: (o: any, k, dt) => {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < n; i++) { p.setY(i, Math.max(0.4, p.getY(i) - vel[i] * dt)); p.setX(i, p.getX(i) + Math.sin(k * 20 + i) * dt * 0.6); }
      p.needsUpdate = true;
      o.material.opacity = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
    } });
  }

  /** Posisi layar (piksel) di atas kepala pion — untuk balon emote HTML. */
  screenPos(id: string) {
    const pw = this.pawns.get(id); if (!pw || pw.bankrupt) return null;
    const v = pw.obj.position.clone().add(new THREE.Vector3(0, 2.7, 0)).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  onPointer = (ev: PointerEvent) => {
    if (performance.now() - (this as any).lastDown > 300) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.boardTop)[0];
    if (!hit) return;
    const { x, z } = hit.point;
    const i = TILES.findIndex((t: any) => { const f = tileFrame(t.i); const hw = f.corner ? 1.5 : (f.a[0] ? 1 : 1.5); const hd = f.corner ? 1.5 : (f.a[0] ? 1.5 : 1); return Math.abs(x - f.x) <= hw && Math.abs(z - f.z) <= hd; });
    if (i >= 0) { this.flashTile(i); this.tileClickCb(i); }
  };

  attachClick() {
    this.renderer.domElement.addEventListener('pointerdown', () => { (this as any).lastDown = performance.now(); });
  }

  resetCamera() {
    if (this.portrait) this.camera.position.set(0, 40, 17); else this.camera.position.set(0, 24, 25);
    const tz = this.portrait ? 2 : 1.5;
    this.camTarget.set(0, 0, tz);
    this.controls.target.set(0, 0, tz);
    this.userInteractUntil = 0;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.scene.traverse((o) => disposeObj(o, false));
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function disposeObj(o: THREE.Object3D, recurse = true) {
  const f = (x: any) => {
    if (x.geometry) x.geometry.dispose();
    if (x.material) {
      const ms = Array.isArray(x.material) ? x.material : [x.material];
      for (const m of ms) { if (m.map && m.map.isCanvasTexture && x.isSprite) m.map.dispose(); if (x.isSprite || x.isPoints) m.dispose(); }
    }
  };
  if (recurse) o.traverse(f); else f(o);
}

export const GROUP_COLORS = GROUPS;
