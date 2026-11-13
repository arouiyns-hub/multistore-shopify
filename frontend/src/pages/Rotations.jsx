import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import RotateButton from '../components/RotateButton.jsx';
import {
  classNames,
  formatDayLabel,
  formatMoney,
  formatTime,
  isToday,
  localDayKey,
  rotationReason,
  storeColor,
} from '../utils.js';

function StoreChip({ id, name }) {
  if (!name) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-inset ring-slate-500/25">
        Aucune
      </span>
    );
  }
  const color = storeColor(id);
  return (
    <span className={classNames('inline-flex max-w-[180px] items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', color.badge)}>
      <span className={classNames('h-1.5 w-1.5 shrink-0 rounded-full', color.dot)} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Histogramme SVG des rotations sur les 7 derniers jours */
function WeekChart({ rotations }) {
  const days = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      out.push({
        key,
        label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
        count: rotations.filter((r) => localDayKey(r.created_at) === key).length,
      });
    }
    return out;
  }, [rotations]);

  const max = Math.max(1, ...days.map((d) => d.count));
  const W = 280;
  const H = 120;
  const barW = 26;
  const gap = (W - barW * 7) / 6;

  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-auto w-full" role="img" aria-label="Rotations sur 7 jours">
      <defs>
        <linearGradient id="rotBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {days.map((d, i) => {
        const h = d.count ? Math.max(6, (d.count / max) * (H - 18)) : 3;
        const x = i * (barW + gap);
        const y = H - h;
        const today = i === 6;
        return (
          <g key={d.key}>
            <rect x={x} y={0} width={barW} height={H} rx="6" fill="rgba(255,255,255,0.03)" />
            <rect x={x} y={y} width={barW} height={h} rx="6" fill={d.count ? 'url(#rotBar)' : 'rgba(255,255,255,0.08)'}>
              <title>{`${d.label} : ${d.count} rotation(s)`}</title>
            </rect>
            {d.count > 0 && (
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="10" fill="#e2e8f0" fontWeight="600">
                {d.count}
              </text>
            )}
            <text x={x + barW / 2} y={H + 15} textAnchor="middle" fontSize="10" fill={today ? '#a78bfa' : '#64748b'} fontWeight={today ? 600 : 400}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Rotations() {
  const { stats, refresh, notify } = useOutletContext();
  const rotations = stats?.rotations || [];
  const stores = stats?.stores || [];
  const activeStore = stores.find((s) => s.is_active && s.is_enabled) || null;
  const thresholds = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s.threshold_euros])), [stores]);

  const todayCount = rotations.filter((r) => isToday(r.created_at)).length;
  const autoCount = rotations.filter((r) => !rotationReason(r.reason).manual).length;
  const avgRevenue = rotations.length
    ? rotations.reduce((sum, r) => sum + (Number(r.revenue_at_rotation) || 0), 0) / rotations.length
    : 0;

  const groups = useMemo(() => {
    const map = new Map();
    rotations.forEach((r) => {
      const key = localDayKey(r.created_at) || 'unknown';
      if (!map.has(key)) map.set(key, { key, label: formatDayLabel(r.created_at), items: [] });
      map.get(key).items.push(r);
    });
    return [...map.values()];
  }, [rotations]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass grid grid-cols-2 gap-5 p-5 lg:col-span-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Rotations (20 dernières)</div>
            <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{rotations.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Aujourd’hui</div>
            <div className="mt-1 text-2xl font-semibold text-amber-300 tabular-nums">{todayCount}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Automatiques / manuelles</div>
            <div className="mt-1 text-2xl font-semibold text-white tabular-nums">
              {autoCount} <span className="text-slate-500">/</span> {rotations.length - autoCount}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">CA moyen à la rotation</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300 tabular-nums">{formatMoney(avgRevenue)}</div>
          </div>
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              Boutique active : <StoreChip id={activeStore?.id} name={activeStore?.name} />
            </div>
            <RotateButton activeStore={activeStore} onRotated={refresh} notify={notify} />
          </div>
        </div>
        <div className="glass p-5">
          <h2 className="section-title">7 derniers jours</h2>
          <div className="mt-4">
            <WeekChart rotations={rotations} />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="glass p-5 sm:p-6">
        <h2 className="section-title">Timeline</h2>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-slate-500">
            <Icon name="rotate" className="h-10 w-10 text-slate-600" />
            Aucune rotation enregistrée pour le moment.
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500 first-letter:uppercase">
                  {group.label}
                </div>
                <ol className="relative ml-3 border-l border-white/[0.08]">
                  {group.items.map((r) => {
                    const reason = rotationReason(r.reason);
                    const threshold = thresholds[r.from_store_id];
                    const pct = threshold ? Math.min(100, (r.revenue_at_rotation / threshold) * 100) : null;
                    return (
                      <li key={r.id} className="group relative pb-6 pl-8 last:pb-0">
                        <span
                          className={classNames(
                            'absolute -left-[9px] top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-4 ring-[#1a1a24] transition-all duration-200 group-hover:scale-110',
                            reason.manual ? 'bg-sky-500' : 'bg-accent',
                          )}
                        >
                          <Icon name={reason.manual ? 'user' : 'bolt'} className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                        </span>

                        <div className="rounded-xl border border-white/[0.05] bg-black/20 p-4 transition-all duration-200 group-hover:border-white/[0.1] group-hover:bg-black/30">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <StoreChip id={r.from_store_id} name={r.from_store_name} />
                              <Icon name="arrowRight" className="h-4 w-4 text-slate-500" />
                              <StoreChip id={r.to_store_id} name={r.to_store_name} />
                            </div>
                            <span className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                              <Icon name="clock" className="h-3.5 w-3.5" />
                              {formatTime(r.created_at)}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div>
                              <span className="text-[11px] uppercase tracking-wider text-slate-500">CA atteint </span>
                              <span className="text-sm font-semibold text-white tabular-nums">{formatMoney(r.revenue_at_rotation)}</span>
                              {threshold ? (
                                <span className="text-xs text-slate-500"> / {formatMoney(threshold)}</span>
                              ) : null}
                            </div>
                            <span
                              className={classNames(
                                'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                                reason.manual
                                  ? 'bg-sky-500/10 text-sky-300 ring-sky-500/25'
                                  : 'bg-accent/15 text-violet-200 ring-accent/30',
                              )}
                            >
                              {reason.label}
                            </span>
                            {reason.reset && (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/25">
                                Cycle relancé (reset)
                              </span>
                            )}
                          </div>

                          {pct !== null && (
                            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                              <div
                                className={classNames(
                                  'h-full rounded-full',
                                  pct > 90 ? 'bg-red-400' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-400',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
