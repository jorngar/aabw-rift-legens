// Formatters shared across dashboard modules.

export function fmt(n) {
  return n == null ? '—' : Number(n).toLocaleString();
}

export function fmtMs(n) {
  if (n == null) return '—';
  if (n < 1000) return n + 'ms';
  return (n / 1000).toFixed(1) + 's';
}

export function fmtPct(n, total) {
  if (!total) return '0%';
  return ((n / total) * 100).toFixed(0) + '%';
}

export function fmtRatio(dealt, taken) {
  if (!taken) return dealt ? '∞' : '—';
  return (dealt / taken).toFixed(2);
}

export function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
