import React, { useEffect, useState } from 'react';
import { api, post } from './api';
import { ChampionTreeEditor } from './champion-tree-editor';
import type { ClanSnapshot, Entry } from './types';

type Stat = { label: string; value: number | null };
type Upgrade = { level: number; reference: unknown; entry?: Entry; bonuses: Stat[]; warnings: string[] };
type Champion = { id: string; championIndex: number; name: string; owner: Entry; card?: Entry; starter?: Entry; character?: Entry; base: Stat[]; paths: { name: string; levels: Upgrade[] }[]; warnings: string[] };
type Model = { champions: Champion[]; upgrades: Entry[]; maxCombinedLevels: number; maxSelectedPaths: number };
type Preview = { stats: Stat[]; warnings: string[]; upgrades: Entry[] };

export function ChampionsView({ clan, onOpen, onSaved }: { clan: ClanSnapshot; onOpen: (entry: Entry) => void; onSaved: () => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  function saved(backup?: string) { setNotice('Árbol guardado.' + (backup ? ' Copia de seguridad: ' + backup : '')); onSaved(); }
  useEffect(() => {
    let active = true; setModel(null); setError('');
    api<Model>(`/clans/${clan.key}/champions`).then(value => { if (active) setModel(value); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [clan]);
  return <><div className="page-head"><div><div className="eyebrow">ESTRUCTURA</div><h1>Campeones y sendas</h1><p>Compara las bonificaciones de cada nivel y combina sendas. El nivel II sustituye al I de la misma senda.</p></div></div><div className="filters"><input aria-label="Buscar campeón o senda" placeholder="Buscar campeón, ID o senda…" value={query} onChange={e => setQuery(e.target.value)} /><button className="ghost" onClick={() => setQuery('')}>Limpiar</button></div>{notice && <div className="notice success">{notice}</div>}{error && <div className="notice error">{error}</div>}{!model && !error && <p>Cargando campeones…</p>}{model && <><p>{model.champions.length} campeones · hasta {model.maxCombinedLevels} niveles entre {model.maxSelectedPaths} sendas.</p><div className="champion-grid">{model.champions.map((champion, index) => ({ champion, index })).filter(({ champion }) => `${champion.name} ${champion.id} ${champion.paths.flatMap(p => p.levels.map(l => `${l.entry?.name ?? ''} ${l.entry?.id ?? ''}`)).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(({ champion, index }) => <ChampionPanel key={`${champion.owner.file}:${champion.id}:${index}`} champion={champion} index={index} clanKey={clan.key} rules={model} onOpen={onOpen} onSaved={saved} />)}</div>{model.champions.length === 0 && <div className="empty-state">No hay campeones definidos en las clases del clan.</div>}</>}</>;
}

function ChampionPanel({ champion, index, clanKey, rules, onOpen, onSaved }: { champion: Champion; index: number; clanKey: string; rules: Model; onOpen: (entry: Entry) => void; onSaved: (backup?: string) => void }) {
  const [levels, setLevels] = useState<number[]>(champion.paths.map(() => 0));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [editingTree, setEditingTree] = useState(false);
  const valid = levels.reduce((a, b) => a + b, 0) <= rules.maxCombinedLevels && levels.filter(Boolean).length <= rules.maxSelectedPaths;
  useEffect(() => {
    let active = true; setPreview(null); setError('');
    if (valid) post<Preview>(`/clans/${clanKey}/champions/preview`, { champion: index, levels }).then(value => { if (active) setPreview(value); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [levels, champion, clanKey, index, valid]);
  return <section className="panel champion-card"><div className="champion-top"><div className="champion-emblem">♜</div><div><h2>{champion.name}</h2><small>{champion.id}</small></div></div><div className="champion-links">{([['Carta', champion.card], ['Unidad', champion.character], ['Inicial', champion.starter], ['Clase y árbol', champion.owner]] as [string, Entry | undefined][]).map(([label, entry]) => <button className="secondary" key={label} disabled={!entry} onClick={() => entry && onOpen(entry)}>{label}: {entry?.name ?? 'Sin referencia local'} ↗</button>)}</div><button className="secondary full" onClick={() => setEditingTree(value => !value)} aria-expanded={editingTree}>{editingTree ? 'Cerrar editor de árbol' : 'Editar árbol de sendas'}</button>{editingTree && <ChampionTreeEditor clanKey={clanKey} champion={champion} upgrades={rules.upgrades} onCancel={() => setEditingTree(false)} onSaved={onSaved} />}<h3>Valores base</h3><div className="champion-facts">{champion.base.map(stat => <span key={stat.label}>{stat.label}: <b>{stat.value ?? '—'}</b></span>)}</div>{champion.paths.map((path, pathIndex) => <div className="champion-path" key={pathIndex}><h3>{path.name} · {path.levels[0]?.entry?.name ?? 'Sin nombre'}</h3><div className="table-panel"><table><thead><tr><th>Nivel / mejora</th>{champion.base.map(stat => <th key={stat.label}>Δ {stat.label}</th>)}</tr></thead><tbody>{path.levels.map(upgrade => <tr key={upgrade.level}><td><button className="stat-value" disabled={!upgrade.entry} onClick={() => upgrade.entry && onOpen(upgrade.entry)} title={upgrade.warnings.join(' ')}>{['I', 'II', 'III'][upgrade.level - 1] ?? upgrade.level} · {upgrade.entry?.name ?? 'No resuelta'} ↗</button>{upgrade.warnings.length > 0 && <small>Incluye datos sin simular</small>}</td>{upgrade.bonuses.map(stat => <td key={stat.label}>{stat.value === null ? '—' : stat.value > 0 ? `+${stat.value}` : stat.value}</td>)}</tr>)}</tbody></table></div><label>Seleccionar nivel de {path.name}<select value={levels[pathIndex]} onChange={e => setLevels(current => current.map((level, i) => i === pathIndex ? Number(e.target.value) : level))}><option value={0}>Sin mejora</option>{path.levels.map(upgrade => <option key={upgrade.level} value={upgrade.level}>{['I', 'II', 'III'][upgrade.level - 1] ?? upgrade.level} · {upgrade.entry?.name ?? 'No resuelta'}</option>)}</select></label></div>)}<div className="champion-combination"><h3>Bonificaciones combinadas</h3><button className="ghost" onClick={() => setLevels(champion.paths.map(() => 0))}>Restablecer</button><p>Valores base más las mejoras seleccionadas. No incluye efectos de habilidades ni cambios durante el combate.</p>{!valid && <div className="notice error">Selecciona como máximo {rules.maxCombinedLevels} niveles entre {rules.maxSelectedPaths} sendas.</div>}{error && <div className="notice error">{error}</div>}{valid && !preview && !error && <p>Calculando…</p>}{preview && <><div className="champion-facts">{preview.stats.map(stat => <span key={stat.label}>{stat.label}: <b>{stat.value ?? '—'}</b></span>)}</div>{preview.warnings.length > 0 && <details><summary>{preview.warnings.length} avisos sobre el cálculo</summary><ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}</>}</div></section>;
}
