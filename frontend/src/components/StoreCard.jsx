import { useEffect, useRef, useState } from 'react';
import Icon, { Spinner } from './Icon.jsx';
import CopyField from './CopyField.jsx';
import * as api from '../api.js';
import {
  classNames,
  formatDateTime,
  formatMoney,
  formatNumber,
  progressTone,
  revenuePercent,
  storeColor,
  timeAgo,
} from '../utils.js';

export function ProgressBar({ store, height = 'h-2.5' }) {
  const pct = revenuePercent(store);
  const tone = progressTone(pct);
  return (
    <div className={classNames('w-full overflow-hidden rounded-full bg-white/[0.06]', height)}>
      <div
        className={classNames('h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out', tone.bar, pct > 0 && tone.glow)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ThresholdEditor({ store, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(store.threshold_euros));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setValue(String(store.threshold_euros));
  }, [store.threshold_euros, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const parsed = parseFloat(String(value).replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const save = async () => {
    if (!valid) return;
    if (parsed === Number(store.threshold_euros)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(parsed);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 -mx-1.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/[0.06]"
        title="Modifier le seuil"
      >
        {formatMoney(store.threshold_euros)}
        <Icon name="pencil" className="h-3.5 w-3.5 text-slate-500 transition-all duration-200 group-hover:text-accent-light" />
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="relative">
        <input
          ref={inputRef}
          type="number"
          min="1"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          className={classNames('input w-28 py-1 pr-6 text-sm', !valid && 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/30')}
          disabled={saving}
          aria-label="Nouveau seuil en euros"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">€</span>
      </div>
      <button type="submit" className="btn-success btn-sm px-2" disabled={!valid || saving} aria-label="Valider">
        {saving ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" />}
      </button>
      <button type="button" className="btn-ghost btn-sm px-2" onClick={() => setEditing(false)} disabled={saving} aria-label="Annuler">
        <Icon name="x" className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

function Metric({ label, children }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-100 tabular-nums">{children}</div>
    </div>
  );
}

/**
 * Card boutique : progression CA/seuil, statut, actions.
 * @param {object}   props.store
 * @param {Function} props.onChanged    appelé après chaque action réussie (rafraîchit les stats)
 * @param {Function} props.notify       (message, tone, title) => void
 * @param {boolean}  props.detailed     affiche toutes les métriques + édition inline du seuil
 */
export default function StoreCard({ store, onChanged, notify, onEdit, detailed = false }) {
  const [busy, setBusy] = useState(null);
  const active = Boolean(store.is_active) && Boolean(store.is_enabled);
  const enabled = Boolean(store.is_enabled);
  const pct = revenuePercent(store);
  const rawPct = store.threshold_euros > 0 ? (store.current_revenue / store.threshold_euros) * 100 : 0;
  const tone = progressTone(pct);
  const color = storeColor(store.id);
  const remaining = Math.max(0, (store.threshold_euros || 0) - (store.current_revenue || 0));
  const avgBasket = store.total_orders > 0 ? store.total_revenue / store.total_orders : 0;

  const run = async (key, fn, successMsg) => {
    setBusy(key);
    try {
      await fn();
      notify?.(successMsg, 'success', store.name);
      await onChanged?.();
      return true;
    } catch (err) {
      notify?.(err.message, 'error', `Erreur — ${store.name}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleReset = () => {
    if (!window.confirm(`Remettre à zéro le CA courant de « ${store.name} » (${formatMoney(store.current_revenue)}) ?`)) return;
    run('reset', () => api.resetStore(store.id), 'CA courant remis à zéro');
  };

  const handleActivate = () => {
    if (!window.confirm(`Forcer l’activation de « ${store.name} » ? Les clients seront redirigés vers cette boutique.`)) return;
    run('activate', () => api.activateStore(store.id), 'Boutique activée');
  };

  const handleToggle = () => {
    if (enabled && active) {
      const ok = window.confirm(
        `« ${store.name} » est la boutique active. La désactiver fera passer les clients sur la boutique suivante. Continuer ?`,
      );
      if (!ok) return;
    }
    run('toggle', () => api.toggleStore(store.id, !enabled), enabled ? 'Boutique désactivée' : 'Boutique réactivée');
  };

  const handleDelete = () => {
    const ok = window.confirm(
      `Supprimer définitivement « ${store.name} » ?\n\nSes ${store.total_orders || 0} commande(s) et son historique seront effacés. Cette action est irréversible.`,
    );
    if (!ok) return;
    run('delete', () => api.deleteStore(store.id), 'Boutique supprimée');
  };

  const handleThreshold = (threshold) =>
    run('threshold', () => api.updateThreshold(store.id, threshold), `Seuil mis à ${formatMoney(threshold)}`);

  return (
    <div
      className={classNames(
        'glass relative flex flex-col overflow-hidden p-5 transition-all duration-200',
        active ? 'border-accent/40 shadow-glow' : 'hover:border-white/[0.12]',
        !enabled && 'opacity-70',
      )}
    >
      {active && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-light to-transparent" />
      )}

      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={classNames('h-2.5 w-2.5 shrink-0 rounded-full', color.dot)} />
            <h3 className="truncate text-base font-semibold text-white">{store.name}</h3>
          </div>
          <a
            href={`https://${store.shopify_domain}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-xs text-slate-500 transition-all duration-200 hover:text-accent-light"
          >
            {store.shopify_domain}
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
              ACTIVE
            </span>
          ) : (
            <span className="rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-slate-400 ring-1 ring-inset ring-slate-500/25">
              INACTIVE
            </span>
          )}
          {!enabled && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-inset ring-red-500/25">
              Désactivée
            </span>
          )}
        </div>
      </div>

      {/* Progression CA / seuil */}
      <div className="mt-5">
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">CA courant</div>
            <div className="text-xl font-semibold tracking-tight text-white tabular-nums">{formatMoney(store.current_revenue)}</div>
          </div>
          <div className="text-right">
            <div className={classNames('text-sm font-semibold tabular-nums', tone.text)}>{Math.round(rawPct)}%</div>
            <div className="text-xs text-slate-500">
              {detailed ? 'du seuil' : <>sur {formatMoney(store.threshold_euros)}</>}
            </div>
          </div>
        </div>
        <ProgressBar store={store} />
        <div className="mt-1.5 text-xs text-slate-500">
          {remaining > 0 ? <>Encore {formatMoney(remaining)} avant rotation</> : <span className="text-red-300">Seuil atteint</span>}
        </div>
      </div>

      {/* Métriques */}
      {detailed ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Seuil de rotation</div>
            <ThresholdEditor store={store} onSave={handleThreshold} />
          </div>
          <Metric label="CA total">{formatMoney(store.total_revenue)}</Metric>
          <Metric label="Commandes">{formatNumber(store.total_orders)}</Metric>
          <Metric label="Panier moyen">{formatMoney(avgBasket)}</Metric>
          <Metric label="Dernier reset">
            <span title={formatDateTime(store.reset_at)}>{timeAgo(store.reset_at)}</span>
          </Metric>
          <CopyField
            className="col-span-2 mt-1"
            label="URL du webhook (Shopify → Commande payée)"
            value={api.webhookUrl(store.id)}
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="CA total">{formatMoney(store.total_revenue)}</Metric>
          <Metric label="Commandes">{formatNumber(store.total_orders)}</Metric>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.05] pt-4">
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={handleActivate}
          disabled={active || !enabled || busy !== null}
          title={!enabled ? 'Réactivez la boutique avant de l’activer' : active ? 'Déjà active' : 'Forcer l’activation'}
        >
          {busy === 'activate' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="play" className="h-3.5 w-3.5" />}
          Activer
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={handleReset} disabled={busy !== null}>
          {busy === 'reset' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="reset" className="h-3.5 w-3.5" />}
          Reset
        </button>
        {detailed && onEdit && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onEdit(store)} disabled={busy !== null}>
            <Icon name="pencil" className="h-3.5 w-3.5" />
            Modifier
          </button>
        )}
        {detailed && (
          <button
            type="button"
            className="btn-ghost btn-sm text-red-300 hover:text-red-200"
            onClick={handleDelete}
            disabled={busy !== null}
            aria-label="Supprimer la boutique"
            title="Supprimer la boutique"
          >
            {busy === 'delete' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="trash" className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          type="button"
          className={classNames(enabled ? 'btn-danger' : 'btn-success', 'btn-sm ml-auto')}
          onClick={handleToggle}
          disabled={busy !== null}
        >
          {busy === 'toggle' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="power" className="h-3.5 w-3.5" />}
          {enabled ? 'Désactiver' : 'Réactiver'}
        </button>
      </div>
    </div>
  );
}
