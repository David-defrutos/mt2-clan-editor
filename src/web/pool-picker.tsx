import { useEffect, useState } from 'react';
import { api, post } from './api';
import type { ClanSnapshot, Entry } from './types';
import { RewardSettings } from './reward-settings';
type Pool = { id: string; local: boolean; count: number; members: { id: string; name: string; file: string }[] };
type Use = { section: string; id: string; name: string; file: string };
type Model = { supported: boolean; reason?: string; hash: string; label: string; current?: unknown; currentId?: string; candidates: Pool[]; uses: Use[] };
type Preview = { changed: boolean; before?: unknown; after: string; pool: Pool; uses: Use[]; token: string };
function ref(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) { if ((value as Record<string, unknown>).mod_reference) return; value = (value as Record<string, unknown>).id; }
  return typeof value === 'string' ? value : undefined;
}
export function PoolPicker({ clan, entry, onSaved }: { clan: ClanSnapshot; entry: Entry; onSaved: () => void }) {
  const [rules, setRules] = useState<{ sections: Record<string, string[]> }>();
  const [effectId, setEffectId] = useState(''); const [model, setModel] = useState<Model>(); const [poolId, setPoolId] = useState(''); const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Preview>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { let active = true; api<{ sections: Record<string, string[]> }>('/pool-assignment-rules').then(value => { if (active) setRules(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const section = entry.section === 'relics' ? 'relic_effects' : 'effects';
  const refs = new Set(Array.isArray(entry.data.effects) ? entry.data.effects.map(ref) : []);
  const local = clan.entries.filter(e => e.section === section);
  const rewardRefs = new Set<string | undefined>();
  if (entry.section === 'map_nodes' && Array.isArray(entry.data.extensions)) {
    for (const extension of entry.data.extensions) {
      const reward = extension && typeof extension === 'object' ? (extension as Record<string, unknown>).reward : undefined;
      const values = reward && typeof reward === 'object' ? (reward as Record<string, unknown>).rewards : undefined;
      if (Array.isArray(values)) values.forEach(value => rewardRefs.add(ref(value)));
    }
  }
  const rewards = clan.entries.filter(e => e.section === 'rewards');
  const isReward = ['rewards', 'map_nodes'].includes(entry.section);
  const effects = ['effects', 'relic_effects', 'rewards'].includes(entry.section) ? [entry] : isReward ? rewards.filter(e => rewardRefs.has('@' + e.id) && rewards.filter(other => other.id === e.id).length === 1) : local.filter(e => refs.has('@' + e.id) && rules?.sections[section]?.includes(ref(e.data.name) ?? '') && local.filter(other => other.id === e.id).length === 1);
  const effect = effects.find(e => e.id === effectId) ?? effects[0];
  useEffect(() => { setEffectId(''); setNotice(''); }, [entry.id, entry.file]);
  useEffect(() => {
    let active = true; setModel(undefined); setPreview(undefined); setError(''); setQuery('');
    if (!effect || !['cards', 'relics', 'effects', 'relic_effects', 'rewards', 'map_nodes'].includes(entry.section)) return;
    api<Model>(`/clans/${clan.key}/pool-assignment?section=${encodeURIComponent(effect.section)}&file=${encodeURIComponent(effect.file)}&id=${encodeURIComponent(effect.id)}`).then(value => { if (active) { setModel(value); setPoolId(value.currentId ?? ''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [clan.key, entry.section, effect?.section, effect?.id, effect?.file, effect?.hash]);
  if (!['cards', 'relics', 'effects', 'relic_effects', 'rewards', 'map_nodes'].includes(entry.section) || !effect) return null;
  const selected = model?.candidates.find(p => p.id === poolId);
  const candidates = model?.candidates.filter(p => p.id === poolId || p.id.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  async function act(save: boolean) {
    if (!effect || !model) return; setBusy(true); setError(''); setNotice('');
    try {
      const input = { section: effect.section, file: effect.file, id: effect.id, poolId, expectedHash: model.hash, expectedToken: save ? preview?.token : undefined };
      if (save) { await post(`/clans/${clan.key}/pool-assignment/save`, input); setPreview(undefined); setNotice('Pool asignado con respaldo.'); onSaved(); }
      else setPreview(await post<Preview>(`/clans/${clan.key}/pool-assignment/preview`, input));
    } catch (e) { setError((e as Error).message); setPreview(undefined); } finally { setBusy(false); }
  }
  return <details className="spawn-picker"><summary>{isReward ? 'Pool de la recompensa · asignación guiada' : 'Pool del efecto · asignación guiada'}</summary><p>{isReward ? 'La recompensa comparte este pool con todos los nodos o eventos que la utilizan. Se conservan los costes, las opciones de selección y los filtros de rareza. Los pools de aparición del nodo son distintos del pool de cartas.' : 'El cambio se aplica a todas las cartas o reliquias que comparten este efecto. Revisa el tipo de cartas que necesita antes de elegir el pool.'}</p><fieldset disabled={busy}>{effects.length > 1 && <label>{isReward ? 'Recompensa' : 'Efecto'}<select value={effect.id} onChange={e => { setEffectId(e.target.value); setPreview(undefined); }}>{effects.map(e => <option key={e.section + e.file + e.id}>{e.id}</option>)}</select></label>}<small>{effect.section} · {effect.id} · {effect.file}</small>{error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="success-block" role="status">{notice}</p>}{model && !model.supported && <p>{model.reason}</p>}{model?.supported && <><p>Referencia actual: {JSON.stringify(model.current ?? 'Sin asignar')}</p><label>Buscar pool<input value={query} onChange={e => setQuery(e.target.value)} placeholder="ID del pool…" /></label><label>{model.label}<select value={selected ? poolId : ''} onChange={e => { setPoolId(e.target.value); setPreview(undefined); }}><option value="" disabled>Selecciona un pool…</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.id} · {p.count} miembros locales</option>)}</select></label>{selected && <details><summary>{selected.count} miembros locales detectados</summary><div className="scroll-list">{selected.members.map(c => <p key={c.file + c.id}>{c.name} · {c.id}</p>)}</div><small>{selected.local ? 'Los miembros externos, no resueltos o creados desde C# no se cuentan.' : 'Este recuento solo incluye las cartas del mod. El pool del juego tiene miembros adicionales.'}</small></details>}<details><summary>Usos directos compartidos ({model.uses.length})</summary>{model.uses.map(u => <p key={u.section + u.file + u.id}>{u.section} · {u.name} · {u.file}</p>)}<small>Los usos desde C# no se detectan aquí.</small></details><button className="secondary full" disabled={!selected} onClick={() => act(false)}>Previsualizar asignación de pool</button>{preview && <div className="preview"><p>{JSON.stringify(preview.before ?? 'Sin asignar')} → {preview.after}</p><p>{preview.uses.length} usos directos comparten esta definición. Se conserva la definición y los miembros del pool.</p><button className="primary full" disabled={!preview.changed} onClick={() => act(true)}>{isReward ? 'Guardar pool de la recompensa con respaldo' : 'Guardar pool del efecto con respaldo'}</button></div>}</>}</fieldset>{isReward && <RewardSettings clan={clan} entry={effect} onSaved={onSaved} />}</details>;
}
