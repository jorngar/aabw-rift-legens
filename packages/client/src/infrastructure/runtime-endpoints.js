// ============================================================
// Runtime endpoint config for the browser bundle.
//
// - Local dev: Vite proxies /api + /ws to http://localhost:3000, so the
//   browser can use relative URLs and same-origin WS.
// - Production build: set VITE_API_BASE=https://<lb-domain> at build time
//   so fetch/WS calls hit the deployed LB directly.
// ============================================================

const RAW_BASE = import.meta.env?.VITE_API_BASE || '';

/** HTTP base for fetch() calls. Empty string keeps calls same-origin (dev). */
export const API_BASE = RAW_BASE.replace(/\/$/, '');

/** WebSocket base derived from API_BASE, or same-origin fallback. */
export const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, 'ws')
  : `${location.protocol.replace('http', 'ws')}//${location.host}`;
