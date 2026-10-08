import React, { useEffect, useState } from 'react';
import { api } from './api';
import {useLanguage} from './i18n';
import {metricLabel,statisticValue as valueOf,statisticsCsv} from './statistics-export';
import type { ClanStats, StatsItem } from './types';

type Metric = { id: string; label: string };

export function StatsView({ stats, metrics, maxLevel, onOpen, onInspect }: { stats: ClanStats[]; metrics: Metric[]; maxLevel: number; onOpen: (key: string) => void; onInspect: (key: string, item: StatsItem) => void }) {
 const {t}=useLanguage();
  const [selected, setSelected] = useState<{ key: string; clan: string; metric: Metric; returnTo: HTMLButtonElement } | null>(null);
  function close() { const previous = selected?.returnTo; setSelected(null); requestAnimationFrame(() => previous?.focus()); }
  const rows = [...metrics,
    ...Array.from(new Set([...Array.from({ length: maxLevel + 1 }, (_, level) => String(level)), ...stats.flatMap(s => Object.keys(s.unlocks ?? {}))])).sort((a, b) => Number(a) - Number(b)).map(level => ({ id: `unlocks.${level}`, label: `Desbloqueo nivel ${level}` })),
    ...Array.from(new Set(stats.flatMap(s => Object.keys(s.costs ?? {})))).sort((a, b) => Number(a) - Number(b)).map(cost => ({ id: `costs.${cost}`, label: `Ember ${cost}` }))];
  function exportCsv() {
    const csv = statisticsCsv(stats,rows,t);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = t('clanes-estadisticas.csv'); anchor.click(); URL.revokeObjectURL(url);
  }
  return <><div className="page-head"><div><div className="eyebrow">{t("VISTA GLOBAL")}</div><h1>{t("Comparar clanes")}</h1><p>{t("Pulsa una cifra para ver qué objetos cuenta. Las rarezas, costes y desbloqueos se calculan sobre cartas obtenibles en draft.")}</p></div><button className="secondary" onClick={exportCsv}>{t("Exportar CSV")}</button></div>{stats.length === 0 ? <div className="empty-state">{t("Añade clanes a la biblioteca para compararlos.")}</div> : <div className="panel comparison"><table><thead><tr><th>{t("Métrica")}</th>{stats.map(s => <th key={s.key}><button onClick={() => onOpen(s.key)}>{s.name} ↗</button>{s.error && <small>{s.error}</small>}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><th>{metricLabel(row,t)}</th>{stats.map(s => <td key={s.key}>{s.error ? '—' : <button className="stat-value" title={t("Ver {metric}: {clan}",{metric:metricLabel(row,t),clan:s.name})} onClick={event => setSelected({ key: s.key, clan: s.name, metric: row, returnTo: event.currentTarget })}>{valueOf(s, row.id)}</button>}</td>)}</tr>)}</tbody></table></div>}{selected && <StatsBreakdown key={selected.key + selected.metric.id} selected={selected} onClose={close} onInspect={item => { onInspect(selected.key, item); setSelected(null); }} />}</>;
}

function StatsBreakdown({ selected, onClose, onInspect }: { selected: { key: string; clan: string; metric: Metric }; onClose: () => void; onInspect: (item: StatsItem) => void }) {
 const {t}=useLanguage();
  const [result, setResult] = useState<{ value: number | null; sample: boolean; items: StatsItem[] } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    api<{ value: number | null; sample: boolean; items: StatsItem[] }>(`/clans/${selected.key}/stats?metric=${encodeURIComponent(selected.metric.id)}`).then(value => { if (active) setResult(value); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [selected.key, selected.metric.id]);
  const items = result?.items.filter(item => `${item.name} ${item.id ?? ''} ${item.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="stat-detail-title" onClick={e => e.stopPropagation()} onKeyDown={keyboard}><button className="close" autoFocus aria-label={t("Cerrar desglose")} onClick={onClose}>×</button><h2 id="stat-detail-title">{metricLabel(selected.metric,t)} · {selected.clan}</h2>{error && <div className="notice error">{t(error)}</div>}{!result && !error && <p>{t("Cargando desglose…")}</p>}{result && <><p>{t("Valor actual:")} <b>{result.value ?? '—'}</b>. {result.sample ? t("Muestra: {count} unidades. La mediana promedia los dos valores centrales si la muestra tiene tamaño par.",{count:result.items.length}) : t("{count} resultados.",{count:result.items.length})}</p><input aria-label={t("Filtrar desglose")} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Filtrar por nombre, ID o archivo…")} /><p>{t("{visible} de {total} resultados",{visible:items.length,total:result.items.length})}</p><div className="scroll-list">{items.map((item, index) => item.section && item.id ? <button className="link-row" key={index} onClick={() => onInspect(item)}><span>{item.name}<small>{item.section} · {item.id} · {item.file}</small></span><span>{item.value ?? t('Abrir')} →</span></button> : <div className="link-row" key={index}><span>{item.name}<small>{item.file}</small></span></div>)}</div>{items.length === 0 && <p className="muted">{t("Ningún resultado coincide.")}</p>}</>}</div></div>;
}
