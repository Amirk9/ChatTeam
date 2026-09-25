import { createApiClient } from '@teamchat/api-client';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let accessToken = localStorage.getItem('tc_access') || null;
let refreshToken = localStorage.getItem('tc_refresh') || null;
let refreshing = null;

function saveTokens(a, r) {
  accessToken = a || null;
  refreshToken = r || null;
  if (a) localStorage.setItem('tc_access', a);
  else localStorage.removeItem('tc_access');
  if (r) localStorage.setItem('tc_refresh', r);
  else localStorage.removeItem('tc_refresh');
}
// NOTE (Phase 2 dev): tokens in localStorage. Phase 10 moves refresh tokens
// to Electron safeStorage via auth IPC (see electron/preload/preload.js).

async function tryRefresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error('refresh failed'), { status: res.status });
      saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export const api = createApiClient({ baseUrl: BASE, getToken: () => accessToken });

// Wrapped request with single-flight 401 -> refresh -> retry.
export async function authed(path, opts = {}) {
  try {
    return await apiRequest(path, opts, accessToken);
  } catch (e) {
    if (e.status === 401 && refreshToken) {
      try {
        const fresh = await tryRefresh();
        return await apiRequest(path, opts, fresh);
      } catch {
        saveTokens(null, null);
        throw e;
      }
    }
    throw e;
  }
}

async function apiRequest(path, { method = 'GET', body } = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'Request failed'), { status: res.status, code: data?.error?.code });
  return data;
}

export const authApi = {
  get tokens() {
    return { accessToken, refreshToken };
  },
  async register(input) {
    return apiRequest('/auth/register', { method: 'POST', body: input });
  },
  async login(input) {
    const data = await apiRequest('/auth/login', { method: 'POST', body: input });
    saveTokens(data.accessToken, data.refreshToken);
    return data;
  },
  async logout() {
    try {
      await authed('/auth/logout', { method: 'POST' });
    } finally {
      saveTokens(null, null);
    }
  },
  me: () => authed('/auth/me').then((d) => d.user),
  updateMe: (patch) => authed('/users/me', { method: 'PATCH', body: patch }).then((d) => d.user),
  forgot: (email) => apiRequest('/auth/forgot-password', { method: 'POST', body: { email } }),
  reset: (token, password) => apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } }),
  verifyEmail: (token) => apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`),
};
