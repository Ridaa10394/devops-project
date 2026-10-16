// All calls go to a relative /api path. In Docker / Kubernetes the nginx in the
// frontend container (or the Ingress) forwards /api to the backend Service, so
// the browser never needs to know an internal hostname.
const API = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d) => `${d.loc.at(-1)}: ${d.msg}`).join(', ')
      : body.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/items${qs.toString() ? `?${qs}` : ''}`);
  },
  stats: () => request('/items/stats'),
  create: (item) => request('/items', { method: 'POST', body: JSON.stringify(item) }),
  update: (id, item) => request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  adjust: (id, delta) => request(`/items/${id}/adjust`, { method: 'POST', body: JSON.stringify({ delta }) }),
  remove: (id) => request(`/items/${id}`, { method: 'DELETE' }),
};
