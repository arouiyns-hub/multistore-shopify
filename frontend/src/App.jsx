import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Stores from './pages/Stores.jsx';
import Orders from './pages/Orders.jsx';
import Rotations from './pages/Rotations.jsx';
import AI from './pages/AI.jsx';
import { getRedirect, getStats, WS_URL } from './api.js';
import useWebSocket from './useWebSocket.js';
import { formatMoney } from './utils.js';

const POLL_INTERVAL_MS = 30000;
const FRESH_HIGHLIGHT_MS = 6000;

let toastSeq = 0;

export default function App() {
  const [stats, setStats] = useState(null);
  const [redirect, setRedirect] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [freshOrderIds, setFreshOrderIds] = useState(() => new Set());
  const [toasts, setToasts] = useState([]);

  const knownOrderIds = useRef(null);
  const inFlight = useRef(null);
  const freshTimer = useRef(null);

  // --- Notifications ---
  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = 'info', title) => {
      const id = ++toastSeq;
      setToasts((list) => [...list.slice(-4), { id, message, tone, title }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  // --- Chargement des stats (partagé par toutes les pages) ---
  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const [data, redir] = await Promise.all([getStats(), getRedirect().catch(() => null)]);
        const orders = data?.recentOrders || [];

        if (knownOrderIds.current) {
          const fresh = orders.filter((o) => !knownOrderIds.current.has(o.id)).map((o) => o.id);
          if (fresh.length) {
            setFreshOrderIds(new Set(fresh));
            clearTimeout(freshTimer.current);
            freshTimer.current = setTimeout(() => setFreshOrderIds(new Set()), FRESH_HIGHLIGHT_MS);
          }
        }
        knownOrderIds.current = new Set(orders.map((o) => o.id));

        setStats(data);
        setRedirect(redir);
        setError(null);
        setLastUpdated(Date.now());
      } catch (err) {
        setError(err.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  // Chargement initial + polling de secours toutes les 30 s
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(freshTimer.current);
    };
  }, [refresh]);

  // --- Temps réel ---
  const handleWsMessage = useCallback(
    (msg) => {
      if (!msg || typeof msg !== 'object') return;
      const data = msg.data || {};
      // Le backend envoie data.order = ligne boutique mise à jour (name, current_revenue…)
      const storeName = data.order?.store_name || data.order?.name || 'une boutique';

      if (msg.type === 'new_order') {
        const revenue = data.order?.current_revenue;
        notify(
          revenue != null
            ? `${storeName} — CA courant ${formatMoney(revenue)}`
            : `Commande reçue sur ${storeName}`,
          'success',
          'Nouvelle commande',
        );
      } else if (msg.type === 'rotation') {
        const nextName = data.nextStore?.name || '—';
        notify(`${storeName} → ${nextName}`, 'warning', 'Rotation automatique');
      }
      refresh();
    },
    [notify, refresh],
  );

  const ws = useWebSocket(WS_URL, { onMessage: handleWsMessage, onOpen: refresh });

  const context = {
    stats,
    redirect,
    loading,
    error,
    lastUpdated,
    refresh,
    notify,
    freshOrderIds,
    ws,
  };

  return (
    <Routes>
      <Route element={<Layout context={context} toasts={toasts} onDismissToast={dismiss} />}>
        <Route index element={<Dashboard />} />
        <Route path="stores" element={<Stores />} />
        <Route path="orders" element={<Orders />} />
        <Route path="rotations" element={<Rotations />} />
        <Route path="ai" element={<AI />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
