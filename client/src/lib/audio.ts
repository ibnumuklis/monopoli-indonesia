// Audio original 100% disintesis dengan Web Audio API (tanpa file berlisensi pihak ketiga):
// efek suara (dadu, tombol, beli, sewa, kartu, menang, notifikasi) + musik latar bernuansa gamelan (tangga nada slendro)
// + suara ambien (burung & angin).
import { getState, subscribe } from './store';

let ctx: AudioContext | null = null;
let master: GainNode; let sfxBus: GainNode; let musicBus: GainNode; let ambBus: GainNode;
let musicOn = false; let musicTimer: any = null; let ambTimer: any = null; let noiseBuf: AudioBuffer;

function ensure() {
  if (ctx) return ctx;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master);
  ambBus = ctx.createGain(); ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  subscribe(applyVolumes);
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const s = getState().settings;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
  sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
  musicBus.gain.setTargetAtTime(s.music * 0.55, t, 0.2);
  ambBus.gain.setTargetAtTime(s.music * 0.35, t, 0.2);
}

/** Dipanggil pada interaksi pertama pengguna (kebijakan autoplay browser). */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

function tone(freq: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.3, attack = 0.005, at = 0, bus = null as GainNode | null, slideTo = 0 } = {}) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur: number, { gain = 0.2, at = 0, freq = 2000, q = 1, type = 'bandpass' as BiquadFilterType, sweepTo = 0, bus = null as GainNode | null } = {}) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus || sfxBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

/** Bunyi logam ala bonang/saron: fundamental + parsial inharmonis. */
function metal(freq: number, at = 0, gain = 0.18, dur = 1.2, bus: GainNode | null = null) {
  tone(freq, dur, { type: 'sine', gain, at, bus });
  tone(freq * 2.76, dur * 0.35, { type: 'sine', gain: gain * 0.35, at, bus });
  tone(freq * 5.4, dur * 0.12, { type: 'sine', gain: gain * 0.15, at, bus });
}

export type Sfx = 'click' | 'dice' | 'buy' | 'rent' | 'card' | 'victory' | 'lose' | 'notify' | 'error' | 'turn' | 'build' | 'move' | 'chat' | 'coin' | 'jail' | 'auction';

export function sfx(name: Sfx) {
  const c = ensure(); if (!c || getState().settings.muted) return;
  switch (name) {
    case 'click': tone(880, 0.06, { type: 'triangle', gain: 0.12 }); break;
    case 'move': tone(520 + Math.random() * 60, 0.07, { type: 'triangle', gain: 0.1 }); break;
    case 'dice':
      for (let i = 0; i < 9; i++) noise(0.05, { gain: 0.35 - i * 0.03, at: i * 0.07 + Math.random() * 0.03, freq: 1800 + Math.random() * 1500, q: 4 });
      break;
    case 'buy':
      [523, 659, 784, 1047].forEach((f, i) => metal(f, i * 0.07, 0.14, 0.8));
      noise(0.25, { gain: 0.08, at: 0.28, freq: 6000, q: 0.7, type: 'highpass' });
      break;
    case 'rent': case 'coin':
      for (let i = 0; i < (name === 'rent' ? 5 : 2); i++) { tone(1800 + i * 90, 0.12, { type: 'square', gain: 0.04, at: i * 0.06 }); tone(2600 + i * 120, 0.18, { gain: 0.06, at: i * 0.06 + 0.01 }); }
      break;
    case 'card':
      noise(0.35, { gain: 0.18, freq: 400, sweepTo: 5000, q: 0.8 });
      metal(1046, 0.25, 0.1, 0.9);
      break;
    case 'build':
      for (let i = 0; i < 3; i++) noise(0.06, { gain: 0.3, at: i * 0.12, freq: 600, q: 2, type: 'lowpass' });
      metal(784, 0.38, 0.12, 0.6);
      break;
    case 'victory': {
      const mel = [392, 523, 659, 784, 659, 784, 1047];
      mel.forEach((f, i) => { tone(f, 0.35, { type: 'triangle', gain: 0.16, at: i * 0.14 }); metal(f / 2, i * 0.14, 0.06, 0.5); });
      tone(1047, 1.4, { type: 'triangle', gain: 0.14, at: mel.length * 0.14 });
      metal(130, 0.9, 0.25, 3);
      break;
    }
    case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.12, at: i * 0.22 })); break;
    case 'notify': metal(1175, 0, 0.12, 0.6); metal(1568, 0.12, 0.12, 0.8); break;
    case 'turn': metal(880, 0, 0.12, 0.7); metal(1320, 0.1, 0.09, 0.9); break;
    case 'error': tone(220, 0.18, { type: 'square', gain: 0.06 }); tone(196, 0.22, { type: 'square', gain: 0.06, at: 0.1 }); break;
    case 'chat': tone(1320, 0.08, { gain: 0.08 }); break;
    case 'jail': for (let i = 0; i < 3; i++) metal(150, i * 0.18, 0.2, 0.4); break;
    case 'auction': metal(660, 0, 0.15, 0.4); metal(660, 0.2, 0.15, 0.6); break;
  }
}

// ------------------------------------------------------------- musik latar (gamelan slendro generatif)
const SLENDRO = [1, 1.149, 1.320, 1.516, 1.741, 2, 2.298, 2.64];
const BASE = 293.7;

export function startMusic() {
  const c = ensure(); if (!c || musicOn) return;
  musicOn = true;
  let step = 0;
  const beat = 60 / 88 / 2;
  const pattern = [0, 2, 1, 3, 2, 4, 3, 1, 5, 4, 2, 3, 1, 2, 0, -1];
  const tick = () => {
    if (!musicOn) return;
    const s = step++;
    const p = pattern[s % pattern.length];
    const phrase = Math.floor(s / 16) % 4;
    if (p >= 0) metal(BASE * SLENDRO[(p + phrase) % SLENDRO.length], 0, 0.07, 1.4, musicBus);
    if (s % 2 === 0) metal((BASE / 2) * SLENDRO[[0, 3, 2, 4][phrase] % SLENDRO.length], 0.01, 0.06, 1.8, musicBus); // saron
    if (s % 16 === 0) { tone(73, 4.5, { gain: 0.22, bus: musicBus }); tone(73 * 1.012, 4.5, { gain: 0.14, bus: musicBus }); } // gong
    if (s % 8 === 4) tone(110, 1.2, { gain: 0.08, bus: musicBus }); // kenong
    if (s % 4 === 2) noise(0.12, { gain: 0.05, freq: 180, q: 1.5, type: 'lowpass', bus: musicBus }); // kendang
    musicTimer = setTimeout(tick, beat * 1000);
  };
  tick();
  // suara ambien: kicau burung & angin lembut
  const amb = () => {
    if (!musicOn) return;
    const n = 2 + Math.floor(Math.random() * 4);
    const f0 = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) tone(f0, 0.09, { gain: 0.035, at: i * 0.11, slideTo: f0 * (1.3 + Math.random() * 0.4), bus: ambBus });
    noise(3, { gain: 0.015, freq: 500, q: 0.3, type: 'lowpass', bus: ambBus });
    ambTimer = setTimeout(amb, 4000 + Math.random() * 7000);
  };
  ambTimer = setTimeout(amb, 2500);
}

export function stopMusic() {
  musicOn = false;
  clearTimeout(musicTimer); clearTimeout(ambTimer);
}
