import { PoolCountEditor } from './pool-count-editor';
import { useLanguage } from './i18n';
import { useEffect, useState } from 'react';
import { api, post } from './api';
import { ContentCreator } from './content-creator';
import type { ClanSnapshot, Entry } from './types';

interface Card { id: string; name: string; file: string; hash: string; rarity: string; type: string; pools: string[]; poolCounts: Record<string, number>; directPools: string[]; cardPools: string[]; editable: boolean }
interface Model { pools: { id: string; editable: boolean; warning: string; additionLocation: 'card' | 'pool'; definition?: { id: string; file: string }; directCards: unknown[] }[]; cards: Card[]; maxBatchSize: number }
interface Preview { token: string; files: string[]; changes: { id: string; name: string; file: string; before: boolean; after: boolean; locations: string[] }[] }
const key = (card: Card) => card.file + ':' + card.id;
export function PoolsView({ clan, onSaved, onOpen }: { clan: ClanSnapshot; onSaved: () => void | Promise<void>; onOpen: (entry: Entry) => void }) {
  const { t } = useLanguage();
  const [model, setModel] = useState<Model | null>(null);
  const [pool, setPool] = useState('MegaPool');
  const [countCard,setCountCard] = useState<string>();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState(''); const [rarity, setRarity] = useState('all'); const [type, setType] = useState('all'); const [membership, setMembership] = useState('all');
  const [preview, setPreview] = useState<Preview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState<{ count: number; backup?: string }>();
  useEffect(() => {
    let active = true; setBusy(true); setModel(null); setPending({}); setPreview(null); setError(''); setCountCard(undefined);
    api<Model>(`/clans/${clan.key}/pools`).then(value => { if (active) { setModel(value); setPool(old => value.pools.some(p => p.id === old) ? old : value.pools[0]?.id ?? ''); } }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [clan.key, clan.entries]);
  const selected = model?.pools.find(p => p.id === pool);
  const member = (card: Card) => pending[key(card)] ?? card.pools.includes(pool);
  const chosen = model?.cards.filter(card => pending[key(card)] !== undefined) ?? [];
  const visible = model?.cards.filter(card => `${card.name} ${card.id} ${card.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (rarity === 'all' || card.rarity === rarity) && (type === 'all' || card.type === type) && (membership === 'all' || (membership === 'member' ? member(card) : membership === 'outside' ? !member(card) : pending[key(card)] !== undefined))) ?? [];
  function change(card: Card, value: boolean) {
    const next = { ...pending }; if (value === card.pools.includes(pool)) delete next[key(card)]; else next[key(card)] = value;
    setPending(next); setPreview(null); setMessage(undefined);
  }
  function reset() { setPending({}); setPreview(null); setMessage(undefined); }
  async function act(save: boolean) {
    setBusy(true); setError(''); setMessage(undefined);
    const changes = chosen.map(card => ({ id: card.id, file: card.file, expectedHash: card.hash, member: pending[key(card)] }));
    try {
      if (save) {
        const result = await post<{ count: number; backup?: string }>(`/clans/${clan.key}/pools/save`, { pool, changes, expectedToken: preview?.token });
        await onSaved(); reset(); setMessage(result);
      } else setPreview(await post<Preview>(`/clans/${clan.key}/pools/preview`, { pool, changes }));
    } catch (e) { setError((e as Error).message); setPreview(null); } finally { setBusy(false); }
  }
  return <><div className="page-head"><div><div className="eyebrow">{t("RECOMPENSAS")}</div><h1>{t("Pools")}</h1><p>{t("Añade o quita cartas de un pool. Marca su pertenencia, revisa los cambios y guarda con respaldo.")}</p></div></div>
    {error && <div className="notice error">{t(error)}</div>}{message && <div className="success-block">{t("{count} cambios guardados. Copias originales: {backup}", { count: message.count, backup: message.backup ?? t("sin cambios") })}</div>}
    <ContentCreator clan={clan} section="card_pools" selected={selected?.editable && selected.definition ? clan.entries.find(e => e.section === 'card_pools' && e.id === selected.definition?.id && e.file === selected.definition.file) : undefined} disabled={busy || Boolean(countCard) || !model || chosen.length > 0} onSaved={onSaved} onCreated={id => { setPool('@' + id); setQuery(''); setRarity('all'); setType('all'); setMembership('all'); }} />
    {selected && !selected.definition && <p className="muted">{t("Para duplicar, selecciona un pool con definición local @ID. Los pools del juego o sin definición local no admiten copia guiada.")}</p>}
    {chosen.length > 0 && <p className="muted">{t("Guarda o descarta las pertenencias pendientes antes de crear un pool.")}</p>}
    <div className="pool-layout"><nav className="panel pool-list pool-editor-nav" aria-label={t("Pools del clan")}>{model?.pools.map(p => <button key={p.id} className={p.id === pool ? 'active' : ''} disabled={busy || Boolean(countCard) || (chosen.length > 0 && p.id !== pool)} title={chosen.length && p.id !== pool ? t("Guarda o descarta los cambios antes de cambiar de pool.") : p.warning} onClick={() => { setPool(p.id); reset(); }}><span>{p.id}{!p.editable && <small>{t("Solo lectura")}</small>}</span><b>{model.cards.filter(c => c.pools.includes(p.id)).length}</b></button>)}</nav>
    <section className="panel content-panel"><h2>{pool || t("Cargando pools…")}</h2>{selected?.warning && <p className="notice">{selected.warning}</p>}<p className="muted">{t("Las altas se guardan en {location}. Al quitar, se elimina la pertenencia local en ambas listas si existe. Los miembros construidos desde C# o referencias externas pueden incluir cartas adicionales.", { location: t(selected?.additionLocation === 'pool' ? "la lista cards del pool" : "la lista pools de cada carta") })}</p>
    {selected?.definition && <button className="secondary" disabled={busy || Boolean(countCard) || chosen.length > 0} onClick={() => { const entry = clan.entries.find(e => e.section === 'card_pools' && e.id === selected.definition?.id && e.file === selected.definition.file); if (entry) onOpen(entry); }}>{t("Abrir definición del pool")}</button>}
    {Boolean(selected?.directCards.length) && <details><summary>{t("{count} referencias declaradas directamente en el pool", { count: selected!.directCards.length })}</summary><pre>{JSON.stringify(selected!.directCards, null, 2)}</pre><p>{t("Solo las referencias locales resueltas aparecen como miembros en la tabla. Las referencias externas o inexistentes se conservan.")}</p></details>}
    <div className="filters"><input aria-label={t("Buscar cartas del pool")} placeholder={t("Nombre, ID o archivo…")} value={query} onChange={e => setQuery(e.target.value)} /><select aria-label={t("Rareza")} value={rarity} onChange={e => setRarity(e.target.value)}><option value="all">{t("Todas las rarezas")}</option>{[...new Set(model?.cards.map(c => c.rarity) ?? [])].sort().map(r => <option key={r} value={r}>{r || t("Sin rareza")}</option>)}</select><select aria-label="Tipo de carta" value={type} onChange={e => setType(e.target.value)}><option value="all">{t("Todos los tipos")}</option>{[...new Set(model?.cards.map(c => c.type) ?? [])].sort().map(type => <option key={type} value={type}>{type || t('Sin tipo')}</option>)}</select><select aria-label={t("Pertenencia al pool")} value={membership} onChange={e => setMembership(e.target.value)}><option value="all">{t("Todas las cartas")}</option><option value="member">{t("En el pool (con cambios)")}</option><option value="outside">{t("Fuera del pool (con cambios)")}</option><option value="pending">{t("Cambios pendientes")}</option></select><button className="ghost" onClick={() => { setQuery(''); setRarity('all'); setType('all'); setMembership('all'); }}>{t("Limpiar filtros")}</button></div>
    <div className="head-actions"><span>{t("{visible} visibles · {count}/{max} cambios pendientes", { visible: visible.length, count: chosen.length, max: model?.maxBatchSize ?? '—' })}</span><button className="ghost" disabled={busy || Boolean(countCard) || !chosen.length} onClick={reset}>{t("Descartar cambios")}</button></div>
    <div className="table-panel progression-table"><table><thead><tr><th>{t("En el pool")}</th><th title={t("Suma de entradas locales en carta.pools y pool.cards. No representa la probabilidad final de obtener la carta.")}>{t("Entradas locales")}</th><th>{t("Carta")}</th><th>{t("Tipo / rareza")}</th><th>{t("Declarada en")}</th><th>{t("Cambio")}</th></tr></thead><tbody>{visible.map(card => <tr key={key(card)}><td><input type="checkbox" aria-label={t("Pertenencia de {name}", { name: card.name })} checked={member(card)} disabled={busy || Boolean(countCard) || !selected?.editable || !card.editable || (pending[key(card)] === undefined && chosen.length >= (model?.maxBatchSize ?? 0))} title={!card.editable ? t("ID duplicado, ausente o lista de pools inválida. Revisa el JSON.") : t("Marcar añade la carta; desmarcar la quita.")} onChange={e => change(card, e.target.checked)} /></td><td>{member(card) ? (pending[key(card)] === true ? 1 : card.poolCounts[pool] ?? 0) : 0}<button className="ghost" disabled={busy || Boolean(countCard) || chosen.length > 0 || !selected?.editable || !card.editable || !card.pools.includes(pool)} onClick={() => setCountCard(card.id)}>{t('Editar cantidades')}</button></td><td><button className="ghost" disabled={busy || Boolean(countCard) || chosen.length > 0} title={chosen.length ? t("Guarda o descarta los cambios antes de abrir la carta.") : t("Abrir carta")} onClick={() => { const entry = clan.entries.find(e => e.section === 'cards' && e.file === card.file && e.id === card.id); if (entry) onOpen(entry); }}>{card.name}</button><small>{card.id} · {card.file}</small></td><td>{card.type || '—'} / {card.rarity || '—'}</td><td>{[card.directPools.includes(pool) ? 'pool.cards' : '', card.cardPools.includes(pool) ? 'carta.pools' : ''].filter(Boolean).join(' + ') || '—'}</td><td>{pending[key(card)] === undefined ? '—' : pending[key(card)] ? t("Añadir") : t("Quitar")}</td></tr>)}</tbody></table></div>
    {!visible.length && !busy && <p>{t("No hay cartas que coincidan con los filtros.")}</p>}<div className="head-actions"><button className="secondary" disabled={busy || Boolean(countCard) || !chosen.length} onClick={() => act(false)}>{t("Previsualizar cambios")}</button></div>
    {countCard && <PoolCountEditor key={clan.key+pool+countCard} clanKey={clan.key} pool={pool} id={countCard} onClose={() => setCountCard(undefined)} onSaved={async result => { await onSaved(); setCountCard(undefined); setMessage({ count: result.changed ? 1 : 0, backup: result.backup }); }} />}
    {preview && <div className="preview"><h3>{t("Revisión: {count} cambios en {files} archivos", { count: preview.changes.length, files: preview.files.length })}</h3><div className="scroll-list">{preview.changes.map(c => <div className="link-row" key={c.file + c.id}><span>{c.name}<small>{c.locations.join(' · ')}</small></span><b>{c.after ? t("Añadir") : t("Quitar")}</b></div>)}</div><p>{t("Se guardan las cartas de todos los filtros. Si falla una escritura, se intenta restaurar los archivos ya modificados.")}</p><button className="primary" disabled={busy || Boolean(countCard) || !preview.changes.length} onClick={() => act(true)}>{t("Guardar pertenencia con respaldo")}</button></div>}
    </section></div></>;
}
