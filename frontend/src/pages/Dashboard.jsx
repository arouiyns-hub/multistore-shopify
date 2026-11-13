import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import KPICard from '../components/KPICard.jsx';
import StoreCard, { ProgressBar } from '../components/StoreCard.jsx';
import OrderFeed from '../components/OrderFeed.jsx';
import RotateButton from '../components/RotateButton.jsx';
import AIInsight from '../components/AIInsight.jsx';
import Icon from '../components/Icon.jsx';
import { generateInsight, getInsights } from '../api.js';
import { formatMoney, formatNumber, isToday, revenuePercent, storeColor, timeAgo } from '../utils.js';

export default function Dashboard() {
  const { stats, refresh, notify, freshOrderIds, ws } = useOutletContext();
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const stores = stats?.stores || [];
  const orders = stats?.recentOrders || [];
  const rotations = stats?.rotations || [];
  const activeStore = stores.find((s) => s.is_active && s.is_enabled) || null;

  const rotationsToday = useMemo(() => rotations.filter((r) => isToday(r.created_at)), [rotations]);
  const ordersToday = useMemo(() => orders.filter((o) => isToday(o.created_at)), [orders]);
  const revenueToday = ordersToday.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
  const enabledCount = stores.filter((s) => s.is_enabled).length;
  const avgBasket = stats?.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

  const loadInsights = useCallback(async () => {
    try {
      const data = await getInsights();
      setInsights(Array.isArray(data) ? data : []);
    } catch (err) {
      notify(err.message, 'error', 'Insights IA');
    } finally {
      setInsightsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handleGenerate = async (type) => {
    setGenerating(true);
    try {
      await generateInsight(type);
      await loadInsights();
      notify('Nouvel insight disponible', 'info', 'Assistant IA');
    } catch (err) {
      notify(err.message, 'error', 'Génération IA impossible');
    } finally {
      setGenerating(false);
    }
  };

  const maxStoreRevenue = Math.max(1, ...stores.map((s) => Number(s.total_revenue) || 0));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="CA total"
          value={formatMoney(stats?.totalRevenue)}
          sub={`${formatMoney(revenueToday)} aujourd’hui`}
          icon="euro"
          accent="violet"
        />
        <KPICard
          label="Commandes totales"
          value={formatNumber(stats?.totalOrders)}
          sub={`${ordersToday.length} aujourd’hui · panier moyen ${formatMoney(avgBasket)}`}
          icon="bag"
          accent="emerald"
        />
        <KPICard
          label="Boutique active"
          value={activeStore ? activeStore.name : 'Aucune'}
          sub={
            activeStore
              ? `${formatMoney(activeStore.current_revenue)} / ${formatMoney(activeStore.threshold_euros)}`
              : 'Aucune redirection possible'
          }
          icon="store"
          accent="sky"
        >
          {activeStore && <ProgressBar store={activeStore} height="h-1.5" />}
        </KPICard>
        <KPICard
          label="Rotations du jour"
          value={formatNumber(rotationsToday.length)}
          sub={rotations[0] ? `Dernière ${timeAgo(rotations[0].created_at)}` : 'Aucune rotation enregistrée'}
          icon="rotate"
          accent="amber"
        />
      </section>

      {/* Boutiques + feed */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Boutiques</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {stores.length} boutique{stores.length > 1 ? 's' : ''} · {enabledCount} en rotation
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/stores" className="btn-ghost">
                <Icon name="plus" className="h-4 w-4" /> Ajouter
              </Link>
              <RotateButton activeStore={activeStore} onRotated={refresh} notify={notify} />
            </div>
          </div>

          {stores.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Icon name="store" className="h-10 w-10 text-slate-600" />
              <div className="text-sm text-slate-400">Aucune boutique configurée.</div>
              <Link to="/stores" className="btn-primary">
                <Icon name="plus" className="h-4 w-4" /> Ajouter une boutique
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {stores.map((store) => (
                <StoreCard key={store.id} store={store} onChanged={refresh} notify={notify} />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 content-start gap-6 lg:grid-cols-2 xl:grid-cols-1">
          <div className="h-[480px]">
            <OrderFeed orders={orders} freshIds={freshOrderIds} wsStatus={ws.status} />
          </div>

          {/* Répartition du CA total par boutique (barres CSS) */}
          {stores.length > 0 && (
            <div className="glass p-5">
              <h2 className="section-title">Répartition du CA</h2>
              <div className="mt-4 space-y-3">
                {[...stores]
                  .sort((a, b) => b.total_revenue - a.total_revenue)
                  .map((s) => {
                    const share = stats.totalRevenue > 0 ? (s.total_revenue / stats.totalRevenue) * 100 : 0;
                    return (
                      <div key={s.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-2 text-slate-300">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${storeColor(s.id).dot}`} />
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-400">
                            {formatMoney(s.total_revenue)} · {Math.round(share)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent to-fuchsia-400 transition-all duration-700"
                            style={{ width: `${(s.total_revenue / maxStoreRevenue) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
              {activeStore && revenuePercent(activeStore) > 90 && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  <Icon name="alert" className="h-4 w-4 shrink-0 text-red-400" />
                  {activeStore.name} est à plus de 90 % de son seuil : rotation imminente.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* IA */}
      <section>
        <AIInsight
          insight={insights[0] || null}
          onGenerate={handleGenerate}
          generating={generating}
          loading={insightsLoading}
        />
      </section>
    </div>
  );
}
