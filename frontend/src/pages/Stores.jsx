import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import StoreCard from '../components/StoreCard.jsx';
import RotateButton from '../components/RotateButton.jsx';
import Icon, { Spinner } from '../components/Icon.jsx';
import { createStore } from '../api.js';
import { classNames, formatMoney } from '../utils.js';

const EMPTY_FORM = { name: '', shopifyDomain: '', shopifyToken: '', thresholdEuros: '250' };

function normalizeDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

function AddStoreForm({ onCreated, notify, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showToken, setShowToken] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const domain = normalizeDomain(form.shopifyDomain);
  const threshold = parseFloat(String(form.thresholdEuros).replace(',', '.'));
  const domainValid = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain);
  const thresholdValid = Number.isFinite(threshold) && threshold > 0;
  const valid = form.name.trim() && domainValid && form.shopifyToken.trim() && thresholdValid;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const store = await createStore({
        name: form.name.trim(),
        shopifyDomain: domain,
        shopifyToken: form.shopifyToken.trim(),
        thresholdEuros: threshold,
      });
      notify(`« ${store?.name || form.name} » ajoutée`, 'success', 'Nouvelle boutique');
      setForm(EMPTY_FORM);
      await onCreated();
    } catch (err) {
      const msg = /UNIQUE/i.test(err.message) ? 'Ce domaine Shopify est déjà enregistré.' : err.message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass animate-slide-in p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Ajouter une boutique</h2>
          <p className="text-xs text-slate-500">
            Webhook Shopify à configurer ensuite : <code className="text-violet-300">/webhooks/&lt;id&gt;/orders/paid</code>
          </p>
        </div>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm" aria-label="Fermer">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="store-name">Nom</label>
          <input id="store-name" className="input" placeholder="Boutique A" value={form.name} onChange={set('name')} required />
        </div>
        <div>
          <label className="label" htmlFor="store-domain">Domaine Shopify</label>
          <input
            id="store-domain"
            className={classNames('input', form.shopifyDomain && !domainValid && 'border-red-500/60')}
            placeholder="mon-shop.myshopify.com"
            value={form.shopifyDomain}
            onChange={set('shopifyDomain')}
            autoComplete="off"
            spellCheck="false"
            required
          />
          {form.shopifyDomain && !domainValid && (
            <p className="mt-1 text-xs text-red-300">Domaine invalide (ex. mon-shop.myshopify.com)</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="store-token">Secret webhook / token Shopify</label>
          <div className="relative">
            <input
              id="store-token"
              type={showToken ? 'text' : 'password'}
              className="input pr-20"
              placeholder="shpss_…"
              value={form.shopifyToken}
              onChange={set('shopifyToken')}
              autoComplete="off"
              spellCheck="false"
              required
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
            >
              {showToken ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Utilisé pour vérifier la signature HMAC des webhooks.</p>
        </div>
        <div>
          <label className="label" htmlFor="store-threshold">Seuil de rotation (€)</label>
          <input
            id="store-threshold"
            type="number"
            min="1"
            step="0.01"
            className={classNames('input', !thresholdValid && 'border-red-500/60')}
            value={form.thresholdEuros}
            onChange={set('thresholdEuros')}
            required
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <Icon name="alert" className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={!valid || submitting}>
          {submitting ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />}
          Ajouter la boutique
        </button>
      </div>
    </form>
  );
}

function SummaryItem({ label, value, tone = 'text-white' }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={classNames('mt-0.5 truncate text-lg font-semibold tabular-nums', tone)}>{value}</div>
    </div>
  );
}

export default function Stores() {
  const { stats, refresh, notify } = useOutletContext();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');

  const stores = stats?.stores || [];
  const activeStore = stores.find((s) => s.is_active && s.is_enabled) || null;

  const summary = useMemo(() => {
    const enabled = stores.filter((s) => s.is_enabled);
    const currentSum = stores.reduce((sum, s) => sum + (Number(s.current_revenue) || 0), 0);
    const thresholdSum = enabled.reduce((sum, s) => sum + (Number(s.threshold_euros) || 0), 0);
    const avgThreshold = stores.length ? stores.reduce((sum, s) => sum + (Number(s.threshold_euros) || 0), 0) / stores.length : 0;
    return {
      enabled: enabled.length,
      disabled: stores.length - enabled.length,
      currentSum,
      capacityLeft: Math.max(0, thresholdSum - enabled.reduce((sum, s) => sum + (Number(s.current_revenue) || 0), 0)),
      avgThreshold,
    };
  }, [stores]);

  const filtered = stores.filter((s) => {
    if (filter === 'enabled') return s.is_enabled;
    if (filter === 'disabled') return !s.is_enabled;
    return true;
  });

  const FILTERS = [
    { key: 'all', label: `Toutes (${stores.length})` },
    { key: 'enabled', label: `En rotation (${summary.enabled})` },
    { key: 'disabled', label: `Désactivées (${summary.disabled})` },
  ];

  return (
    <div className="space-y-6">
      <div className="glass grid grid-cols-2 gap-4 p-5 md:grid-cols-5">
        <SummaryItem label="Boutiques" value={stores.length} />
        <SummaryItem label="En rotation" value={summary.enabled} tone="text-emerald-300" />
        <SummaryItem label="CA courant cumulé" value={formatMoney(summary.currentSum)} />
        <SummaryItem label="Capacité restante" value={formatMoney(summary.capacityLeft)} tone="text-violet-200" />
        <SummaryItem label="Seuil moyen" value={formatMoney(summary.avgThreshold)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={classNames(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                filter === f.key ? 'bg-accent/25 text-white ring-1 ring-inset ring-accent/40' : 'text-slate-400 hover:text-white',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <RotateButton activeStore={activeStore} onRotated={refresh} notify={notify} variant="ghost" />
          {!showForm && (
            <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
              <Icon name="plus" className="h-4 w-4" /> Ajouter une boutique
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <AddStoreForm
          notify={notify}
          onCancel={() => setShowForm(false)}
          onCreated={async () => {
            await refresh();
            setShowForm(false);
          }}
        />
      )}

      {filtered.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 px-6 py-14 text-center text-sm text-slate-400">
          <Icon name="store" className="h-10 w-10 text-slate-600" />
          {stores.length === 0 ? 'Aucune boutique. Ajoutez votre première boutique Shopify.' : 'Aucune boutique dans ce filtre.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((store) => (
            <StoreCard key={store.id} store={store} onChanged={refresh} notify={notify} detailed />
          ))}
        </div>
      )}
    </div>
  );
}
