// Minimal fetch wrapper used by desktop + web (plain JS).
export function createApiClient({ baseUrl, getToken }) {
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const token = getToken?.();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'Request failed'), { status: res.status, data });
    return data;
  }
  return {
    health: () => request('/health'),
    get: (p) => request(p),
    post: (p, b) => request(p, { method: 'POST', body: b }),
    patch: (p, b) => request(p, { method: 'PATCH', body: b }),
    del: (p) => request(p, { method: 'DELETE' }),
  };
}
