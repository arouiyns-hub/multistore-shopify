import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon, { Spinner } from './Icon.jsx';
import { INSIGHT_TYPES, classNames, formatDateTime, insightLabel, timeAgo } from '../utils.js';

// --- Rendu léger du Markdown renvoyé par Claude (titres, listes, gras) ---
function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={`${keyPrefix}-${i}`} className="rounded bg-white/10 px-1 py-0.5 text-[0.85em] text-violet-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function InsightContent({ content, className = '' }) {
  const lines = String(content || '').split(/\r?\n/);
  const blocks = [];
  let list = null;

  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      flush();
      return;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);

    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flush();
        list = { kind, items: [] };
      }
      list.items.push(bullet ? bullet[1] : numbered[2]);
      return;
    }
    flush();
    if (heading) blocks.push({ kind: 'h', text: heading[1] });
    else blocks.push({ kind: 'p', text: line });
  });
  flush();

  return (
    <div className={classNames('space-y-2.5 text-sm leading-relaxed text-slate-300', className)}>
      {blocks.map((b, i) => {
        if (b.kind === 'h') {
          return (
            <h4 key={i} className="pt-1 text-sm font-semibold text-white">
              {renderInline(b.text, i)}
            </h4>
          );
        }
        if (b.kind === 'p') return <p key={i}>{renderInline(b.text, i)}</p>;
        const ListTag = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <ListTag key={i} className="space-y-1.5">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                {b.kind === 'ul' ? (
                  <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-light" />
                ) : (
                  <span className="shrink-0 font-semibold text-accent-light tabular-nums">{j + 1}.</span>
                )}
                <span className="min-w-0">{renderInline(item, `${i}-${j}`)}</span>
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

export function InsightTypeBadge({ type }) {
  const meta = INSIGHT_TYPES[type];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-200 ring-1 ring-inset ring-accent/30">
      <Icon name={meta?.icon || 'sparkles'} className="h-3 w-3" />
      {insightLabel(type)}
    </span>
  );
}

/**
 * Carte "dernier insight IA" (dashboard) avec génération à la demande.
 * @param {object|null} props.insight      { id, type, content, created_at }
 * @param {Function}    props.onGenerate   (type) => Promise
 * @param {boolean}     props.generating
 * @param {boolean}     props.loading
 */
export default function AIInsight({ insight, onGenerate, generating = false, loading = false }) {
  const [type, setType] = useState('daily_summary');

  return (
    <div className="glass relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-fuchsia-500 shadow-glow">
            <Icon name="sparkles" className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Insight IA</h2>
            <p className="text-xs text-slate-500">
              {insight ? (
                <span title={formatDateTime(insight.created_at)}>Généré {timeAgo(insight.created_at)}</span>
              ) : (
                'Analyse par Claude'
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="input w-auto py-1.5 text-xs"
            disabled={generating}
            aria-label="Type d’insight"
          >
            {Object.entries(INSIGHT_TYPES).map(([key, meta]) => (
              <option key={key} value={key} className="bg-card">
                {meta.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary btn-sm" onClick={() => onGenerate?.(type)} disabled={generating}>
            {generating ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="sparkles" className="h-3.5 w-3.5" />}
            {generating ? 'Génération…' : 'Générer'}
          </button>
        </div>
      </div>

      <div className="relative mt-5">
        {generating ? (
          <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-4 text-sm text-violet-200">
            <span className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent-light [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent-light [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent-light" />
            </span>
            Claude analyse vos données ({insightLabel(type)})…
          </div>
        ) : loading && !insight ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> Chargement des insights…
          </div>
        ) : insight ? (
          <div className="animate-slide-in rounded-xl border border-white/[0.05] bg-black/20 p-4">
            <div className="mb-3">
              <InsightTypeBadge type={insight.type} />
            </div>
            <InsightContent content={insight.content} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
            Aucun insight pour l’instant. Cliquez sur « Générer » pour obtenir une première analyse.
          </div>
        )}
      </div>

      <div className="relative mt-4 flex justify-end">
        <Link
          to="/ai"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-all duration-200 hover:text-accent-light"
        >
          Historique des insights <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
