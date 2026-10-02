import React, { useEffect, useState } from 'react';
import { api, post } from './api';
import type { ClanSnapshot, Entry } from './types';
type Character = { id: string; name: string; attack?: number; health?: number; size?: number };
type Use = { section: string; id: string; file: string; name: string };
type Model = { supported: boolean; reason?: string; hash: string; fields: { path: string; label: string; optional: boolean; current?: unknown; currentId?: string }[]; candidates: Character[]; uses: Use[] };
type Preview = { changed: boolean; label: string; before?: unknown; after?: unknown; uses: Use[]; token: string };
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as Record<string, unknown>; if (object.mod_reference) return; value = object.id; }
  return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : undefined;
}
export function SpawnPicker({ clan, entry, onSaved }: { clan: ClanSnapshot; entry: Entry; onSaved: () => void }) {
  const [effectId, setEffectId] = useState(''); const [model, setModel] = useState<Model>();
  const [field, setField] = useState(''); const [selected, setSelected] = useState(''); const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Preview>(); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [effectNames, setEffectNames] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (entry.section === 'cards') api<{ effectNames: string[] }>('/spawn-rules').then(rules => { if (active) setEffectNames(rules.effectNames); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [entry.section]);
  const references = new Set(Array.isArray(entry.data.effects) ? entry.data.effects.map(ref).filter(Boolean) : []);
  const localEffects = clan.entries.filter(item => item.section === 'effects');
  const effects = entry.section === 'effects' ? [entry] : localEffects.filter(item => references.has(item.id) && effectNames.includes(String(typeof item.data.name === 'string' ? item.data.name : (item.data.name as Record<string, unknown> | undefined)?.id)) && localEffects.filter(other => other.id === item.id).length === 1);
  const effect = effects.find(effect => effect.id === effectId) ?? effects[0];
  useEffect(() => { setEffectId(''); setNotice(''); }, [entry.id, entry.file]);
  useEffect(() => {
    let active = true; setModel(undefined); setPreview(undefined); setError(''); setQuery('');
    if (!effect || !['cards', 'effects'].includes(entry.section)) return;
    api<Model>(`/clans/${clan.key}/spawn-assignment?file=${encodeURIComponent(effect.file)}&id=${encodeURIComponent(effect.id)}`).then(value => {
      if (active) { setModel(value); setField(value.fields[0]?.path ?? ''); setSelected(value.fields[0]?.currentId ?? ''); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [clan.key, entry.section, effect?.id, effect?.file, effect?.hash]);
  if (!['cards', 'effects'].includes(entry.section) || !effect) return null;
  const activeField = model?.fields.find(item => item.path === field);
  const character = model?.candidates.find(character => character.id === selected);
  const candidates = model?.candidates.filter(character => character.id === selected || `${character.name} ${character.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  async function act(save: boolean) {
    if (!effect || !model) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const input = { file: effect.file, id: effect.id, field, characterId: selected || null, expectedHash: model.hash, expectedToken: save ? preview?.token : undefined };
      if (save) { await post(`/clans/${clan.key}/spawn-assignment/save`, input); setPreview(undefined); setNotice('Invocación actualizada con copia de seguridad.'); onSaved(); }
      else setPreview(await post<Preview>(`/clans/${clan.key}/spawn-assignment/preview`, input));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <details className="spawn-picker"><summary>Unidad invocada · asignación guiada</summary><p>Modifica el efecto de invocación existente. Las cartas que comparten ese efecto recibirán el mismo cambio.</p><fieldset disabled={busy}>{effects.length > 1 && <label>Efecto<select value={effect.id} onChange={e => { setEffectId(e.target.value); setPreview(undefined); }}>{effects.map(effect => <option key={effect.file + effect.id} value={effect.id}>{effect.id}</option>)}</select></label>}<small>{effect.id} · {effect.file}</small>{error && <div className="notice error" role="alert">{error}</div>}{notice && <p className="success-block" role="status">{notice}</p>}{model && !model.supported && <p className="muted">{model.reason}</p>}{model?.supported && <><label>Unidad que se asigna<select value={field} onChange={e => { setField(e.target.value); setSelected(model.fields.find(field => field.path === e.target.value)?.currentId ?? ''); setPreview(undefined); }}>{model.fields.map(field => <option key={field.path} value={field.path}>{field.label}</option>)}</select></label><small>Referencia actual: {JSON.stringify(activeField?.current ?? 'Sin asignar')}</small><label>Buscar unidad<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre o ID…" /></label><label>Personaje<select value={character ? selected : ''} onChange={e => { setSelected(e.target.value); setPreview(undefined); }}><option value="" disabled={!activeField?.optional}>{activeField?.optional ? 'Sin unidad adicional' : 'Seleccionar unidad local…'}</option>{candidates.map(character => <option key={character.id} value={character.id}>{character.name === character.id ? character.name : `${character.name} · ${character.id}`}</option>)}</select></label>{character && <p>Ataque {character.attack ?? '—'} · Salud {character.health ?? '—'} · Tamaño {character.size ?? '—'}</p>}<details open><summary>Usos directos de este efecto ({model.uses.length})</summary>{model.uses.map(use => <p key={use.section + use.file + use.id}>{use.section} · {use.name}</p>)}<small>Las referencias de C# personalizado no se pueden detectar aquí.</small></details><button className="secondary full" disabled={!character && (!activeField?.optional || Boolean(selected))} onClick={() => act(false)}>Previsualizar invocación</button>{preview && <div className="preview"><p>{preview.label}: {JSON.stringify(preview.before ?? 'Sin asignar')} → {JSON.stringify(preview.after ?? 'Sin asignar')}</p><p>{preview.uses.length} usos directos del efecto. Se conservan las estadísticas y el arte de los personajes.</p><button className="primary full" disabled={!preview.changed} onClick={() => act(true)}>Guardar invocación con respaldo</button></div>}</>}</fieldset></details>;
}
