import {useLanguage} from './i18n';
import { useEffect, useState } from 'react';
import { api, post } from './api';
import type { ClanSnapshot } from './types';

interface Card { id: string; name: string; file: string; hash: string; level: number | null }
interface State { defaultLevel: number; maxLevel: number; maxBatchSize: number; cards: Card[]; technicalCount: number }
interface Preview { files: string[]; changes: { id: string; file: string; name: string; before: number | null; after: number | null }[] }
const identity = (card: Card) => card.file + ':' + card.id;
export function ProgressionEditor({ clan, onSaved }: { clan: ClanSnapshot; onSaved: () => void | Promise<void> }) {
 const {t}=useLanguage();
 const label=(level:number|null)=>level===null||level===0?t("Desde el inicio"):t("Nivel {level}",{level});
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [file, setFile] = useState('all');
  const [currentLevel, setCurrentLevel] = useState('all');
  const [target, setTarget] = useState(2);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{changed:boolean;count:number;backup?:string}>();
  useEffect(() => {
    let active = true;
    setBusy(true); setPreview(null); setSelected(new Set());
    api<State>(`/clans/${clan.key}/progression`).then(value => { if (active) { setState(value); setTarget(value.defaultLevel); } }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [clan.key, clan.entries]);
  const visible = state?.cards.filter(card => (file === 'all' || card.file === file) && (currentLevel === 'all' || Number(card.level ?? 0) === Number(currentLevel)) && `${card.name} ${card.id} ${card.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const chosen = state?.cards.filter(card => selected.has(identity(card))) ?? [];
  function toggle(card: Card) { const next = new Set(selected); if (next.has(identity(card))) next.delete(identity(card)); else next.add(identity(card)); setSelected(next); setPreview(null); setMessage(undefined); }
  async function act(save: boolean) {
    setBusy(true); setError(''); setMessage(undefined);
    const changes = chosen.map(card => ({ id: card.id, file: card.file, expectedHash: card.hash, level: target === 0 ? null : target }));
    try {
      if (save) {
        const result = await post<{ changed: boolean; count: number; backup?: string }>(`/clans/${clan.key}/progression/save`, { changes });
        await onSaved(); setPreview(null);
        setMessage(result);
      } else setPreview(await post<Preview>(`/clans/${clan.key}/progression/preview`, { changes }));
    } catch (e) { setError((e as Error).message); setPreview(null); }
    finally { setBusy(false); }
  }
  return <div className="panel content-panel progression-editor"><h2>{t("Editar desbloqueos")}</h2><p>{t("Selecciona cartas de draft y asigna cuándo estarán disponibles. El inicio elimina el campo de desbloqueo. Iniciales, campeones y habilidades quedan fuera de esta edición; {count} cartas técnicas conservan su nivel.",{count:state?.technicalCount??0})}</p>{error && <div className="notice error">{t(error)}</div>}{message && <div className="success-block">{message.changed?t("{count} desbloqueos guardados. Copias originales: {backup}",{count:message.count,backup:message.backup??"—"}):t("Sin cambios.")}</div>}<div className="filters"><input aria-label={t("Buscar cartas de progresión")} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Buscar nombre, ID o archivo…")} /><select aria-label={t("Archivo de cartas")} value={file} onChange={e => setFile(e.target.value)}><option value="all">{t("Todos los archivos")}</option>{[...new Set(state?.cards.map(card => card.file) ?? [])].map(file => <option key={file}>{file}</option>)}</select><select aria-label={t("Nivel actual")} value={currentLevel} onChange={e => setCurrentLevel(e.target.value)}><option value="all">{t("Todos los niveles actuales")}</option>{Array.from({ length: (state?.maxLevel ?? 0) + 1 }, (_, level) => <option key={level} value={level}>{label(level)}</option>)}</select></div><div className="head-actions"><button className="secondary" disabled={busy || !visible.length} onClick={() => { setSelected(new Set(visible.slice(0, state?.maxBatchSize).map(identity))); setPreview(null); }}>{t("Seleccionar visibles (máx. {max})",{max:state?.maxBatchSize??"—"})}</button><button className="ghost" disabled={busy || !chosen.length} onClick={() => { setSelected(new Set()); setPreview(null); }}>{t("Quitar selección")}</button><span>{t("{chosen} seleccionadas · {visible} visibles",{chosen:chosen.length,visible:visible.length})}</span></div><div className="table-panel progression-table"><table><thead><tr><th>{t("Seleccionar")}</th><th>{t("Carta")}</th><th>{t("Nivel actual")}</th><th>{t("Archivo")}</th></tr></thead><tbody>{visible.map(card => <tr key={identity(card)}><td><input type="checkbox" aria-label={t("Seleccionar {name}",{name:card.name})} checked={selected.has(identity(card))} disabled={busy || (!selected.has(identity(card)) && chosen.length >= (state?.maxBatchSize ?? 0))} onChange={() => toggle(card)} /></td><td><strong>{card.name}</strong><small>{card.id}</small></td><td>{label(card.level)}</td><td>{card.file}</td></tr>)}</tbody></table></div>{!visible.length && !busy && <p>{t("Ninguna carta coincide con los filtros.")}</p>}<div className="head-actions"><label>{t("Nivel nuevo")}<select disabled={busy} value={target} onChange={e => { setTarget(Number(e.target.value)); setPreview(null); }}>{Array.from({ length: (state?.maxLevel ?? 0) + 1 }, (_, level) => <option key={level} value={level}>{label(level)}</option>)}</select></label><button className="secondary" disabled={busy || !chosen.length} onClick={() => act(false)}>{t("Previsualizar desbloqueos")}</button></div>{preview && <div className="preview"><p>{t("{count} cambios en {files} archivos.",{count:preview.changes.length,files:preview.files.length})}</p><div className="scroll-list">{preview.changes.map(change => <div className="link-row" key={change.file + change.id}><span>{change.name}<small>{change.file}</small></span><span>{label(change.before)} → {label(change.after)}</span></div>)}</div><button className="primary" disabled={busy || !preview.changes.length} onClick={() => act(true)}>{t("Guardar desbloqueos")}</button></div>}</div>;
}
