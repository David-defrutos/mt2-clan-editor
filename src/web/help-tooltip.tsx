import React, { useId, useState } from 'react';
import {useLanguage} from './i18n';

export function HelpTooltip({ label, text }: { label: string; text: string }) {
  const {t}=useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  return <span className={'help-tooltip' + (open ? ' is-open' : '') + (dismissed ? ' is-dismissed' : '')} onMouseEnter={() => setDismissed(false)}><button type="button" className="help-trigger" aria-label={t("Ayuda: {label}",{label})} aria-describedby={id} onFocus={() => setDismissed(false)} onClick={() => { setOpen(!open); setDismissed(open); }} onBlur={() => { setOpen(false); setDismissed(false); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setDismissed(true); } }}>?</button><span id={id} role="tooltip" className="help-text">{text}</span></span>;
}
