export const rp = (n: number) => (n < 0 ? '-Rp' : 'Rp') + Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
export const rpShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `Rp${(n / 1e9).toFixed(1).replace('.', ',')}M`;
  if (a >= 1e6) return `Rp${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace('.', ',').replace(/,?0+$/, '')}jt`;
  if (a >= 1e3) return `Rp${Math.round(n / 1e3)}rb`;
  return rp(n);
};
export const num = (n: number) => Math.round(n || 0).toLocaleString('id-ID');
export const dur = (sec: number) => { const m = Math.floor(sec / 60); const s = Math.round(sec % 60); return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m ${String(s).padStart(2, '0')}d`; };
export const ago = (d: string | number) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};
export const timeLeft = (d: string | number) => {
  const s = Math.max(0, (new Date(d).getTime() - Date.now()) / 1000);
  if (s < 3600) return `${Math.ceil(s / 60)} menit lagi`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lagi`;
  return `${Math.floor(s / 86400)} hari lagi`;
};
export const modeName = (m: string) => ({ classic: 'Klasik', team: 'Team Battle', practice: 'Latihan', tournament: 'Turnamen', adventure: 'Adventure' } as any)[m] || m;
