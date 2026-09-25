import { createApiClient } from '@teamchat/api-client';

const bridge = typeof window !== 'undefined' ? window.teamchat : null;
export const IN_APP = Boolean(bridge?.inApp);

// Packaged apps point at a configurable server (Settings → Desktop);
// browsers/Docker keep VITE_API_URL. Override stored in localStorage so it
// survives restarts without touching the packaged bundle.
function resolveBase() {
  try {
    return localStorage.getItem('tc_api_url') || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  } catch {
    return import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }
}

export let BASE = resolveBase();
export function setApiBase(url) {
  BASE = String(url || '').replace(/\/$/, '') || BASE;
  try {
    localStorage.setItem('tc_api_url', BASE);
  } catch {}
}

export const api = createApiClient({ baseUrl: BASE, getToken: () => accessToken });

let accessToken = null;
let refreshToken = null;
let refreshing = null;
let secureVault = false;

try {
  accessToken = localStorage.getItem('tc_access') || null;
  if (!IN_APP) refreshToken = localStorage.getItem('tc_refresh') || null;
} catch {}

// Phase 10: in the packaged app the refresh token lives in the OS keychain
// (safeStorage via auth IPC). Access token stays in memory only.
async function loadVault() {
  if (!IN_APP) return;
  try {
    const session = await bridge.auth.getSession();
    if (session?.refresh) {
      refreshToken = session.refresh;
      secureVault = Boolean(session.secure);
    }
  } catch {}
}
export const vaultReady = loadVault();

async function persistTokens(a, r) {
  accessToken = a || null;
  refreshToken = r || null;
  try {
    if (a) localStorage.setItem('tc_access', a);
    else localStorage.removeItem('tc_access');
  } catch {}
  if (IN_APP) {
    try {
      if (r) {
        const res = await bridge.auth.login(r);
        secureVault = Boolean(res?.secure);
      } else {
        await bridge.auth.logout();
      }
    } catch {}
    try {
      localStorage.removeItem('tc_refresh');
    } catch {}
  } else {
    try {
      if (r) localStorage.setItem('tc_refresh', r);
      else localStorage.removeItem('tc_refresh');
    } catch {}
  }
}

function saveTokens(a, r) {
  // Fire-and-forget persistence; in-memory tokens update synchronously.
  accessToken = a || null;
  refreshToken = r || null;
  persistTokens(a, r).catch(() => {});
}

async function tryRefresh() {
  if (!refreshing) {
    refreshing = (async () => {
      await vaultReady.catch(() => {});
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error('refresh failed'), { status: res.status });
      await persistTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

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

export function isOfflineError(e) {
  return e instanceof TypeError || String(e?.message || '').toLowerCase().includes('fetch');
}

async function apiRequest(path, { method = 'GET', body } = {}, token) {
  const base = BASE;
  const full = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(full, {
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

// Server compatibility + update feed (Phase 10). App version comes from the
// packaged bridge, falling back to the web bundle version.
export async function appVersion() {
  try {
    const v = await bridge?.system?.version();
    if (v?.version) return v.version;
  } catch {}
  return '0.1.0';
}

export async function checkServerCompat() {
  const v = await appVersion();
  const res = await fetch(`${BASE}/version?appVersion=${encodeURIComponent(v)}`);
  const data = await res.json().catch(() => ({}));
  return { ...data, appVersion: v };
}

export async function checkAppUpdates() {
  const v = await appVersion();
  const res = await fetch(`${BASE}/updates/latest?current=${encodeURIComponent(v)}`);
  return res.json().catch(() => ({ available: false }));
}

export const authApi = {
  get tokens() {
    return { accessToken, refreshToken, secureVault };
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
  notifications: () => authed('/notifications'),
  markNotificationsRead: () => authed('/notifications/read', { method: 'POST', body: {} }),
};
