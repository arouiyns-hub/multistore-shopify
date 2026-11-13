import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { classNames } from '../utils.js';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export default function CopyField({ label, value, hint, className = '' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className={classNames('min-w-0', className)}>
      {label && <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{label}</div>}
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/30 py-1 pl-3 pr-1">
        <code className="min-w-0 flex-1 truncate text-xs text-violet-200" title={value}>
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className={classNames('btn-sm btn shrink-0', copied ? 'text-emerald-300' : 'text-slate-400 hover:text-white')}
          aria-label={`Copier ${label || 'le lien'}`}
        >
          <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
