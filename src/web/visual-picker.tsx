import React, { useEffect, useState } from 'react';
import { api, post } from './api';
import { VisualCopy } from './visual-copy';
import type { ClanSnapshot, Entry } from './types';
type Candidate = { id: string; name: string; image?: string; width?: number; height?: number; uses: { section: string; name: string; id: string; file: string }[] };
type Slot = { path: string; label: string; candidates: Candidate[] };
type Preview = { changed: boolean; before: unknown; after: unknown; resource: Candidate };
function ref(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as Record<string, unknown>; if (object.mod_reference) return ''; value = object.id; }
  return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : '';
}
export function VisualPicker({ clan, entry, onSaved }: { clan: ClanSnapshot; entry: Entry; onSaved: () => void }) {
  const [slots, setSlots] = useState<Slot[]>([]); const [field, setField] = useState('');
  const [selected, setSelected] = useState(''); const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Preview>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setSlots([]); setPreview(undefined); setError(''); setSelected(''); setQuery('');
    if (!['cards', 'characters'].includes(entry.section)) return;
    api<Slot[]>(`/clans/${clan.key}/visual-assignments?section=${encodeURIComponent(entry.section)}`).then(value => {
      if (!active) return; setSlots(value); setField(value[0]?.path ?? ''); setSelected(ref(entry.data[value[0]?.path ?? '']));
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [clan.key, entry.section, entry.id, entry.file, entry.hash]);
  if (!['cards', 'characters'].includes(entry.section)) return null;
  const slot = slots.find(slot => slot.path === field);
  const resource = slot?.candidates.find(candidate => candidate.id === selected);
  const filtered = slot?.candidates.filter(candidate => candidate.id === selected || `${candidate.id} ${candidate.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  async function act(save: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      const input = { section: entry.section, file: entry.file, id: entry.id, field, targetId: selected, expectedHash: entry.hash };
      if (save) { await post(`/clans/${clan.key}/visual-assignments/save`, input); setPreview(undefined); setNotice('Arte asignado. Se guardó una copia de seguridad del JSON.'); onSaved(); }
      else setPreview(await post<Preview>(`/clans/${clan.key}/visual-assignments/preview`, input));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="visual-picker"><h3>Asignar arte existente</h3><p>Selecciona un recurso del catálogo del clan y revisa sus usos antes de guardar.</p>{error && <div className="notice error" role="alert">{error}</div>}{notice && <p className="success-block" role="status">{notice}</p>}{slot && <fieldset disabled={busy}>{slots.length > 1 && <label>Tipo de recurso<select value={field} onChange={e => { setField(e.target.value); setSelected(ref(entry.data[e.target.value])); setPreview(undefined); }}>{slots.map(slot => <option key={slot.path} value={slot.path}>{slot.label}</option>)}</select></label>}<small>Referencia actual: {JSON.stringify(entry.data[slot.path] ?? 'Sin asignar')}</small><label>Buscar arte<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre o ID…" /></label><label>{slot.label}<select value={resource ? selected : ''} onChange={e => { setSelected(e.target.value); setPreview(undefined); }}><option value="" disabled>Selecciona un recurso local</option>{filtered.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name === candidate.id ? candidate.name : `${candidate.name} · ${candidate.id}`}</option>)}</select></label>{resource && <><div className="visual-assignment-image">{resource.image ? <img src={`/api/assets/${clan.key}?file=${encodeURIComponent(resource.image)}`} alt={`Arte de ${resource.name}`} /> : <p>Imagen no disponible: revisa el sprite o sus animaciones en Recursos visuales.</p>}</div><small>{resource.width ?? '?'} × {resource.height ?? '?'} px · {resource.uses.length} usos actuales</small><details><summary>Objetos que comparten este arte</summary>{resource.uses.map(use => <p key={use.section + use.file + use.id}>{use.section} · {use.name}</p>)}<p>Editar después este recurso compartido afecta a todos sus usuarios.</p></details><VisualCopy clan={clan} entry={entry} field={field} sourceId={resource.id} onSaved={onSaved} onBusy={setBusy} /></>}<button className="secondary full" disabled={!resource} onClick={() => act(false)}>Previsualizar asignación</button>{preview && <div className="preview"><p>{preview.changed ? `${JSON.stringify(preview.before ?? 'Sin asignar')} → ${JSON.stringify(preview.after)}` : 'Este recurso ya está asignado; no hay cambios.'}</p><p>Se cambia la referencia de este objeto. El PNG y las transformaciones se conservan.</p><button className="primary full" disabled={!preview.changed} onClick={() => act(true)}>Guardar asignación con respaldo</button></div>}</fieldset>}</section>;
}
