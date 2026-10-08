import { useLanguage } from './i18n';
import { useEffect, useState } from 'react';
import { api, post } from './api';
import type { ClanSnapshot, Entry } from './types';
type Unit = { id: string; name: string; attack?: number; health?: number; size?: number; count: number };
type Use = { id: string; name: string; section: string; file: string };
type Model = { supported: boolean; reason?: string; hash: string; candidates: Unit[]; members: unknown[]; protectedReferences: unknown[]; fallback: { field: string; value: unknown }[]; uses: Use[]; minReferences: number; maxReferences: number; maxChanges: number };
type Preview = { changed: boolean; token: string; changes: { id: string; name: string; before: number; after: number }[]; members: unknown[]; uses: Use[] };
function ref(value: unknown): string | undefined { if (value && typeof value === 'object' && !Array.isArray(value)) { if ((value as Record<string, unknown>).mod_reference) return; value = (value as Record<string, unknown>).id; } return typeof value === 'string' && value.startsWith('@') ? value.slice(1) : undefined; }
export function CharacterPoolPicker({ clan, entry, onSaved }: { clan: ClanSnapshot; entry: Entry; onSaved: () => void }) {
  const { t } = useLanguage();
  const [names, setNames] = useState<string[]>([]); const [effectId, setEffectId] = useState(''); const [model, setModel] = useState<Model>(); const [pending, setPending] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState(''); const [preview, setPreview] = useState<Preview>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { let active = true; api<{ effectNames: string[] }>('/character-pool-rules').then(value => { if (active) setNames(value.effectNames); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const refs = new Set(Array.isArray(entry.data.effects) ? entry.data.effects.map(ref) : []);
  const local = clan.entries.filter(e => e.section === 'effects');
  const effects = entry.section === 'effects' ? [entry] : local.filter(e => refs.has(e.id) && names.includes(String(typeof e.data.name === 'string' ? e.data.name : (e.data.name as Record<string, unknown> | undefined)?.id)) && local.filter(other => other.id === e.id).length === 1);
  const effect = effects.find(e => e.id === effectId) ?? effects[0];
  useEffect(() => { setEffectId(''); setNotice(''); }, [entry.id, entry.file]);
  useEffect(() => {
    let active = true; setModel(undefined); setPreview(undefined); setPending({}); setQuery(''); setError('');
    if (!effect || !['cards', 'effects'].includes(entry.section)) return;
    api<Model>(`/clans/${clan.key}/character-pool?file=${encodeURIComponent(effect.file)}&id=${encodeURIComponent(effect.id)}`).then(value => { if (active) setModel(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [clan.key, entry.section, effect?.id, effect?.file, effect?.hash]);
  if (!['cards', 'effects'].includes(entry.section) || !effect) return null;
  const chosen = model?.candidates.filter(u => pending[u.id] !== undefined) ?? [];
  const visible = model?.candidates.filter(u => `${u.name} ${u.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const total = (model?.members.length ?? 0) + chosen.reduce((sum, u) => sum + (pending[u.id] ? 1 : -u.count), 0);
  function toggle(unit: Unit, member: boolean) { const next = { ...pending }; if (Boolean(unit.count) === member) delete next[unit.id]; else next[unit.id] = member; setPending(next); setPreview(undefined); setNotice(''); }
  async function act(save: boolean) {
    if (!model || !effect) return; setBusy(true); setError(''); setNotice('');
    try {
      const input = { file: effect.file, id: effect.id, expectedHash: model.hash, changes: chosen.map(u => ({ id: u.id, member: pending[u.id] })), expectedToken: save ? preview?.token : undefined };
      if (save) { await post(`/clans/${clan.key}/character-pool/save`, input); setPending({}); setPreview(undefined); setNotice('Pool de personajes guardado con respaldo.'); onSaved(); }
      else setPreview(await post<Preview>(`/clans/${clan.key}/character-pool/preview`, input));
    } catch (e) { setError((e as Error).message); setPreview(undefined); } finally { setBusy(false); }
  }
  return <details className="spawn-picker"><summary>{t("Pool de personajes · invocación aleatoria")}</summary><p>{t("Selecciona las unidades del pool del efecto. La unidad de respaldo y los demás parámetros se conservan. Editar este efecto cambia todos sus usos.")}</p><fieldset disabled={busy}>{effects.length > 1 && <label>{t("Efecto")}<select value={effect.id} disabled={chosen.length > 0} onChange={e => setEffectId(e.target.value)}>{effects.map(e => <option key={e.id}>{e.id}</option>)}</select></label>}<small>{effect.id} · {effect.file}</small>{error && <p className="notice error" role="alert">{t(error)}</p>}{notice && <p className="success-block" role="status">{t(notice)}</p>}{model && !model.supported && <p>{t(model.reason ?? "")}</p>}{model?.supported && <><p>{t("{count} referencias después de los cambios · límite {min}–{max}. Las repeticiones existentes se conservan; desmarcar una unidad elimina todas sus referencias locales.", { count: total, min: model.minReferences, max: model.maxReferences })}</p>{!model.members.length && <p className="notice">{t("Añadir unidades crea una lista de selección aleatoria en esta invocación. Revisa el comportamiento del efecto antes de probarlo en el juego.")}</p>}<details><summary>{t("Respaldo individual conservado")}</summary>{model.fallback.map(f => <p key={f.field}>{f.field}: {JSON.stringify(f.value)}</p>)}</details><details><summary>{t("{count} referencias externas, no resueltas o ambiguas conservadas", { count: model.protectedReferences.length })}</summary><pre>{JSON.stringify(model.protectedReferences, null, 2)}</pre></details><label>{t("Buscar unidad")}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Nombre o ID…")} /></label><div className="scroll-list">{visible.map(u => <label className="character-pool-row" key={u.id}><input type="checkbox" checked={pending[u.id] ?? Boolean(u.count)} disabled={pending[u.id] === undefined && chosen.length >= model.maxChanges} onChange={e => toggle(u, e.target.checked)} /><span>{u.name}<small>{t("{id} · Ataque {attack} · Salud {health} · Tamaño {size} · {count} referencias actuales", { id: u.id, attack: u.attack ?? '—', health: u.health ?? '—', size: u.size ?? '—', count: u.count })}</small></span></label>)}</div>{!visible.length && <p>{t("No hay unidades locales únicas que coincidan.")}</p>}<details><summary>{t("{count} usos compartidos del efecto", { count: model.uses.length })}</summary>{model.uses.map(u => <p key={u.section + u.file + u.id}>{u.section} · {u.name}</p>)}<small>{t("Los usos desde C# no se detectan.")}</small></details><div className="head-actions"><button className="ghost" disabled={!chosen.length} onClick={() => { setPending({}); setPreview(undefined); }}>{t("Descartar cambios")}</button><button className="secondary" disabled={!chosen.length || total < model.minReferences || total > model.maxReferences} onClick={() => act(false)}>{t("Previsualizar pool de personajes")}</button></div>{preview && <div className="preview">{preview.changes.map(c => <p key={c.id}>{t("{name}: {before} → {after} referencias locales", { name: c.name, before: c.before, after: c.after })}</p>)}<p>{t("{count} referencias finales. Las unidades, arte, respaldo individual y otros parámetros se conservan.", { count: preview.members.length })}</p><details><summary>{t("Lista completa resultante")}</summary><pre>{JSON.stringify(preview.members, null, 2)}</pre></details><button className="primary full" disabled={!preview.changed} onClick={() => act(true)}>{t("Guardar pool de personajes con respaldo")}</button></div>}</>}</fieldset></details>;
}
