import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon, { Spinner } from './Icon.jsx';
import { classNames, timeAgo } from '../utils.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/stores', label: 'Boutiques', icon: 'store' },
  { to: '/orders', label: 'Commandes', icon: 'orders' },
  { to: '/rotations', label: 'Rotations', icon: 'rotate' },
  { to: '/ai', label: 'Assistant IA', icon: 'sparkles' },
];

const TITLES = {
  '/': { title: 'Dashboard', subtitle: 'Vue d’ensemble en temps réel de vos boutiques' },
  '/stores': { title: 'Boutiques', subtitle: 'Gestion des boutiques, seuils et activation' },
  '/orders': { title: 'Commandes', subtitle: 'Les 50 dernières commandes toutes boutiques' },
  '/rotations': { title: 'Historique des rotations', subtitle: 'Bascules entre boutiques et CA atteint' },
  '/ai': { title: 'Assistant IA', subtitle: 'Analyses et prévisions générées par Claude' },
};

const TOAST_TONES = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  info: 'border-accent/30 bg-accent/10 text-violet-200',
};
const TOAST_ICONS = { success: 'bag', warning: 'rotate', error: 'alert', info: 'sparkles' };

function WsStatus({ ws }) {
  const map = {
    open: { label: 'Temps réel', dot: 'bg-emerald-400', cls: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10' },
    connecting: { label: 'Connexion…', dot: 'bg-amber-400', cls: 'text-amber-300 border-amber-500/25 bg-amber-500/10' },
    closed: { label: 'Hors ligne', dot: 'bg-red-400', cls: 'text-red-300 border-red-500/25 bg-red-500/10' },
  };
  const s = map[ws.status] || map.closed;
  return (
    <span
      className={classNames('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', s.cls)}
      title={ws.status === 'closed' ? 'WebSocket déconnecté — polling 30 s actif' : 'WebSocket'}
    >
      <span className={classNames('h-2 w-2 rounded-full', s.dot, ws.status !== 'closed' && 'animate-pulse-dot')} />
      {s.label}
      {ws.status === 'closed' && ws.reconnectIn != null && (
        <span className="text-red-400/70">· {ws.reconnectIn}s</span>
      )}
    </span>
  );
}

function Sidebar({ onNavigate, activeStore }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6 md:justify-center md:px-0 lg:justify-start lg:px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-fuchsia-500 shadow-glow">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18V6l6 6 6-6v12" />
          </svg>
        </div>
        <div className="md:hidden lg:block">
          <div className="text-[15px] font-semibold tracking-tight text-white">MultiStore</div>
          <div className="text-[11px] text-slate-500">Shopify rotation panel</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={item.label}
            className={({ isActive }) =>
              classNames(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 md:justify-center lg:justify-start',
                isActive
                  ? 'bg-gradient-to-r from-accent/25 to-accent/5 text-white ring-1 ring-inset ring-accent/30'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-light" />}
                <Icon name={item.icon} className={classNames('h-5 w-5 shrink-0', isActive ? 'text-accent-light' : '')} />
                <span className="md:hidden lg:inline">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 md:hidden lg:block">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Boutique active</div>
        {activeStore ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span className="truncate text-sm font-medium text-slate-200">{activeStore.name}</span>
          </div>
        ) : (
          <div className="mt-1 text-sm text-red-300">Aucune</div>
        )}
      </div>
    </div>
  );
}

export default function Layout({ context, toasts, onDismissToast }) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, forceTick] = useState(0);

  const { stats, redirect, error, loading, lastUpdated, refresh, ws } = context;
  const activeStore = stats?.stores?.find((s) => s.is_active && s.is_enabled) || null;
  const meta = TITLES[location.pathname] || TITLES['/'];

  // Ferme le tiroir mobile lors d'un changement de page
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Rafraîchit l'affichage "mis à jour il y a…"
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen">
      {/* Sidebar desktop / tablette */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden border-r border-white/[0.06] bg-[#121219]/90 backdrop-blur-xl md:block md:w-20 lg:w-64">
        <Sidebar activeStore={activeStore} />
      </aside>

      {/* Tiroir mobile */}
      <div
        className={classNames(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-all duration-200 md:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-white/[0.06] bg-[#121219] transition-all duration-200 md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar activeStore={activeStore} onNavigate={() => setDrawerOpen(false)} />
      </aside>

      <div className="md:pl-20 lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-base/75 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="btn-ghost btn-sm md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-white">{meta.title}</h1>
              <p className="truncate text-sm text-slate-500">{meta.subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {redirect?.url && (
                <a
                  href={redirect.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition-all duration-200 hover:border-accent/40 hover:text-white lg:inline-flex"
                  title="Redirection client actuelle"
                >
                  <Icon name="link" className="h-3.5 w-3.5 text-accent-light" />
                  <span className="max-w-[220px] truncate">{redirect.domain}</span>
                </a>
              )}
              <WsStatus ws={ws} />
              <button
                type="button"
                onClick={handleRefresh}
                className="btn-ghost btn-sm"
                title={lastUpdated ? `Mis à jour ${timeAgo(lastUpdated)}` : 'Rafraîchir'}
              >
                {refreshing ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" className="h-4 w-4" />}
                <span className="hidden sm:inline">{lastUpdated ? timeAgo(lastUpdated) : 'Rafraîchir'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <div className="font-medium">Impossible de charger les données</div>
                <div className="text-red-300/80">
                  {error}
                  {stats ? ' — affichage des dernières données connues.' : ''}
                </div>
              </div>
              <button type="button" className="btn-danger btn-sm" onClick={handleRefresh}>
                Réessayer
              </button>
            </div>
          )}

          {loading && !stats ? (
            <div className="flex h-[60vh] items-center justify-center gap-3 text-slate-400">
              <Spinner className="h-6 w-6 text-accent-light" /> Chargement du panel…
            </div>
          ) : (
            <Outlet context={context} />
          )}
        </main>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={classNames(
              'pointer-events-auto flex animate-slide-in items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur-xl',
              TOAST_TONES[t.tone] || TOAST_TONES.info,
            )}
          >
            <Icon name={TOAST_ICONS[t.tone] || 'sparkles'} className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              {t.title && <div className="font-semibold">{t.title}</div>}
              <div className="break-words opacity-90">{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismissToast(t.id)}
              className="opacity-60 transition-all duration-200 hover:opacity-100"
              aria-label="Fermer"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
