import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon, { Spinner } from '../components/Icon.jsx';
import { AIDisabledNotice, InsightContent, InsightTypeBadge } from '../components/AIInsight.jsx';
import { generateInsight, getInsights } from '../api.js';
import { INSIGHT_TYPES, classNames, formatDateTime, insightLabel, timeAgo } from '../utils.js';

const ACTIONS = [
  {
    type: 'daily_summary',
    description: 'Performance du jour, meilleure boutique, alertes et conseil.',
    gradient: 'from-accent/30 via-accent/10 to-transparent',
  },
  {
    type: 'rotation_analysis',
    description: 'Rythme des rotations, ajustement du seuil, anomalies.',
    gradient: 'from-sky-500/25 via-sky-500/5 to-transparent',
  },
  {
    type: 'sales_forecast',
    description: 'Prévision 24 h à partir des ventes des 7 derniers jours.',
    gradient: 'from-emerald-500/25 via-emerald-500/5 to-transparent',
  },
];

const PROMPTS = {
  daily_summary: 'Fais-moi le résumé quotidien de mes boutiques.',
  rotation_analysis: 'Analyse les rotations récentes entre mes boutiques.',
  sales_forecast: 'Quelle est ta prévision de ventes pour les prochaines 24 h ?',
};

function UserBubble({ type, time }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-gradient-to-br from-accent to-accent-dark px-4 py-2.5 text-sm text-white shadow-glow">
        <div>{PROMPTS[type] || insightLabel(type)}</div>
        {time && <div className="mt-1 text-right text-[10px] text-violet-200/70">{time}</div>}
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10">
        <Icon name="user" className="h-4 w-4 text-slate-300" />
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-fuchsia-500 shadow-glow">
      <Icon name="sparkles" className="h-4 w-4 text-white" />
    </div>
  );
}

function BotBubble({ insight, highlight = false }) {
  return (
    <div className="flex gap-3">
      <BotAvatar />
      <div
        className={classNames(
          'min-w-0 max-w-[85%] rounded-2xl rounded-tl-md border px-4 py-3.5',
          highlight ? 'border-accent/30 bg-accent/[0.07]' : 'border-white/[0.06] bg-white/[0.03]',
        )}
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <InsightTypeBadge type={insight.type} />
          <span className="text-[11px] text-slate-500" title={formatDateTime(insight.created_at)}>
            {timeAgo(insight.created_at)}
          </span>
        </div>
        <InsightContent content={insight.content} />
      </div>
    </div>
  );
}

function TypingBubble({ type }) {
  return (
    <div className="flex gap-3">
      <BotAvatar />
      <div className="rounded-2xl rounded-tl-md border border-accent/25 bg-accent/[0.06] px-4 py-3.5">
        <div className="flex items-center gap-3 text-sm text-violet-200">
          <span className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent-light [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent-light [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent-light" />
          </span>
          {insightLabel(type)} en cours…
        </div>
      </div>
    </div>
  );
}

function ErrorBubble({ message, onRetry }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-inset ring-red-500/30">
        <Icon name="alert" className="h-4 w-4 text-red-300" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        <div className="font-medium">La génération a échoué</div>
        <div className="mt-0.5 text-red-300/80">{message}</div>
        <button type="button" onClick={onRetry} className="btn-danger btn-sm mt-3">
          <Icon name="refresh" className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    </div>
  );
}

export default function AI() {
  const { notify } = useOutletContext();
  const [insights, setInsights] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pendingType, setPendingType] = useState(null);
  const [lastRequest, setLastRequest] = useState(null); // { type, at, error?, insightId? }
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const data = await getInsights();
      const list = Array.isArray(data?.insights) ? data.insights : [];
      setInsights(list);
      setAiEnabled(data?.enabled !== false);
      return list;
    } catch (err) {
      notify(err.message, 'error', 'Insights IA');
      return null;
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (type) => {
    if (pendingType) return;
    const at = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setPendingType(type);
    setLastRequest({ type, at });
    try {
      await generateInsight(type);
      const list = await load();
      const latest = list?.find((i) => i.type === type) || list?.[0];
      setLastRequest({ type, at, insightId: latest?.id });
    } catch (err) {
      setLastRequest({ type, at, error: err.message });
    } finally {
      setPendingType(null);
    }
  };

  const current = lastRequest?.insightId ? insights.find((i) => i.id === lastRequest.insightId) : null;
  const featured = current || (!lastRequest ? insights[0] : null);
  const history = insights.filter((i) => i !== featured && (filter === 'all' || i.type === filter));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {!aiEnabled && <AIDisabledNotice />}
      {/* Actions */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ACTIONS.map((a) => {
          const meta = INSIGHT_TYPES[a.type];
          const busy = pendingType === a.type;
          return (
            <button
              key={a.type}
              type="button"
              onClick={() => generate(a.type)}
              disabled={Boolean(pendingType) || !aiEnabled}
              className={classNames(
                'glass group relative overflow-hidden p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
                busy && 'border-accent/50 shadow-glow',
              )}
            >
              <div className={classNames('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition-all duration-200 group-hover:opacity-100', a.gradient)} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10">
                    {busy ? <Spinner className="h-5 w-5 text-accent-light" /> : <Icon name={meta.icon} className="h-5 w-5 text-white" />}
                  </div>
                  <Icon name="arrowRight" className="h-4 w-4 text-slate-500 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white" />
                </div>
                <div className="mt-4 text-base font-semibold text-white">{meta.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">{a.description}</div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Conversation courante */}
      <section className="glass p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Icon name="bot" className="h-4 w-4 text-accent-light" />
          <h2 className="section-title">Assistant</h2>
        </div>

        <div className="space-y-4">
          {loading && insights.length === 0 && !lastRequest ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Spinner className="h-4 w-4" /> Chargement des insights…
            </div>
          ) : (
            <>
              {!lastRequest && !featured && (
                <div className="flex gap-3">
                  <BotAvatar />
                  <div className="rounded-2xl rounded-tl-md border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                    Bonjour ! Choisissez une analyse ci-dessus : je l’établis à partir des données en temps réel de vos boutiques.
                  </div>
                </div>
              )}

              {lastRequest && <UserBubble type={lastRequest.type} time={lastRequest.at} />}
              {pendingType && <TypingBubble type={pendingType} />}
              {!pendingType && lastRequest?.error && (
                <ErrorBubble message={lastRequest.error} onRetry={() => generate(lastRequest.type)} />
              )}
              {!pendingType && featured && (
                <div className="animate-slide-in">
                  <BotBubble insight={featured} highlight />
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Historique */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Insights précédents</h2>
          <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-white/[0.02] p-1">
            {[['all', 'Tous'], ...Object.entries(INSIGHT_TYPES).map(([k, m]) => [k, m.short])].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={classNames(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  filter === key ? 'bg-accent/25 text-white ring-1 ring-inset ring-accent/40' : 'text-slate-400 hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="glass px-6 py-10 text-center text-sm text-slate-500">
            {loading ? 'Chargement…' : 'Aucun insight précédent.'}
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((insight) => (
              <div key={insight.id} className="glass space-y-3 p-5">
                <UserBubble type={insight.type} time={formatDateTime(insight.created_at)} />
                <BotBubble insight={insight} />
              </div>
            ))}
          </div>
        )}
        <p className="text-center text-xs text-slate-600">Les 10 derniers insights sont conservés par le backend.</p>
      </section>
    </div>
  );
}
