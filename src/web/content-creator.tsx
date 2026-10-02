import React, { useEffect, useState } from 'react';
import { api, post } from './api';
import type { ClanSnapshot, Entry } from './types';

type Preview = { file: string; token: string; objects: { section: string; id: string }[]; warnings: string[]; document: Record<string, unknown>; images: string[]; poolCopy?: { directReferences: number; addedCards: { id: string; name: string; file: string }[]; uses: { id: string; name: string; file: string; section: string }[] } };
export function ContentCreator({ clan, section, selected, onSaved, disabled = false, onCreated }: { clan: ClanSnapshot; section: 'cards' | 'characters' | 'upgrades' | 'card_pools' | 'rewards'; selected?: Entry; onSaved: () => void | Promise<void>; disabled?: boolean; onCreated?: (id: string) => void }) {
  const [mode, setMode] = useState<'new' | 'copy' | null>(null);
  const [source, setSource] = useState<Entry>();
  const [id, setId] = useState(''); const [name, setName] = useState('');
  const [kind, setKind] = useState('monster');
  const [preview, setPreview] = useState<Preview>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [rewardTypes, setRewardTypes] = useState<{ id: string; label: string }[]>([]);
  const [pools, setPools] = useState<{ id: string; editable: boolean }[]>([]); const [poolId, setPoolId] = useState('');
  useEffect(() => {
    if (section !== 'rewards' || mode !== 'new') return;
    let active = true; setRewardTypes([]); setPools([]);
    Promise.all([api<{ id: string; label: string }[]>('/reward-templates'), api<{ pools: { id: string; editable: boolean }[] }>(`/clans/${clan.key}/pools`)]).then(([types, model]) => { if (active) { setRewardTypes(types); setKind(types[0]?.id ?? ''); setPools(model.pools.filter(p => p.editable)); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [section, clan.key, mode]);
  function open(copy: boolean) {
    setMode(copy ? 'copy' : 'new'); setSource(copy ? selected : undefined);
    setId(copy ? selected!.id + 'Copy' : ''); setName(copy ? selected!.name + ' (copia)' : '');
    setPreview(undefined); setError(''); setSaved('');
    setPoolId('');
  }
  async function act(save: boolean) {
    setBusy(true); setError('');
    try {
      const input = { section, id, name: section === 'card_pools' ? '' : name, kind, poolId: section === 'rewards' && !source ? poolId : undefined, source: source ? { id: source.id, file: source.file } : undefined, expectedToken: save ? preview?.token : undefined };
      if (save) {
        const result = await post<{ file: string }>(`/clans/${clan.key}/content/save`, input);
        setMode(null); setSaved(`Creado ${id} en ${result.file}.`); await onSaved(); onCreated?.(id);
      } else setPreview(await post<Preview>(`/clans/${clan.key}/content/preview`, input));
    } catch (e) { setError((e as Error).message); setPreview(undefined); }
    finally { setBusy(false); }
  }
  const valid = /^[A-Za-z][A-Za-z0-9_]{2,79}$/.test(id) && (section === 'card_pools' || Boolean(name.trim())) && (section !== 'rewards' || mode === 'copy' || (rewardTypes.some(t => t.id === kind) && pools.some(p => p.id === poolId)));
  return <div className="content-creator"><div className="head-actions"><button className="primary" disabled={disabled || busy} onClick={() => open(false)}>Crear {section === 'card_pools' ? 'pool' : section === 'cards' ? 'carta' : section === 'upgrades' ? 'mejora' : section === 'rewards' ? 'recompensa' : 'unidad'}</button><button className="secondary" disabled={disabled || busy || !selected} onClick={() => open(true)}>Duplicar selección</button></div>{saved && <p className="success-block" role="status">{saved}</p>}{mode && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-modal="true" aria-label={mode === 'copy' ? 'Duplicar contenido' : 'Crear contenido'}><h2>{mode === 'copy' ? 'Duplicar' : 'Crear'} {section === 'card_pools' ? 'pool' : section === 'cards' ? 'carta' : section === 'upgrades' ? 'mejora' : section === 'rewards' ? 'recompensa' : 'unidad'}</h2><p>{source ? `Origen: ${source.name} · ${source.id}` : 'Los valores iniciales se cargan desde la plantilla de configuración.'}</p><fieldset disabled={busy}><label>ID técnico<input autoFocus value={id} maxLength={80} onChange={e => { setId(e.target.value); setPreview(undefined); }} /></label>{section !== 'card_pools' && <label>Nombre<input value={name} maxLength={120} onChange={e => { setName(e.target.value); setPreview(undefined); }} /></label>}{mode === 'new' && section === 'cards' && <label>Tipo<select value={kind} onChange={e => { setKind(e.target.value); setPreview(undefined); }}><option value="monster">Carta de unidad</option><option value="spell">Hechizo</option></select></label>}{mode === 'new' && section === 'rewards' && <><label>Tipo de recompensa<select value={kind} onChange={e => { setKind(e.target.value); setPreview(undefined); }}>{rewardTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>Pool de cartas<select value={poolId} onChange={e => { setPoolId(e.target.value); setPreview(undefined); }}><option value="" disabled>Selecciona un pool…</option>{pools.map(p => <option key={p.id}>{p.id}</option>)}</select></label><small>Referencias @ID: pools locales. Los nombres sin @ corresponden a pools del juego.</small></>}<p>{section === 'rewards' ? 'Se crea una definición independiente. Después conecta la recompensa a un nodo o evento y revisa sus ajustes. Una copia conserva los pools y otras referencias del origen.' : section === 'card_pools' ? (mode === 'copy' ? 'Se copiará la definición y se reunirán sus pertenencias en la lista cards del nuevo pool. Las cartas siguen compartidas. Revisa los miembros y usos antes de guardar.' : 'El ID identifica el pool. Se crea vacío; después podrás añadir cartas. Para usarlo en una recompensa o invocación tendrás que asignar su referencia @ID en el objeto correspondiente.') : section === 'upgrades' ? 'Se añadirá un JSON independiente. Edita las bonificaciones y descripción; después asigna la mejora en el editor del árbol.' : 'Se añadirá un JSON independiente. Revisa el arte, las mecánicas y los pools antes de usar el contenido en el juego.'}</p>{error && <div className="notice error" role="alert">{error}</div>}{preview && <div className="content-preview"><h3>Se creará en {preview.file}</h3>{preview.objects.map(object => <div key={object.section + object.id}>{object.section} · <b>{object.id}</b></div>)}{preview.warnings.map(warning => <p className="notice info" key={warning}>{warning}</p>)}<PoolCopyReview preview={preview} /><details><summary>JSON completo</summary><pre>{JSON.stringify(preview.document, null, 2)}</pre></details></div>}<div className="head-actions"><button className="ghost" onClick={() => setMode(null)}>Cancelar</button><button className="secondary" disabled={!valid} onClick={() => act(false)}>Previsualizar</button><button className="primary" disabled={!preview} onClick={() => act(true)}>Guardar {mode === 'copy' ? 'copia' : 'nuevo contenido'}</button></div></fieldset></div></div>}</div>;
}

function PoolCopyReview({ preview }: { preview: Preview }) {
  const copy = preview.poolCopy;
  if (!copy) return null;
  return <div><h3>Miembros de la copia</h3><p>{copy.directReferences} referencias directas conservadas · {copy.addedCards.length} cartas añadidas desde sus pertenencias.</p>{copy.addedCards.length > 0 && <details><summary>Cartas añadidas a la definición copiada</summary><div className="scroll-list">{copy.addedCards.map(card => <div className="link-row" key={card.file + card.id}><span>{card.name}<small>{card.id} · {card.file}</small></span></div>)}</div></details>}<details><summary>{copy.uses.length} objetos que referencian el pool origen</summary><p>Estas referencias conservarán el pool original. La lista incluye usos directos en JSON; no detecta usos desde C#.</p><div className="scroll-list">{copy.uses.map(use => <div className="link-row" key={use.section + use.file + use.id}><span>{use.name}<small>{use.section} · {use.id} · {use.file}</small></span></div>)}</div></details></div>;
}
