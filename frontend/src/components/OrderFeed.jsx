import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { classNames, formatMoney, storeColor, timeAgo } from '../utils.js';

/**
 * Feed temps réel des commandes.
 * Les commandes arrivées via WebSocket (ou polling) depuis le dernier chargement
 * sont mises en évidence (slide-in + flash vert).
 */
export default function OrderFeed({ orders = [], freshIds, wsStatus, limit = 12 }) {
  const [, tick] = useState(0);

  // Met à jour les "il y a X min"
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(id);
  }, []);

  const items = orders.slice(0, limit);
  const live = wsStatus === 'open';

  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={classNames('relative inline-flex h-2.5 w-2.5 rounded-full', live ? 'bg-emerald-400' : 'bg-slate-500')} />
          </span>
          <h2 className="section-title">Commandes en direct</h2>
        </div>
        <span className="text-xs text-slate-500">{live ? 'WebSocket' : 'Polling 30 s'}</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
          <Icon name="bag" className="h-8 w-8 text-slate-600" />
          En attente de la première commande…
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-white/[0.04] overflow-y-auto">
          {items.map((o) => {
            const fresh = freshIds?.has(o.id);
            const color = storeColor(o.store_id);
            return (
              <li
                key={o.id}
                className={classNames(
                  'flex items-center gap-3 px-5 py-3 transition-all duration-200 hover:bg-white/[0.02]',
                  fresh && 'animate-slide-in',
                )}
              >
                <div className={classNames('flex w-full items-center gap-3 rounded-lg', fresh && 'animate-flash')}>
                  <div className={classNames('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', color.badge)}>
                    <Icon name="bag" className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {o.customer_name || o.customer_email || 'Client anonyme'}
                      </span>
                      {fresh && (
                        <span className="rounded-full bg-emerald-500/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                          New
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {o.order_number ? `#${o.order_number} · ` : ''}
                      {o.store_name} · {timeAgo(o.created_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-semibold text-emerald-300 tabular-nums">
                    +{formatMoney(o.total_price, o.currency)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to="/orders"
        className="flex items-center justify-center gap-1.5 border-t border-white/[0.05] px-5 py-3 text-xs font-medium text-slate-400 transition-all duration-200 hover:bg-white/[0.03] hover:text-white"
      >
        Toutes les commandes <Icon name="arrowRight" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
