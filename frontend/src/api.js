// Client REST du backend MultiStore.
// La clé admin n'est jamais compilée dans le site : elle est saisie à la connexion
// et gardée uniquement dans le navigateur de l'utilisateur.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').trim().replace(/\/+$/, '');

const WS_BASE = (import.meta.env.VITE_WS_URL || API_URL.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`))
  .trim()
  .replace(/\/+$/, '');

const STORAGE_KEY = 'multistore.adminKey';
export const AUTH_EVENT = 'multistore:auth-required';

let memoryKey = '';

export function getApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || memoryKey;
  } catch {
    return memoryKey;
  }
}

export function setApiKey(key) {
  memoryKey = key;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // stockage indisponible (navigation privée) : la clé reste en mémoire
  }
}

export function clearApiKey() {
  memoryKey = '';
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // rien à faire
  }
}

export function wsUrl() {
  const key = getApiKey();
  return key ? `${WS_BASE}/?key=${encodeURIComponent(key)}` : null;
}

export const redirectUrl = `${API_URL}/go`;
export const webhookUrl = (storeId) => `${API_URL}/webhooks/${storeId}/orders/paid`;

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, signal, key } = {}) {
  const headers = { 'x-api-key': key ?? getApiKey(), Accept: 'application/json' };
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
    throw new ApiError('Serveur injoignable (il démarre peut-être, réessaie dans quelques secondes)', 0);
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
      (res.status === 401 ? 'Clé admin invalide' : `Erreur HTTP ${res.status}`);
    if (res.status === 401 && key === undefined) window.dispatchEvent(new Event(AUTH_EVENT));
    throw new ApiError(message, res.status, data);
  }
  return data;
}

// Vérifie une clé sans la sauvegarder (écran de connexion)
export const checkKey = (key) => request('/api/stores', { key });

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

export const updateStore = (id, { name, shopifyDomain, shopifyToken }) =>
  request(`/api/stores/${id}`, { method: 'PATCH', body: { name, shopifyDomain, shopifyToken } });

export const deleteStore = (id) => request(`/api/stores/${id}`, { method: 'DELETE' });

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
