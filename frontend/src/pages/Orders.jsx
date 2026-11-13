import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import {
  classNames,
  formatDateTime,
  formatMoney,
  orderStatus,
  parseDate,
  storeColor,
  timeAgo,
} from '../utils.js';

function SortHeader({ label, column, sort, onSort, align = 'left' }) {
  const active = sort.column === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={classNames(
        'inline-flex items-center gap-1 uppercase tracking-wider transition-all duration-200 hover:text-white',
        active ? 'text-slate-200' : '',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <svg viewBox="0 0 10 10" className={classNames('h-2.5 w-2.5 transition-all duration-200', active ? 'opacity-100' : 'opacity-30')}>
        <path d={active && sort.dir === 'asc' ? 'M5 2l4 6H1z' : 'M5 8L1 2h8z'} fill="currentColor" />
      </svg>
    </button>
  );
}

export default function Orders() {
  const { stats, freshOrderIds } = useOutletContext();
  const [storeFilter, setStoreFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ column: 'date', dir: 'desc' });

  const orders = stats?.recentOrders || [];
  const stores = stats?.stores || [];

  const onSort = (column) =>
    setSort((s) => (s.column === column ? { column, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { column, dir: 'desc' }));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = orders.filter((o) => {
      if (storeFilter !== 'all' && String(o.store_id) !== storeFilter) return false;
      if (!q) return true;
      return [o.order_number, o.customer_name, o.customer_email, o.store_name, o.shopify_order_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.column === 'amount') return (a.total_price - b.total_price) * factor;
      return ((parseDate(a.created_at)?.getTime() || 0) - (parseDate(b.created_at)?.getTime() || 0)) * factor;
    });
  }, [orders, storeFilter, query, sort]);

  const total = rows.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
  const avg = rows.length ? total / rows.length : 0;

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (n°, client, email, boutique)…"
            className="input pl-9"
          />
        </div>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="input w-auto min-w-[180px]"
          aria-label="Filtrer par boutique"
        >
          <option value="all" className="bg-card">Toutes les boutiques</option>
          {stores.map((s) => (
            <option key={s.id} value={String(s.id)} className="bg-card">
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Commandes affichées</div>
          <div className="mt-1 text-xl font-semibold text-white tabular-nums">{rows.length}</div>
        </div>
        <div className="glass px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Montant cumulé</div>
          <div className="mt-1 text-xl font-semibold text-emerald-300 tabular-nums">{formatMoney(total)}</div>
        </div>
        <div className="glass px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Panier moyen</div>
          <div className="mt-1 text-xl font-semibold text-white tabular-nums">{formatMoney(avg)}</div>
        </div>
      </div>

      {/* Tableau */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] font-medium text-slate-500">
                <th className="px-3 py-3 lg:px-5">
                  <SortHeader label="Date" column="date" sort={sort} onSort={onSort} />
                </th>
                <th className="whitespace-nowrap px-3 py-3 lg:px-5 uppercase tracking-wider">N° cmd</th>
                <th className="px-3 py-3 lg:px-5 uppercase tracking-wider">Client</th>
                <th className="px-3 py-3 lg:px-5 uppercase tracking-wider">Boutique</th>
                <th className="px-3 py-3 lg:px-5 text-right">
                  <SortHeader label="Montant" column="amount" sort={sort} onSort={onSort} align="right" />
                </th>
                <th className="px-3 py-3 lg:px-5 uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-500">
                    {orders.length === 0 ? 'Aucune commande enregistrée pour le moment.' : 'Aucune commande ne correspond aux filtres.'}
                  </td>
                </tr>
              ) : (
                rows.map((o) => {
                  const color = storeColor(o.store_id);
                  const status = orderStatus(o.status);
                  const fresh = freshOrderIds?.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      className={classNames('transition-all duration-200 hover:bg-white/[0.025]', fresh && 'animate-flash')}
                    >
                      <td className="whitespace-nowrap px-3 py-3 lg:px-5">
                        <div className="text-slate-200 tabular-nums">{formatDateTime(o.created_at)}</div>
                        <div className="text-xs text-slate-500">{timeAgo(o.created_at)}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 lg:px-5 font-medium text-slate-200 tabular-nums">
                        {o.order_number ? `#${o.order_number}` : <span className="text-slate-500">—</span>}
                        {o.items_count > 0 && (
                          <div className="text-xs font-normal text-slate-500">
                            {o.items_count} article{o.items_count > 1 ? 's' : ''}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[150px] px-3 py-3 lg:max-w-[240px] lg:px-5">
                        <div className="truncate text-slate-200">{o.customer_name || 'Client anonyme'}</div>
                        {o.customer_email && <div className="truncate text-xs text-slate-500">{o.customer_email}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 lg:px-5">
                        <span className={classNames('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', color.badge)}>
                          <span className={classNames('h-1.5 w-1.5 rounded-full', color.dot)} />
                          {o.store_name}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 lg:px-5 text-right font-semibold text-white tabular-nums">
                        {formatMoney(o.total_price, o.currency)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 lg:px-5">
                        <span className={classNames('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', status.cls)}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/[0.05] px-3 py-3 lg:px-5 text-xs text-slate-500">
          Le backend renvoie les 50 commandes les plus récentes. Mise à jour en temps réel via WebSocket.
        </div>
      </div>
    </div>
  );
}
