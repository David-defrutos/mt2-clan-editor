import { useState } from 'react';
import { ContentCreator } from './content-creator';
import type { ClanSnapshot, Entry } from './types';

export function UpgradeCatalog({ clan, onOpen, onSaved }: { clan: ClanSnapshot; onOpen: (entry: Entry) => void; onSaved: () => void | Promise<void> }) {
  const [query, setQuery] = useState('');
  const [file, setFile] = useState('all');
  const [selected, setSelected] = useState<{ id: string; file: string }>();
  const entries = clan.entries.filter(e => e.section === 'upgrades');
  const active = entries.find(e => e.id === selected?.id && e.file === selected.file);
  const visible = entries.filter(e => (file === 'all' || e.file === file) && `${e.name} ${e.id} ${e.file}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const unique = active && entries.filter(e => e.id === active.id).length === 1 && active.data.id === active.id ? active : undefined;
  return <section className="panel content-panel upgrade-catalog"><h2>Catálogo de mejoras</h2><p>Crea o duplica una mejora, edita sus bonificaciones y después asígnala a un nivel desde <b>Editar árbol de sendas</b>. El catálogo incluye mejoras de cartas y de campeones; revisa su uso antes de elegirlas.</p>
    <ContentCreator clan={clan} section="upgrades" selected={unique} onSaved={async () => { setQuery(''); setFile('all'); setSelected(undefined); await onSaved(); }} />
    <div className="filters"><input aria-label="Buscar mejora" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, ID o archivo…" /><select aria-label="Archivo de mejoras" value={file} onChange={e => setFile(e.target.value)}><option value="all">Todos los archivos</option>{[...new Set(entries.map(e => e.file))].sort().map(f => <option key={f}>{f}</option>)}</select><button className="ghost" onClick={() => { setQuery(''); setFile('all'); }}>Limpiar filtros</button><span>{visible.length} mejoras visibles</span></div>
    <div className="table-panel progression-table"><table><thead><tr><th>Elegir para copiar</th><th>Mejora</th><th>Δ Ataque</th><th>Δ Salud</th><th>Δ Tamaño</th><th>Editar</th></tr></thead><tbody>{visible.map(e => <tr key={e.file + e.id + e.index} className={e === active ? 'selected-row' : ''}><td><input type="radio" name="upgrade-source" aria-label={`Elegir ${e.name} para copiar`} checked={e === active} disabled={entries.filter(c => c.id === e.id).length !== 1 || e.data.id !== e.id} onChange={() => setSelected({ id: e.id, file: e.file })} /></td><td><strong>{e.name}</strong><small>{e.id} · {e.file}</small></td>{['bonus_damage', 'bonus_hp', 'bonus_size'].map(field => <td key={field}>{String(e.data[field] ?? 0)}</td>)}<td><button className="secondary" onClick={() => onOpen(e)}>Abrir mejora</button></td></tr>)}</tbody></table></div>
    {!visible.length && <p>No hay mejoras que coincidan con los filtros. Puedes crear una desde la plantilla.</p>}
  </section>;
}
