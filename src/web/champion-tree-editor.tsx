import React, { useState } from 'react';
import { post } from './api';
import type { Entry } from './types';

interface TreeChampion { id: string; championIndex: number; owner: Entry; paths: { name: string; levels: { entry?: Entry; reference: unknown }[] }[] }
interface Preview { changed: boolean; file: string; changes: { path: number; level: number; before: unknown; after: string; name: string }[]; warnings: string[] }

export function ChampionTreeEditor({ clanKey, champion, upgrades, onCancel, onSaved }: { clanKey: string; champion: TreeChampion; upgrades: Entry[]; onCancel: () => void; onSaved: (backup?: string) => void }) {
  const initial = champion.paths.map(p => p.levels.map(l => l.entry?.id ?? ''));
  const [chosen, setChosen] = useState(initial);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const counts = new Map<string, number>(); upgrades.forEach(e => counts.set(e.id, (counts.get(e.id) ?? 0) + 1));
  const available = upgrades.filter(e => counts.get(e.id) === 1).sort((a, b) => a.name.localeCompare(b.name));
  const matches = (entry: Entry) => `${entry.name} ${entry.id} ${entry.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const changes = chosen.flatMap((p, path) => p.flatMap((id, level) => id && id !== initial[path][level] ? [{ path, level, upgradeId: id }] : []));
  function select(path: number, level: number, id: string) { setChosen(current => current.map((p, i) => i === path ? p.map((value, j) => j === level ? id : value) : p)); setPreview(null); setError(''); }
  function reset() { setChosen(initial); setPreview(null); setError(''); }
  async function act(save: boolean) {
    setBusy(true); setError('');
    try {
      const payload = { file: champion.owner.file, classId: champion.owner.id, championIndex: champion.championIndex, expectedHash: champion.owner.hash, changes };
      if (save) {
        const result = await post<{ changed: boolean; backup?: string }>(`/clans/${clanKey}/champions/tree/save`, payload);
        onSaved(result.backup);
      } else setPreview(await post<Preview>(`/clans/${clanKey}/champions/tree/preview`, payload));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="champion-tree-editor"><h3>Editar árbol de sendas</h3><p>Selecciona una mejora existente para cada nivel. Se guardan sus referencias en la clase del clan.</p><fieldset disabled={busy}><label>Filtrar catálogo de mejoras<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, ID o archivo…" /></label><p>{available.filter(matches).length} mejoras disponibles. Las que tienen IDs duplicados quedan excluidas.</p>{champion.paths.map((p, path) => <div className="tree-path" key={path}><h4>{p.name}</h4>{p.levels.map((slot, level) => <label key={level}>Nivel {['I', 'II', 'III'][level] ?? level + 1}<select value={chosen[path][level]} onChange={e => select(path, level, e.target.value)}>{!initial[path][level] && <option value="">Conservar referencia actual: {JSON.stringify(slot.reference)}</option>}{available.filter(e => matches(e) || e.id === chosen[path][level] || e.id === initial[path][level]).map(e => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}</select></label>)}</div>)}{champion.paths.length === 0 && <p>Este campeón no tiene un árbol. Puedes definirlo desde «Clase y árbol» en el editor avanzado.</p>}<div className="head-actions"><button className="ghost" onClick={onCancel}>Cancelar</button><button className="secondary" disabled={changes.length === 0} onClick={reset}>Restablecer selección</button><button className="primary" disabled={changes.length === 0} onClick={() => act(false)}>Previsualizar {changes.length} cambios</button></div></fieldset>{error && <div className="notice error" role="alert">{error}</div>}{preview && <div className="tree-preview"><h4>Vista previa · {preview.file}</h4>{preview.changes.map(change => <div className="issue-row" key={`${change.path}:${change.level}`}><b>Senda {change.path + 1} · nivel {change.level + 1}</b><span>{JSON.stringify(change.before)} → {change.after}<small>{change.name}</small></span></div>)}{preview.warnings.length > 0 && <ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}<p>El guardado crea una copia de seguridad del archivo original.</p><button className="primary" disabled={!preview.changed || busy || changes.length === 0} onClick={() => act(true)}>{busy ? 'Guardando…' : 'Guardar árbol de sendas'}</button></div>}</div>;
}
