// Client REST du backend MultiStore.
// Toutes les requêtes passent par VITE_API_URL et s'authentifient avec VITE_API_KEY.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const API_KEY = import.meta.env.VITE_API_KEY || '';

export const WS_URL =
  import.meta.env.VITE_WS_URL || API_URL.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`);

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'x-api-key': API_KEY, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(`Backend injoignable (${API_URL})`, 0);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && data.error) ||
      (res.status === 401 ? 'Clé API invalide (VITE_API_KEY)' : `Erreur HTTP ${res.status}`);
    throw new ApiError(message, res.status, data);
  }
  return data;
}

// --- Statistiques ---
export const getStats = (opts) => request('/api/stats', opts);

// --- Boutiques ---
export const getStores = (opts) => request('/api/stores', opts);

export const createStore = ({ name, shopifyDomain, shopifyToken, thresholdEuros }) =>
  request('/api/stores', {
    method: 'POST',
    body: {
      name,
      shopifyDomain,
      shopifyToken,
      thresholdEuros: thresholdEuros === '' || thresholdEuros == null ? undefined : Number(thresholdEuros),
    },
  });

export const updateThreshold = (id, threshold) =>
  request(`/api/stores/${id}/threshold`, { method: 'PATCH', body: { threshold: Number(threshold) } });

export const resetStore = (id) => request(`/api/stores/${id}/reset`, { method: 'POST' });

export const toggleStore = (id, enabled) =>
  request(`/api/stores/${id}/toggle`, { method: 'PATCH', body: { enabled: Boolean(enabled) } });

export const activateStore = (id) => request(`/api/stores/${id}/activate`, { method: 'POST' });

// --- Rotation / redirection ---
export const rotate = () => request('/api/rotate', { method: 'POST' });

export const getRedirect = (opts) => request('/api/redirect', opts);

// --- IA ---
export const getInsights = (opts) => request('/api/ai/insights', opts);

export const generateInsight = (type) =>
  request('/api/ai/generate', { method: 'POST', body: { type } });
