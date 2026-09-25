import { authed } from './api.js';

export const searchApi = {
  search: ({ workspaceId, q, type = 'all', limit = 20, cursor } = {}) => {
    const params = new URLSearchParams({
      workspaceId, q, type, limit: String(limit),
      ...(cursor ? { cursor } : {}),
    });
    return authed(`/search?${params}`);
  },
};

const RECENT_KEY = 'tc_recent_searches';

export function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushRecentSearch(q) {
  const clean = String(q || '').trim();
  if (!clean) return;
  const list = [clean, ...getRecentSearches().filter((x) => x !== clean)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}
