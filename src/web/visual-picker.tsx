import {useLanguage} from './i18n';
import React, { useEffect, useState } from 'react';
import { api, post } from './api';
import { VisualCopy } from './visual-copy';
import type { ClanSnapshot, Entry } from './types';
type Candidate = { id: string; name: string; image?: string; width?: number; height?: number; uses: { section: string; name: string; id: string; file: string }[] };
type Slot = { path: string; label: string; destinationType?: string; copyable: boolean; candidates: Candidate[] };
type Preview = { changed: boolean; before: unknown; after: unknown; resource: Candidate };
function ref(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as Record<string, unknown>; if (object.mod_reference) return ''; value = object.id; }
  return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : '';
}
const at = (data: unknown, field: string): unknown => field.split('.').reduce<unknown>((v, key) => v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined, data);
export function VisualPicker({ clan, entry, onSaved }: { clan: ClanSnapshot; entry: Entry; onSaved: () => void }) {
 const {t}=useLanguage();
  const [slots, setSlots] = useState<Slot[]>([]); const [field, setField] = useState('');
  const [selected, setSelected] = useState(''); const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Preview>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setSlots([]); setPreview(undefined); setError(''); setSelected(''); setQuery('');

    api<Slot[]>(`/clans/${clan.key}/visual-assignments?section=${encodeURIComponent(entry.section)}&id=${encodeURIComponent(entry.id)}&file=${encodeURIComponent(entry.file)}`).then(value => {
      if (!active) return; const available = value.filter(s => !s.destinationType || s.destinationType === entry.data.type); setSlots(available); setField(available[0]?.path ?? ''); setSelected(ref(at(entry.data, available[0]?.path ?? '')));
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [clan.key, entry.section, entry.id, entry.file, entry.hash]);
  if (!slots.length && !error) return null;
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
  return <section className="visual-picker"><h3>{t("Asignar arte existente")}</h3><p>{t("Selecciona un recurso del catálogo del clan y revisa sus usos antes de guardar.")}</p>{error && <div className="notice error" role="alert">{t(error)}</div>}{notice && <p className="success-block" role="status">{t(notice)}</p>}{slot && <fieldset disabled={busy}>{slots.length > 1 && <label>{t("Tipo de recurso")}<select value={field} onChange={e => { setField(e.target.value); setSelected(ref(at(entry.data, e.target.value))); setPreview(undefined); }}>{slots.map(slot => <option key={slot.path} value={slot.path}>{t(slot.label)}</option>)}</select></label>}<small>{t("Referencia actual:")}{" "}{JSON.stringify(at(entry.data, slot.path) ?? t("Sin asignar"))}</small><label>{t("Buscar arte")}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Nombre o ID…")} /></label><label>{t(slot.label)}<select value={resource ? selected : ''} onChange={e => { setSelected(e.target.value); setPreview(undefined); }}><option value="" disabled>{t("Selecciona un recurso local")}</option>{filtered.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name === candidate.id ? candidate.name : `${candidate.name} · ${candidate.id}`}</option>)}</select></label>{resource && <><div className="visual-assignment-image">{resource.image ? <img src={`/api/assets/${clan.key}?file=${encodeURIComponent(resource.image)}`} alt={`Arte de ${resource.name}`} /> : <p>{t("Imagen no disponible: revisa el sprite o sus animaciones en Recursos visuales.")}</p>}</div><small>{resource.width ?? '?'} × {resource.height ?? '?'}{" "}{t("px ·")}{" "}{resource.uses.length}{" "}{t("usos actuales")}</small><details><summary>{t("Objetos que comparten este arte")}</summary>{resource.uses.map(use => <p key={use.section + use.file + use.id}>{use.section} · {use.name}</p>)}<p>{t("Editar después este recurso compartido afecta a todos sus usuarios.")}</p></details>{slot.copyable && <VisualCopy clan={clan} entry={entry} field={field} sourceId={resource.id} onSaved={onSaved} onBusy={setBusy} />}</>}<button className="secondary full" disabled={!resource} onClick={() => act(false)}>{t("Previsualizar asignación")}</button>{preview && <div className="preview"><p>{preview.changed ? `${JSON.stringify(preview.before ?? t("Sin asignar"))} → ${JSON.stringify(preview.after)}` : t("Este recurso ya está asignado; no hay cambios.")}</p><p>{t("Se cambia la referencia de este objeto. El PNG y las transformaciones se conservan.")}</p><button className="primary full" disabled={!preview.changed} onClick={() => act(true)}>{t("Guardar asignación con respaldo")}</button></div>}</fieldset>}</section>;
}
