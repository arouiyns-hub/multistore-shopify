import Icon from './Icon.jsx';
import { classNames } from '../utils.js';

const ACCENTS = {
  violet: { icon: 'from-accent/30 to-accent/5 text-accent-light ring-accent/30', glow: 'bg-accent/20' },
  emerald: { icon: 'from-emerald-500/30 to-emerald-500/5 text-emerald-300 ring-emerald-500/30', glow: 'bg-emerald-500/15' },
  sky: { icon: 'from-sky-500/30 to-sky-500/5 text-sky-300 ring-sky-500/30', glow: 'bg-sky-500/15' },
  amber: { icon: 'from-amber-500/30 to-amber-500/5 text-amber-300 ring-amber-500/30', glow: 'bg-amber-500/15' },
};

export default function KPICard({ label, value, sub, icon, accent = 'violet', children }) {
  const a = ACCENTS[accent] || ACCENTS.violet;
  return (
    <div className="glass group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.12]">
      <div className={classNames('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl', a.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</div>
          <div className="mt-2 truncate text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
          {sub && <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>}
        </div>
        {icon && (
          <div className={classNames('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset', a.icon)}>
            <Icon name={icon} className="h-5 w-5" />
          </div>
        )}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}
