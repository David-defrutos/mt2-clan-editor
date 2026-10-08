import {useLanguage} from './i18n';
import React, { useState } from 'react';
import { post } from './api';
import type { Entry } from './types';

interface TreeChampion { id: string; championIndex: number; owner: Entry; paths: { name: string; levels: { entry?: Entry; reference: unknown }[] }[] }
interface Preview { changed: boolean; file: string; changes: { path: number; level: number; before: unknown; after: unknown; name: string }[]; warnings: string[] }

export function ChampionTreeEditor({ clanKey, champion, upgrades, limits, onCancel, onSaved }: { clanKey: string; champion: TreeChampion; upgrades: Entry[]; limits:{maxPaths:number;maxLevels:number}; onCancel: () => void; onSaved: (backup?: string) => void }) {
 const {t}=useLanguage();
  const initial = champion.paths.map(p => p.levels.map(l => l.entry?.id ?? ''));
  const [chosen, setChosen] = useState(initial);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseUpgrade,setBaseUpgrade]=useState('');
  const [structure,setStructure]=useState<{operation:string;path:number;upgradeId?:string}>();
  const counts = new Map<string, number>(); upgrades.forEach(e => counts.set(e.id, (counts.get(e.id) ?? 0) + 1));
  const available = upgrades.filter(e => counts.get(e.id) === 1).sort((a, b) => a.name.localeCompare(b.name));
  const matches = (entry: Entry) => `${entry.name} ${entry.id} ${entry.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const changes = chosen.flatMap((p, path) => p.flatMap((id, level) => id && id !== initial[path][level] ? [{ path, level, upgradeId: id }] : []));
  function select(path: number, level: number, id: string) { setChosen(current => current.map((p, i) => i === path ? p.map((value, j) => j === level ? id : value) : p)); setPreview(null); setStructure(undefined); setError(''); }
  function reset() { setChosen(initial); setPreview(null); setError(''); }
  async function act(save: boolean, operation?: {operation:string;path:number;upgradeId?:string}) {
    setBusy(true); setError('');
    try {
      const payload = { file: champion.owner.file, classId: champion.owner.id, championIndex: champion.championIndex, expectedHash: champion.owner.hash, changes: operation || (save && structure) ? [] : changes, structure: save ? structure : operation };
      if (save) {
        const result = await post<{ changed: boolean; backup?: string }>(`/clans/${clanKey}/champions/tree/save`, payload);
        onSaved(result.backup);
      } else {setPreview(await post<Preview>(`/clans/${clanKey}/champions/tree/preview`, payload));setStructure(operation);}
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="champion-tree-editor"><h3>{t("Editar árbol de sendas")}</h3><p>{t("Selecciona una mejora existente para cada nivel. Se guardan sus referencias en la clase del clan.")}</p><fieldset disabled={busy}><label>{t("Filtrar catálogo de mejoras")}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Nombre, ID o archivo…")} /></label><p>{t("{count} mejoras disponibles. Las que tienen IDs duplicados quedan excluidas.",{count:available.filter(matches).length})}</p>{champion.paths.map((p, path) => <div className="tree-path" key={path}><h4>{t("Senda {index}",{index:path+1})}</h4>{p.levels.map((slot, level) => <label key={level}>{t("Nivel {level}",{level:["I","II","III"][level]??level+1})}<select value={chosen[path][level]} onChange={e => select(path, level, e.target.value)}>{!initial[path][level] && <option value="">{t("Conservar referencia actual: {reference}",{reference:JSON.stringify(slot.reference)??"—"})}</option>}{available.filter(e => matches(e) || e.id === chosen[path][level] || e.id === initial[path][level]).map(e => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}</select></label>)}</div>)}{champion.paths.length === 0 && <p>{t("Este campeón no tiene un árbol. Puedes definirlo desde «Clase y árbol» en el editor avanzado.")}</p>}<div className="head-actions"><button className="ghost" onClick={onCancel}>{t("Cancelar")}</button><button className="secondary" disabled={changes.length === 0} onClick={reset}>{t("Restablecer selección")}</button><button className="primary" disabled={changes.length === 0} onClick={() => act(false)}>{t("Previsualizar {count} cambios",{count:changes.length})}</button></div></fieldset><details><summary>{t("Añadir o retirar sendas y niveles")}</summary><p>{t("Guarda o descarta las asignaciones pendientes antes de cambiar la estructura. Una senda nueva empieza con la mejora elegida en cada nivel; después puedes personalizarlos.")}</p><label>{t("Mejora inicial")}<select value={baseUpgrade} onChange={e=>{setBaseUpgrade(e.target.value);setPreview(null);setStructure(undefined);}}><option value="">{t("Selecciona una mejora")}</option>{available.map(e=><option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}</select></label><button disabled={busy||changes.length>0||!baseUpgrade||champion.paths.length>=limits.maxPaths} onClick={()=>act(false,{operation:'add-path',path:champion.paths.length,upgradeId:baseUpgrade})}>{t("Añadir senda")}</button>{champion.paths.map((p,i)=><div key={i}><b>{t("Senda {index}",{index:i+1})}</b><div className="head-actions"><button disabled={busy||changes.length>0||!baseUpgrade||p.levels.length>=limits.maxLevels} onClick={()=>act(false,{operation:'add-level',path:i,upgradeId:baseUpgrade})}>{t("Añadir nivel")}</button><button disabled={busy||changes.length>0||!p.levels.length} onClick={()=>act(false,{operation:'remove-level',path:i})}>{t("Retirar último nivel")}</button><button disabled={busy||changes.length>0} onClick={()=>act(false,{operation:'remove-path',path:i})}>{t("Retirar senda")}</button></div></div>)}</details>{error && <div className="notice error" role="alert">{t(error)}</div>}{preview && <div className="tree-preview"><h4>{t("Vista previa · {file}",{file:preview.file})}</h4>{preview.changes.map(change => <div className="issue-row" key={`${change.path}:${change.level}`}><b>{t("Senda {path} · nivel {level}",{path:change.path+1,level:change.level+1})}</b><span>{JSON.stringify(change.before)} → {JSON.stringify(change.after)}<small>{change.name}</small></span></div>)}{preview.warnings.length > 0 && <ul>{preview.warnings.map((warning, i) => <li key={i}>{t(warning)}</li>)}</ul>}<p>{t("El guardado crea una copia de seguridad del archivo original.")}</p><button className="primary" disabled={!preview.changed || busy || (!structure && changes.length === 0)} onClick={() => act(true)}>{t(busy ? 'Guardando…' : 'Guardar árbol de sendas')}</button></div>}</div>;
}
