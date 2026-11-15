// Store global sederhana (tanpa dependensi) berbasis useSyncExternalStore.
import { useSyncExternalStore } from 'react';

export type Toast = { id: number; text: string; kind?: 'info' | 'error' | 'success' | 'reward' };

export type AppState = {
  token: string | null;
  me: any | null;
  route: string;
  routeParams: any;
  room: any | null;
  game: any | null;
  serverOffset: number;
  connected: boolean;
  connecting: boolean;
  chat: any[];
  toasts: Toast[];
  queue: { queued: boolean; mode?: string; since?: number } | null;
  invite: any | null;
  settings: { music: number; sfx: number; muted: boolean; graphics: 'low' | 'medium' | 'high'; camera: 'follow' | 'free'; reducedMotion: boolean };
  board: any | null;
};

const savedSettings = (() => {
  try { return JSON.parse(localStorage.getItem('mi_settings') || 'null'); } catch { return null; }
})();
const lowEnd = typeof navigator !== 'undefined' && ((navigator as any).deviceMemory <= 4 || /Android|iPhone/i.test(navigator.userAgent));

let state: AppState = {
  token: (() => { try { return localStorage.getItem('mi_token'); } catch { return null; } })(),
  me: null,
  route: 'splash',
  routeParams: {},
  room: null,
  game: null,
  serverOffset: 0,
  connected: false,
  connecting: false,
  chat: [],
  toasts: [],
  queue: null,
  invite: null,
  settings: { music: 0.5, sfx: 0.8, muted: false, graphics: lowEnd ? 'medium' : 'high', camera: 'follow', reducedMotion: false, ...(savedSettings || {}) },
  board: null,
};

const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if ('settings' in p) { try { localStorage.setItem('mi_settings', JSON.stringify(state.settings)); } catch { /* mode privat */ } }
  if ('token' in p) { try { p.token ? localStorage.setItem('mi_token', p.token) : localStorage.removeItem('mi_token'); } catch { /* */ } }
  listeners.forEach((l) => l());
}
export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3200) {
  const id = ++toastId;
  setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function navigate(route: string, params: any = {}) {
  setState({ route, routeParams: params });
  try { history.replaceState(null, '', route === 'lobby' ? '/' : `/#${route}`); } catch { /* */ }
}
