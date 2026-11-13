// Helpers de formatage partagés par les composants

/**
 * SQLite renvoie des dates UTC au format "YYYY-MM-DD HH:MM:SS" (sans fuseau).
 * On les interprète explicitement en UTC.
 */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  let str = String(value).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) str += 'Z';
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

const euroFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const numberFmt = new Intl.NumberFormat('fr-FR');

export function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount) || 0;
  if (!currency || currency === 'EUR') return euroFmt.format(n);
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(n) {
  return numberFmt.format(Number(n) || 0);
}

export function formatDateTime(value) {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value) {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDayLabel(value) {
  const d = parseDate(value);
  if (!d) return '—';
  if (isToday(d)) return "Aujourd'hui";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function timeAgo(value) {
  const d = parseDate(value);
  if (!d) return '—';
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 10) return "à l'instant";
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  return `il y a ${days} j`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(value) {
  const d = parseDate(value);
  return d ? sameDay(d, new Date()) : false;
}

export function localDayKey(value) {
  const d = parseDate(value);
  if (!d) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Pourcentage CA courant / seuil, borné à [0, 100] pour l'affichage */
export function revenuePercent(store) {
  const threshold = Number(store?.threshold_euros) || 0;
  if (threshold <= 0) return 0;
  return Math.max(0, Math.min(100, ((Number(store.current_revenue) || 0) / threshold) * 100));
}

/** Vert < 60 %, orange 60-90 %, rouge > 90 % */
export function progressTone(pct) {
  if (pct > 90) {
    return { bar: 'from-red-500 to-rose-400', text: 'text-red-400', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.5)]' };
  }
  if (pct >= 60) {
    return { bar: 'from-amber-500 to-orange-400', text: 'text-amber-400', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.45)]' };
  }
  return { bar: 'from-emerald-500 to-teal-400', text: 'text-emerald-400', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.45)]' };
}

// Palette de badges par boutique (classes littérales pour le JIT Tailwind)
const STORE_PALETTE = [
  { badge: 'bg-violet-500/15 text-violet-300 ring-violet-500/30', dot: 'bg-violet-400' },
  { badge: 'bg-sky-500/15 text-sky-300 ring-sky-500/30', dot: 'bg-sky-400' },
  { badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30', dot: 'bg-emerald-400' },
  { badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', dot: 'bg-amber-400' },
  { badge: 'bg-pink-500/15 text-pink-300 ring-pink-500/30', dot: 'bg-pink-400' },
  { badge: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30', dot: 'bg-cyan-400' },
  { badge: 'bg-orange-500/15 text-orange-300 ring-orange-500/30', dot: 'bg-orange-400' },
  { badge: 'bg-lime-500/15 text-lime-300 ring-lime-500/30', dot: 'bg-lime-400' },
];

export function storeColor(storeId) {
  const id = Number(storeId) || 0;
  return STORE_PALETTE[Math.abs(id - 1) % STORE_PALETTE.length];
}

export const INSIGHT_TYPES = {
  daily_summary: { label: 'Résumé quotidien', short: 'Résumé', icon: 'sparkles' },
  rotation_analysis: { label: 'Analyse rotations', short: 'Rotations', icon: 'rotate' },
  sales_forecast: { label: 'Prévision ventes', short: 'Prévision', icon: 'trend' },
};

export function insightLabel(type) {
  return INSIGHT_TYPES[type]?.label || type || 'Insight';
}

export function rotationReason(reason) {
  if (!reason) return { label: 'Inconnue', reset: false };
  const reset = reason.endsWith('_reset');
  const base = reset ? reason.slice(0, -'_reset'.length) : reason;
  const labels = {
    threshold_reached: 'Seuil atteint',
    manual: 'Manuelle',
  };
  return { label: labels[base] || base.replace(/_/g, ' '), reset, manual: base === 'manual' };
}

export function orderStatus(status) {
  const map = {
    paid: { label: 'Payée', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
    pending: { label: 'En attente', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
    refunded: { label: 'Remboursée', cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
    partially_refunded: { label: 'Remb. partiel', cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
    cancelled: { label: 'Annulée', cls: 'bg-red-500/15 text-red-300 ring-red-500/30' },
    voided: { label: 'Annulée', cls: 'bg-red-500/15 text-red-300 ring-red-500/30' },
  };
  return map[status] || { label: status || '—', cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' };
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}
