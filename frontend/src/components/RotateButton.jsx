import { useState } from 'react';
import Icon, { Spinner } from './Icon.jsx';
import { rotate } from '../api.js';
import { classNames } from '../utils.js';

/**
 * Déclenche une rotation manuelle vers la boutique suivante.
 */
export default function RotateButton({ activeStore, onRotated, notify, variant = 'primary', className = '' }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const msg = activeStore
      ? `Forcer la rotation depuis « ${activeStore.name} » vers la boutique suivante ?`
      : 'Forcer une rotation manuelle ?';
    if (!window.confirm(msg)) return;

    setLoading(true);
    try {
      const res = await rotate();
      const from = res?.previous?.name || '—';
      const to = res?.next?.name;
      if (to) {
        notify?.(`${from} → ${to}`, 'success', 'Rotation effectuée');
      } else {
        notify?.('Aucune boutique disponible pour la rotation', 'warning', 'Rotation');
      }
      await onRotated?.();
    } catch (err) {
      notify?.(err.message, 'error', 'Rotation impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || !activeStore}
      title={activeStore ? 'Passer à la boutique suivante' : 'Aucune boutique active à faire tourner'}
      className={classNames(variant === 'ghost' ? 'btn-ghost' : 'btn-primary', 'group', className)}
    >
      {loading ? (
        <Spinner className="h-4 w-4" />
      ) : (
        <Icon name="rotate" className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
      )}
      Rotation manuelle
    </button>
  );
}
