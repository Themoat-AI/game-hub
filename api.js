// Thin fetch wrapper for the Game Hub API.
// VITE_API_URL is only needed when the client is hosted separately from the server
// (e.g. Vercel + Render). Same-origin deployments leave it empty.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'gh_token';

export class ApiError extends Error {
  constructor(message, status = 0, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  /* storage unavailable (private mode) — session simply won't persist */
}
let onUnauthorized = () => {};

export const getToken = () => token;
export function setToken(next) {
  token = next || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401 && e?.code === 'UNAUTHORIZED' && token) onUnauthorized();
    throw new ApiError(e?.message || `Request failed (${res.status})`, res.status, e?.code, e?.details);
  }
  return data;
}

const qs = (params = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  guest: () => request('/auth/guest', { method: 'POST' }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: (signal) => request('/auth/me', { signal }),
  // games
  games: (params, signal) => request(`/games${qs(params)}`, { signal }),
  featured: (signal) => request('/games/featured', { signal }),
  categories: (signal) => request('/games/categories', { signal }),
  game: (slug, signal) => request(`/games/${slug}`, { signal }),
  play: (slug) => request(`/games/${slug}/play`, { method: 'POST' }),
  getSave: (slug) => request(`/games/${slug}/save`),
  putSave: (slug, data) => request(`/games/${slug}/save`, { method: 'PUT', body: { data } }),
  // scores
  submitScore: (game, score, meta) => request('/scores', { method: 'POST', body: { game, score, meta } }),
  leaderboard: (limit = 20, signal) => request(`/scores/leaderboard${qs({ limit })}`, { signal }),
  gameBoard: (slug, limit = 20, signal) => request(`/scores/game/${slug}${qs({ limit })}`, { signal }),
  myStats: (signal) => request('/scores/me', { signal }),
};
