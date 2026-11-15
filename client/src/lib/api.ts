// Klien REST API.
import { getState, setState, toast } from './store';

// Bila frontend dideploy terpisah (mis. Vercel), arahkan ke server game lewat VITE_SERVER_URL.
export const SERVER_URL: string = ((import.meta as any).env?.VITE_SERVER_URL || '').replace(/\/$/, '');

export class ApiError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

export async function api<T = any>(method: string, path: string, body?: any): Promise<T> {
  const { token } = getState();
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa koneksi internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setState({ token: null, me: null, route: 'login' });
  }
  if (!res.ok) throw new ApiError(res.status, data.error || `Gagal (${res.status})`);
  return data as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b: any = {}) => api<T>('POST', p, b);

/** Jalankan aksi API dengan toast error otomatis. */
export async function act<T>(fn: () => Promise<T>, success?: string): Promise<T | null> {
  try {
    const r = await fn();
    if (success) toast(success, 'success');
    return r;
  } catch (e: any) {
    toast(e.message || 'Gagal.', 'error');
    return null;
  }
}

export async function refreshMe() {
  try {
    const me = await get('/me');
    setState({ me });
    return me;
  } catch {
    return null;
  }
}
