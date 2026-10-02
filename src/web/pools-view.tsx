import { useEffect, useState } from 'react';
import { api, post } from './api';
import { ContentCreator } from './content-creator';
import type { ClanSnapshot, Entry } from './types';

interface Card { id: string; name: string; file: string; hash: string; rarity: string; type: string; pools: string[]; directPools: string[]; cardPools: string[]; editable: boolean }
interface Model { pools: { id: string; editable: boolean; warning: string; additionLocation: 'card' | 'pool'; definition?: { id: string; file: string }; directCards: unknown[] }[]; cards: Card[]; maxBatchSize: number }
interface Preview { token: string; files: string[]; changes: { id: string; name: string; file: string; before: boolean; after: boolean; locations: string[] }[] }
const key = (card: Card) => card.file + ':' + card.id;
export function PoolsView({ clan, onSaved, onOpen }: { clan: ClanSnapshot; onSaved: () => void | Promise<void>; onOpen: (entry: Entry) => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [pool, setPool] = useState('MegaPool');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState(''); const [rarity, setRarity] = useState('all'); const [type, setType] = useState('all'); const [membership, setMembership] = useState('all');
  const [preview, setPreview] = useState<Preview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true; setBusy(true); setModel(null); setPending({}); setPreview(null); setError('');
    api<Model>(`/clans/${clan.key}/pools`).then(value => { if (active) { setModel(value); setPool(old => value.pools.some(p => p.id === old) ? old : value.pools[0]?.id ?? ''); } }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [clan.key, clan.entries]);
  const selected = model?.pools.find(p => p.id === pool);
  const member = (card: Card) => pending[key(card)] ?? card.pools.includes(pool);
  const chosen = model?.cards.filter(card => pending[key(card)] !== undefined) ?? [];
  const visible = model?.cards.filter(card => `${card.name} ${card.id} ${card.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (rarity === 'all' || card.rarity === rarity) && (type === 'all' || card.type === type) && (membership === 'all' || (membership === 'member' ? member(card) : membership === 'outside' ? !member(card) : pending[key(card)] !== undefined))) ?? [];
  function change(card: Card, value: boolean) {
    const next = { ...pending }; if (value === card.pools.includes(pool)) delete next[key(card)]; else next[key(card)] = value;
    setPending(next); setPreview(null); setMessage('');
  }
  function reset() { setPending({}); setPreview(null); setMessage(''); }
  async function act(save: boolean) {
    setBusy(true); setError(''); setMessage('');
    const changes = chosen.map(card => ({ id: card.id, file: card.file, expectedHash: card.hash, member: pending[key(card)] }));
    try {
      if (save) {
        const result = await post<{ count: number; backup?: string }>(`/clans/${clan.key}/pools/save`, { pool, changes, expectedToken: preview?.token });
        await onSaved(); reset(); setMessage(`${result.count} cambios guardados. Copias originales: ${result.backup ?? 'sin cambios'}`);
      } else setPreview(await post<Preview>(`/clans/${clan.key}/pools/preview`, { pool, changes }));
    } catch (e) { setError((e as Error).message); setPreview(null); } finally { setBusy(false); }
  }
  return <><div className="page-head"><div><div className="eyebrow">RECOMPENSAS</div><h1>Pools</h1><p>Añade o quita cartas de un pool. Marca su pertenencia, revisa los cambios y guarda con respaldo.</p></div></div>
    {error && <div className="notice error">{error}</div>}{message && <div className="success-block">{message}</div>}
    <ContentCreator clan={clan} section="card_pools" selected={selected?.editable && selected.definition ? clan.entries.find(e => e.section === 'card_pools' && e.id === selected.definition?.id && e.file === selected.definition.file) : undefined} disabled={busy || !model || chosen.length > 0} onSaved={onSaved} onCreated={id => { setPool('@' + id); setQuery(''); setRarity('all'); setType('all'); setMembership('all'); }} />
    {selected && !selected.definition && <p className="muted">Para duplicar, selecciona un pool con definición local @ID. Los pools del juego o sin definición local no admiten copia guiada.</p>}
    {chosen.length > 0 && <p className="muted">Guarda o descarta las pertenencias pendientes antes de crear un pool.</p>}
    <div className="pool-layout"><nav className="panel pool-list pool-editor-nav" aria-label="Pools del clan">{model?.pools.map(p => <button key={p.id} className={p.id === pool ? 'active' : ''} disabled={busy || (chosen.length > 0 && p.id !== pool)} title={chosen.length && p.id !== pool ? 'Guarda o descarta los cambios antes de cambiar de pool.' : p.warning} onClick={() => { setPool(p.id); reset(); }}><span>{p.id}{!p.editable && <small>Solo lectura</small>}</span><b>{model.cards.filter(c => c.pools.includes(p.id)).length}</b></button>)}</nav>
    <section className="panel content-panel"><h2>{pool || 'Cargando pools…'}</h2>{selected?.warning && <p className="notice">{selected.warning}</p>}<p className="muted">Las altas se guardan en {selected?.additionLocation === 'pool' ? 'la lista cards del pool' : 'la lista pools de cada carta'}. Al quitar, se elimina la pertenencia local en ambas listas si existe. Los miembros construidos desde C# o referencias externas pueden incluir cartas adicionales.</p>
    {selected?.definition && <button className="secondary" disabled={busy || chosen.length > 0} onClick={() => { const entry = clan.entries.find(e => e.section === 'card_pools' && e.id === selected.definition?.id && e.file === selected.definition.file); if (entry) onOpen(entry); }}>Abrir definición del pool</button>}
    {Boolean(selected?.directCards.length) && <details><summary>{selected!.directCards.length} referencias declaradas directamente en el pool</summary><pre>{JSON.stringify(selected!.directCards, null, 2)}</pre><p>Solo las referencias locales resueltas aparecen como miembros en la tabla. Las referencias externas o inexistentes se conservan.</p></details>}
    <div className="filters"><input aria-label="Buscar cartas del pool" placeholder="Nombre, ID o archivo…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Rareza" value={rarity} onChange={e => setRarity(e.target.value)}><option value="all">Todas las rarezas</option>{[...new Set(model?.cards.map(c => c.rarity) ?? [])].sort().map(r => <option key={r} value={r}>{r || 'Sin rareza'}</option>)}</select><select aria-label="Tipo de carta" value={type} onChange={e => setType(e.target.value)}><option value="all">Todos los tipos</option>{[...new Set(model?.cards.map(c => c.type) ?? [])].sort().map(t => <option key={t} value={t}>{t || 'Sin tipo'}</option>)}</select><select aria-label="Pertenencia al pool" value={membership} onChange={e => setMembership(e.target.value)}><option value="all">Todas las cartas</option><option value="member">En el pool (con cambios)</option><option value="outside">Fuera del pool (con cambios)</option><option value="pending">Cambios pendientes</option></select><button className="ghost" onClick={() => { setQuery(''); setRarity('all'); setType('all'); setMembership('all'); }}>Limpiar filtros</button></div>
    <div className="head-actions"><span>{visible.length} visibles · {chosen.length}/{model?.maxBatchSize ?? '—'} cambios pendientes</span><button className="ghost" disabled={busy || !chosen.length} onClick={reset}>Descartar cambios</button></div>
    <div className="table-panel progression-table"><table><thead><tr><th>En el pool</th><th>Carta</th><th>Tipo / rareza</th><th>Declarada en</th><th>Cambio</th></tr></thead><tbody>{visible.map(card => <tr key={key(card)}><td><input type="checkbox" aria-label={`Pertenencia de ${card.name}`} checked={member(card)} disabled={busy || !selected?.editable || !card.editable || (pending[key(card)] === undefined && chosen.length >= (model?.maxBatchSize ?? 0))} title={!card.editable ? 'ID duplicado, ausente o lista de pools inválida. Revisa el JSON.' : 'Marcar añade la carta; desmarcar la quita.'} onChange={e => change(card, e.target.checked)} /></td><td><button className="ghost" disabled={busy || chosen.length > 0} title={chosen.length ? 'Guarda o descarta los cambios antes de abrir la carta.' : 'Abrir carta'} onClick={() => { const entry = clan.entries.find(e => e.section === 'cards' && e.file === card.file && e.id === card.id); if (entry) onOpen(entry); }}>{card.name}</button><small>{card.id} · {card.file}</small></td><td>{card.type || '—'} / {card.rarity || '—'}</td><td>{[card.directPools.includes(pool) ? 'pool.cards' : '', card.cardPools.includes(pool) ? 'carta.pools' : ''].filter(Boolean).join(' + ') || '—'}</td><td>{pending[key(card)] === undefined ? '—' : pending[key(card)] ? 'Añadir' : 'Quitar'}</td></tr>)}</tbody></table></div>
    {!visible.length && !busy && <p>No hay cartas que coincidan con los filtros.</p>}<div className="head-actions"><button className="secondary" disabled={busy || !chosen.length} onClick={() => act(false)}>Previsualizar cambios</button></div>
    {preview && <div className="preview"><h3>Revisión: {preview.changes.length} cambios en {preview.files.length} archivos</h3><div className="scroll-list">{preview.changes.map(c => <div className="link-row" key={c.file + c.id}><span>{c.name}<small>{c.locations.join(' · ')}</small></span><b>{c.after ? 'Añadir' : 'Quitar'}</b></div>)}</div><p>Se guardan las cartas de todos los filtros. Si falla una escritura, se intenta restaurar los archivos ya modificados.</p><button className="primary" disabled={busy || !preview.changes.length} onClick={() => act(true)}>Guardar pertenencia con respaldo</button></div>}
    </section></div></>;
}
