import { useEffect, useRef, useState } from 'react';

const RECONNECT_DELAY_MS = 5000;

/**
 * Connexion WebSocket persistante avec reconnexion automatique toutes les 5 s.
 * @param {string} url  URL ws:// ou wss://
 * @param {{ onMessage?: (msg: any) => void, onOpen?: () => void }} handlers
 * @returns {{ status: 'connecting'|'open'|'closed', lastMessageAt: number|null, reconnectIn: number|null }}
 */
export default function useWebSocket(url, { onMessage, onOpen } = {}) {
  const [status, setStatus] = useState('connecting');
  const [lastMessageAt, setLastMessageAt] = useState(null);
  const [reconnectAt, setReconnectAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!url) {
      setStatus('closed');
      return undefined;
    }

    let ws = null;
    let timer = null;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || timer) return;
      setReconnectAt(Date.now() + RECONNECT_DELAY_MS);
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      setReconnectAt(null);
      try {
        ws = new WebSocket(url);
      } catch {
        setStatus('closed');
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (disposed) return;
        setStatus('open');
        onOpenRef.current?.();
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        setLastMessageAt(Date.now());
        onMessageRef.current?.(msg);
      };

      ws.onerror = () => {
        // onclose suit systématiquement onerror : la reconnexion y est gérée
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus('closed');
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      }
    };
  }, [url]);

  // Compte à rebours de reconnexion (affichage uniquement)
  useEffect(() => {
    if (!reconnectAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reconnectAt]);

  const reconnectIn =
    status === 'closed' && reconnectAt ? Math.max(0, Math.ceil((reconnectAt - now) / 1000)) : null;

  return { status, lastMessageAt, reconnectIn };
}
