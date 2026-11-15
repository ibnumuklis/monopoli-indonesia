import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import { portrait } from '../three/characters';
import { sfx } from '../lib/audio';
import { num } from '../lib/format';

export function Coin({ n, size }: { n?: number; size?: number }) {
  return <span className="currency"><span className="coin-ic" style={size ? { width: size, height: size } : undefined} />{n !== undefined && num(n)}</span>;
}
export function Diamond({ n }: { n?: number }) { return <span className="currency"><span className="dia-ic" />{n !== undefined && num(n)}</span>; }
export function Ticket({ n }: { n?: number }) { return <span className="currency"><span className="tic-ic" />{n !== undefined && num(n)}</span>; }

export function Avatar({ id, size = '', ring }: { id: string; size?: '' | 'lg' | 'xl'; ring?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { const t = setTimeout(() => setSrc(portrait(id || 'bima')), 0); return () => clearTimeout(t); }, [id]);
  return <div className={`avatar ${size}`} style={ring ? { borderColor: ring } : undefined}>{src && <img src={src} alt="" draggable={false} />}</div>;
}

export function Btn({ children, onClick, kind = '', size = '', disabled, block, pulse, title, type }: any) {
  return (
    <button type={type || 'button'} title={title} className={`btn ${kind} ${size} ${block ? 'block' : ''}`} disabled={disabled}
      onClick={(e) => { sfx('click'); onClick?.(e); }}>
      {children}{pulse && <span className="pulse" />}
    </button>
  );
}

export function Modal({ title, onClose, children, wide, light }: any) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal panel ${light ? 'light' : ''} ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {title && <div className="modal-head"><span className="ribbon">{title}</span>{onClose && <button className="modal-close" aria-label="Tutup" onClick={onClose}>✕</button>}</div>}
        <div className="card-pad">{children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return <div className="toast-wrap" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.text}</div>)}</div>;
}

export function Loading({ text = 'Memuat...' }: { text?: string }) {
  return <div className="center col" style={{ padding: 40 }}><div className="spinner" /><div className="muted bold">{text}</div></div>;
}

/** Hook data async sederhana dengan reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    return fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return <div className="empty"><div style={{ fontSize: 40 }}>⚠️</div><div>{error}</div>{retry && <div className="mt"><Btn kind="ghost" size="sm" onClick={retry}>Coba lagi</Btn></div>}</div>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => { sfx('click'); onChange(!on); }} />;
}

export function Seg({ value, options, onChange }: { value: any; options: [any, string][]; onChange: (v: any) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => { sfx('click'); onChange(v); }}>{l}</button>)}</div>;
}

export function PageHead({ icon, title, children }: any) {
  return <div className="page-head"><h1>{icon} {title}</h1><div className="grow" />{children}</div>;
}

export function RewardLine({ r }: { r: any }) {
  if (!r) return null;
  return (
    <span className="row gap-s wrap" style={{ display: 'inline-flex' }}>
      {r.reward_coins > 0 && <Coin n={r.reward_coins} />}
      {r.reward_diamonds > 0 && <Diamond n={r.reward_diamonds} />}
      {r.reward_tickets > 0 && <Ticket n={r.reward_tickets} />}
      {r.reward_xp > 0 && <span className="chip gold">+{r.reward_xp} XP</span>}
      {r.reward_item && <span className="chip">🎁 {r.reward_item}</span>}
    </span>
  );
}
