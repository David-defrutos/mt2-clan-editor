import React, { useEffect, useState } from 'react';
import { api, post } from './api';
import {useLanguage} from './i18n';
import type { ClanSnapshot, Entry } from './types';

type Preview = { file: string; token: string; objects: { section: string; id: string }[]; warnings: string[]; document: Record<string, unknown>; images: string[]; poolCopy?: { directReferences: number; addedCards: { id: string; name: string; file: string }[]; uses: { id: string; name: string; file: string; section: string }[] } };
type ContentSection='cards'|'characters'|'upgrades'|'card_pools'|'rewards'|'map_nodes'|'effects'|'relic_effects'|'character_triggers'|'card_triggers'|'relics';
type ConfiguredType={id:string;label:string;links:{path:string;label:string;candidates:{id:string;name:string}[]}[]};
export function DefinitionCreator({clan,selected,onSaved,onCreated}:{clan:ClanSnapshot;selected?:Entry;onSaved:()=>void;onCreated:(section:string,id:string)=>void}){
 const {t}=useLanguage();
 const [sections,setSections]=useState<{id:ContentSection;label:string}[]>([]);const [section,setSection]=useState<ContentSection>('rewards');const [error,setError]=useState('');
 useEffect(()=>{api<{id:ContentSection;label:string}[]>('/content-sections').then(setSections).catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(selected&&sections.some(s=>s.id===selected.section))setSection(selected.section as ContentSection);},[selected?.section,sections]);
 return <section className="panel content-panel"><label>{t("Crear o duplicar definición")}<select value={section} onChange={e=>setSection(e.target.value as ContentSection)}>{sections.map(s=><option key={s.id} value={s.id}>{t(s.label)}</option>)}</select></label>{error&&<p role="alert">{t(error)}</p>}<ContentCreator key={clan.key+section} clan={clan} section={section} selected={selected?.section===section?selected:undefined} onSaved={onSaved} onCreated={id=>onCreated(section,id)}/></section>;
}
export function ContentCreator({ clan, section, selected, onSaved, disabled = false, onCreated }: { clan: ClanSnapshot; section: ContentSection; selected?: Entry; onSaved: () => void | Promise<void>; disabled?: boolean; onCreated?: (id: string) => void }) {
 const {t}=useLanguage();
  const [mode, setMode] = useState<'new' | 'copy' | null>(null);
  const [source, setSource] = useState<Entry>();
  const [id, setId] = useState(''); const [name, setName] = useState('');
  const [kind, setKind] = useState('monster');
  const [preview, setPreview] = useState<Preview>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{id:string;file:string}>();
  const [configured,setConfigured]=useState<{types:ConfiguredType[];named:boolean;label:string}>();const [links,setLinks]=useState<Record<string,string>>({});
  useEffect(()=>{let active=true;api<{types:ConfiguredType[];named:boolean;label:string}>(`/clans/${clan.key}/content-templates?section=${section}`).then(v=>{if(active){setConfigured(v);if(v.types.length)setKind(v.types[0].id);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[section,clan.key]);
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
    setPreview(undefined); setError(''); setSaved(undefined);
    setPoolId('');setLinks({});
  }
  async function act(save: boolean) {
    setBusy(true); setError('');
    try {
      const input = { section, id, name: section === 'card_pools' || configured?.named===false ? '' : name, kind, links, poolId: section === 'rewards' && !source ? poolId : undefined, source: source ? { id: source.id, file: source.file } : undefined, expectedToken: save ? preview?.token : undefined };
      if (save) {
        const result = await post<{ file: string }>(`/clans/${clan.key}/content/save`, input);
        setMode(null); setSaved({id,file:result.file}); await onSaved(); onCreated?.(id);
      } else setPreview(await post<Preview>(`/clans/${clan.key}/content/preview`, input));
    } catch (e) { setError((e as Error).message); setPreview(undefined); }
    finally { setBusy(false); }
  }
  const template=configured?.types.find(t=>t.id===kind);
  const label=configured?.types.length?configured.label:section === 'card_pools' ? 'pool' : section === 'cards' ? 'carta' : section === 'upgrades' ? 'mejora' : section === 'rewards' ? 'recompensa' : 'unidad';
  const valid = Boolean(configured) && /^[A-Za-z][A-Za-z0-9_]{2,79}$/.test(id) && (section === 'card_pools' || configured?.named===false || Boolean(name.trim())) && (mode==='copy'||!configured?.types.length||Boolean(template&&template.links.every(l=>l.candidates.some(c=>c.id===links[l.path])))) && (section !== 'rewards' || mode === 'copy' || (rewardTypes.some(t => t.id === kind) && pools.some(p => p.id === poolId)));
  return <div className="content-creator"><div className="head-actions"><button className="primary" disabled={disabled || busy} onClick={() => open(false)}>{t("Crear {label}",{label:t(label)})}</button><button className="secondary" disabled={disabled || busy || !selected} onClick={() => open(true)}>{t("Duplicar selección")}</button></div>{saved && <p className="success-block" role="status">{t("Creado {id} en {file}.",saved)}</p>}{mode && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-modal="true" aria-label={t(mode === 'copy' ? 'Duplicar contenido' : 'Crear contenido')}><h2>{t(mode === 'copy' ? 'Duplicar {label}' : 'Crear {label}',{label:t(label)})}</h2><p>{source ? t('Origen: {name} · {id}',{name:source.name,id:source.id}) : t("Los valores iniciales se cargan desde la plantilla de configuración.")}</p><fieldset disabled={busy}><label>{t("ID técnico")}<input autoFocus value={id} maxLength={80} onChange={e => { setId(e.target.value); setPreview(undefined); }} /></label>{section !== 'card_pools' && configured?.named!==false && <label>{t("Nombre")}<input value={name} maxLength={120} onChange={e => { setName(e.target.value); setPreview(undefined); }} /></label>}{mode==='new' && Boolean(configured?.types.length) && <><label>{t("Plantilla")}<select value={kind} onChange={e=>{setKind(e.target.value);setLinks({});setPreview(undefined);}}>{configured?.types.map(type=><option key={type.id} value={type.id}>{t(type.label)}</option>)}</select></label>{template?.links.map(link=><label key={link.path}>{t(link.label)}<select value={links[link.path]??''} onChange={e=>{setLinks(v=>({...v,[link.path]:e.target.value}));setPreview(undefined);}}><option value="">{t("Selecciona…")}</option>{link.candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}</select></label>)}</>}{mode === 'new' && section === 'cards' && <label>{t("Tipo")}<select value={kind} onChange={e => { setKind(e.target.value); setPreview(undefined); }}><option value="monster">{t("Carta de unidad")}</option><option value="spell">{t("Hechizo")}</option></select></label>}{mode === 'new' && section === 'rewards' && <><label>{t("Tipo de recompensa")}<select value={kind} onChange={e => { setKind(e.target.value); setPreview(undefined); }}>{rewardTypes.map(type => <option key={type.id} value={type.id}>{t(type.label)}</option>)}</select></label><label>{t("Pool de cartas")}<select value={poolId} onChange={e => { setPoolId(e.target.value); setPreview(undefined); }}><option value="" disabled>{t("Selecciona un pool…")}</option>{pools.map(p => <option key={p.id}>{p.id}</option>)}</select></label><small>{t("Referencias @ID: pools locales. Los nombres sin @ corresponden a pools del juego.")}</small></>}<p>{section === 'rewards' ? t("Se crea una definición independiente. Después conecta la recompensa a un nodo o evento y revisa sus ajustes. Una copia conserva los pools y otras referencias del origen.") : section === 'card_pools' ? (mode === 'copy' ? t("Se copiará la definición y se reunirán sus pertenencias en la lista cards del nuevo pool. Las cartas siguen compartidas. Revisa los miembros y usos antes de guardar.") : t("El ID identifica el pool. Se crea vacío; después podrás añadir cartas. Para usarlo en una recompensa o invocación tendrás que asignar su referencia @ID en el objeto correspondiente.")) : section === 'upgrades' ? t("Se añadirá un JSON independiente. Edita las bonificaciones y descripción; después asigna la mejora en el editor del árbol.") : t("Se añadirá un JSON independiente. Revisa el arte, las mecánicas y los pools antes de usar el contenido en el juego.")}</p>{error && <div className="notice error" role="alert">{t(error)}</div>}{preview && <div className="content-preview"><h3>{t("Se creará en {file}",{file:preview.file})}</h3>{preview.objects.map(object => <div key={object.section + object.id}>{object.section} · <b>{object.id}</b></div>)}{preview.warnings.map(warning => <p className="notice info" key={warning}>{t(warning)}</p>)}<PoolCopyReview preview={preview} /><details><summary>{t("JSON completo")}</summary><pre>{JSON.stringify(preview.document, null, 2)}</pre></details></div>}<div className="head-actions"><button className="ghost" onClick={() => setMode(null)}>{t("Cancelar")}</button><button className="secondary" disabled={!valid} onClick={() => act(false)}>{t("Previsualizar")}</button><button className="primary" disabled={!preview} onClick={() => act(true)}>{t(mode === 'copy' ? 'Guardar copia' : 'Guardar nuevo contenido')}</button></div></fieldset></div></div>}</div>;
}

function PoolCopyReview({ preview }: { preview: Preview }) {
 const {t}=useLanguage();
  const copy = preview.poolCopy;
  if (!copy) return null;
  return <div><h3>{t("Miembros de la copia")}</h3><p>{t("{direct} referencias directas conservadas · {added} cartas añadidas desde sus pertenencias.",{direct:copy.directReferences,added:copy.addedCards.length})}</p>{copy.addedCards.length > 0 && <details><summary>{t("Cartas añadidas a la definición copiada")}</summary><div className="scroll-list">{copy.addedCards.map(card => <div className="link-row" key={card.file + card.id}><span>{card.name}<small>{card.id} · {card.file}</small></span></div>)}</div></details>}<details><summary>{t("{count} objetos que referencian el pool origen",{count:copy.uses.length})}</summary><p>{t("Estas referencias conservarán el pool original. La lista incluye usos directos en JSON; no detecta usos desde C#.")}</p><div className="scroll-list">{copy.uses.map(use => <div className="link-row" key={use.section + use.file + use.id}><span>{use.name}<small>{use.section} · {use.id} · {use.file}</small></span></div>)}</div></details></div>;
}
