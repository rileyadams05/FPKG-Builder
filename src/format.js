export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating remaining time…';
  const n = Math.ceil(seconds);
  if (n < 60) return `~${n}s`;
  if (n < 3600) return `~${Math.floor(n / 60)}m ${n % 60}s`;
  return `~${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
}

export function formatElapsed(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const n = Math.round(seconds);
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s`;
  return `${Math.floor(n / 3600)}h ${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}m`;
}
