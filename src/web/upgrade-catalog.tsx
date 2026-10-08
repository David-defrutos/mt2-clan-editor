import {useLanguage} from './i18n';
import { useState } from 'react';
import { ContentCreator } from './content-creator';
import type { ClanSnapshot, Entry } from './types';

export function UpgradeCatalog({ clan, onOpen, onSaved }: { clan: ClanSnapshot; onOpen: (entry: Entry) => void; onSaved: () => void | Promise<void> }) {
 const {t}=useLanguage();
  const [query, setQuery] = useState('');
  const [file, setFile] = useState('all');
  const [selected, setSelected] = useState<{ id: string; file: string }>();
  const entries = clan.entries.filter(e => e.section === 'upgrades');
  const active = entries.find(e => e.id === selected?.id && e.file === selected.file);
  const visible = entries.filter(e => (file === 'all' || e.file === file) && `${e.name} ${e.id} ${e.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const unique = active && entries.filter(e => e.id === active.id).length === 1 && active.data.id === active.id ? active : undefined;
  return <section className="panel content-panel upgrade-catalog"><h2>{t("Catálogo de mejoras")}</h2><p>{t("Crea o duplica una mejora, edita sus bonificaciones y después asígnala a un nivel desde")} <b>{t("Editar árbol de sendas")}</b>{t(". El catálogo incluye mejoras de cartas y de campeones; revisa su uso antes de elegirlas.")}</p>
    <ContentCreator clan={clan} section="upgrades" selected={unique} onSaved={async () => { setQuery(''); setFile('all'); setSelected(undefined); await onSaved(); }} />
    <div className="filters"><input aria-label={t("Buscar mejora")} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Nombre, ID o archivo…")} /><select aria-label={t("Archivo de mejoras")} value={file} onChange={e => setFile(e.target.value)}><option value="all">{t("Todos los archivos")}</option>{[...new Set(entries.map(e => e.file))].sort().map(f => <option key={f}>{f}</option>)}</select><button className="ghost" onClick={() => { setQuery(''); setFile('all'); }}>{t("Limpiar filtros")}</button><span>{t("{count} mejoras visibles",{count:visible.length})}</span></div>
    <div className="table-panel progression-table"><table><thead><tr><th>{t("Elegir para copiar")}</th><th>{t("Mejora")}</th><th>{t("Δ Ataque")}</th><th>{t("Δ Salud")}</th><th>{t("Δ Tamaño")}</th><th>{t("Editar")}</th></tr></thead><tbody>{visible.map(e => <tr key={e.file + e.id + e.index} className={e === active ? 'selected-row' : ''}><td><input type="radio" name="upgrade-source" aria-label={t("Elegir {name} para copiar",{name:e.name})} checked={e === active} disabled={entries.filter(c => c.id === e.id).length !== 1 || e.data.id !== e.id} onChange={() => setSelected({ id: e.id, file: e.file })} /></td><td><strong>{e.name}</strong><small>{e.id} · {e.file}</small></td>{['bonus_damage', 'bonus_hp', 'bonus_size'].map(field => <td key={field}>{String(e.data[field] ?? 0)}</td>)}<td><button className="secondary" onClick={() => onOpen(e)}>{t("Abrir mejora")}</button></td></tr>)}</tbody></table></div>
    {!visible.length && <p>{t("No hay mejoras que coincidan con los filtros. Puedes crear una desde la plantilla.")}</p>}
  </section>;
}
