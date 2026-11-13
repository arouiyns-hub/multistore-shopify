import { useState } from 'react';
import Icon, { Spinner } from './Icon.jsx';
import { API_URL, checkKey, setApiKey } from '../api.js';

export default function Login({ onLogin, reason }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(reason || null);

  const submit = async (e) => {
    e.preventDefault();
    const value = key.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      await checkKey(value);
      setApiKey(value);
      onLogin();
    } catch (err) {
      setError(err.status === 401 ? 'Clé admin incorrecte.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="glass w-full max-w-sm animate-slide-in p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-fuchsia-500 shadow-glow">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18V6l6 6 6-6v12" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">MultiStore</h1>
            <p className="text-xs text-slate-500">Panel de rotation des boutiques</p>
          </div>
        </div>

        <label className="label" htmlFor="admin-key">Clé admin</label>
        <div className="relative">
          <input
            id="admin-key"
            type={show ? 'text' : 'password'}
            className="input pr-20"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="current-password"
            autoFocus
            spellCheck="false"
            placeholder="Colle ta clé ADMIN_API_KEY"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
          >
            {show ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Gardée uniquement dans ce navigateur.</p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn-primary mt-5 w-full" disabled={!key.trim() || loading}>
          {loading ? <Spinner className="h-4 w-4" /> : <Icon name="arrowRight" className="h-4 w-4" />}
          Se connecter
        </button>
        <p className="mt-4 truncate text-center text-[11px] text-slate-600" title={API_URL}>Serveur : {API_URL}</p>
      </form>
    </div>
  );
}
