import { useEffect, useState } from 'react';
import { api, post } from './api';
import type { ClanSnapshot, Entry } from './types';
type Field = { id: string; label: string; type: string; help: string; current?: unknown; min?: number; max?: number; options?: string[] };
type Model = { hash: string; fields: Field[] };
type Preview = { changed: boolean; label: string; before?: unknown; after: unknown; token: string };
export function RewardSettings({ clan, entry, onSaved }: { clan: ClanSnapshot; entry: Entry; onSaved: () => void }) {
  const [model, setModel] = useState<Model>(); const [fieldId, setFieldId] = useState(''); const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Preview>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setModel(undefined); setPreview(undefined); setError(''); setNotice('');
    api<Model>(`/clans/${clan.key}/reward-settings?file=${encodeURIComponent(entry.file)}&id=${encodeURIComponent(entry.id)}`).then(m => { if (active) { setModel(m); setFieldId(m.fields[0]?.id ?? ''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [clan.key, entry.file, entry.id, entry.hash]);
  const field = model?.fields.find(f => f.id === fieldId);
  useEffect(() => { setValue(Array.isArray(field?.current) ? field.current.join(', ') : field?.current === undefined ? '' : String(field.current)); setPreview(undefined); }, [field]);
  async function act(save: boolean) {
    if (!field || !model) return; setBusy(true); setError(''); setNotice('');
    try {
      if (!value.trim()) throw new Error('Introduce un valor explícito. Un campo ausente mantiene el valor que aplica el juego.');
      const parsed = field.type === 'integer-list' ? value.split(',').map(part => { if (!part.trim()) throw new Error('Introduce costes separados por comas, sin valores vacíos.'); return Number(part); }) : field.type === 'integer' ? Number(value) : field.type === 'boolean' ? value === 'true' : value;
      const input = { file: entry.file, id: entry.id, field: field.id, value: parsed, expectedHash: model.hash, expectedToken: save ? preview?.token : undefined };
      if (save) { await post(`/clans/${clan.key}/reward-settings/save`, input); setPreview(undefined); setNotice('Ajuste guardado con respaldo.'); onSaved(); }
      else setPreview(await post<Preview>(`/clans/${clan.key}/reward-settings/preview`, input));
    } catch (e) { setError((e as Error).message); setPreview(undefined); } finally { setBusy(false); }
  }
  return <details className="edit-box"><summary>Ajustes de la recompensa</summary><p>Modifica un campo por revisión. El cambio afecta a todos los nodos y eventos que utilizan esta recompensa.</p>{error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status">{notice}</p>}<fieldset disabled={busy}>{model && <><label>Campo<select value={fieldId} onChange={e => { setFieldId(e.target.value); setPreview(undefined); }}>{model.fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>{field && <><p className="muted">{field.help}</p><p>Actual: {JSON.stringify(field.current) ?? 'Sin campo explícito; el juego aplica su valor predeterminado.'}</p><label title={field.help}>{field.label}{['boolean', 'select'].includes(field.type) ? <select value={value} onChange={e => { setValue(e.target.value); setPreview(undefined); }}><option value="" disabled>Selecciona un valor…</option>{field.type === 'boolean' ? <><option value="true">Sí</option><option value="false">No</option></> : field.options?.map(v => <option key={v}>{v}</option>)}</select> : <input type={field.type === 'integer' ? 'number' : 'text'} min={field.min} max={field.max} step={1} value={value} placeholder={field.type === 'integer-list' ? '100, 150, 200' : 'Valor explícito'} onChange={e => { setValue(e.target.value); setPreview(undefined); }} />}</label><button className="secondary full" onClick={() => act(false)}>Previsualizar ajuste</button>{preview && <div className="preview"><p>{preview.label}: {JSON.stringify(preview.before) ?? 'Sin campo'} → {JSON.stringify(preview.after)}</p><button className="primary full" disabled={!preview.changed} onClick={() => act(true)}>Guardar ajuste con respaldo</button></div>}</>}</>}</fieldset></details>;
}
