import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, post } from './api';
import { StatsView } from './stats-view';
import { ProgressionEditor } from './progression-editor';
import { ChampionsView } from './champions-view';
import { CharacterPreview } from './character-preview';
import type { AssetInfo, ClanSnapshot, ClanStats, Config, Entry, FieldRule, Issue, LibraryItem, StatsItem } from './types';
import './style.css';

type Page = 'library' | 'create' | 'stats' | 'overview' | 'champions' | 'cards' | 'units' | 'objects' | 'progression' | 'pools' | 'mechanics' | 'assets' | 'character-art' | 'validation' | 'publish';
type Status = { kind: 'error' | 'success' | 'info'; text: string } | null;

function valueAt(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined, data);
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []; }
function text(value: unknown): string { return value === undefined || value === null ? '—' : String(value); }
function short(value: string): string { return value.length > 65 ? '…' + value.slice(-64) : value; }

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [clan, setClan] = useState<ClanSnapshot | null>(null);
  const [page, setPage] = useState<Page>('library');
  const [selected, setSelected] = useState<{ section: string; id: string; file: string } | null>(null);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('all');
  const [kind, setKind] = useState('all');
  const [pool, setPool] = useState('all');
  const [level, setLevel] = useState(0);
  const [pathInput, setPathInput] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<ClanStats[]>([]);

  const refreshLibrary = async () => setLibrary(await api<LibraryItem[]>('/library'));
  const refreshClan = async (key: string) => setClan(await api<ClanSnapshot>('/clans/' + key));
  useEffect(() => { Promise.all([api<Config>('/config'), api<LibraryItem[]>('/library')]).then(([c, l]) => { setConfig(c); setLibrary(l); }).catch(error => setStatus({ kind: 'error', text: error.message })); }, []);
  useEffect(() => { if (page === 'stats') api<{ clans: ClanStats[] }>('/stats').then(value => setStats(value.clans)).catch(error => setStatus({ kind: 'error', text: error.message })); }, [page, library]);

  const entries = clan?.entries ?? [];
  const cards = entries.filter(entry => entry.section === 'cards');
  const selectedEntry = selected ? entries.find(entry => entry.section === selected.section && entry.id === selected.id && entry.file === selected.file) : undefined;
  const allPools = useMemo(() => [...new Set(cards.flatMap(card => strings(card.data.pools)))].sort(), [clan]);
  const cardList = useMemo(() => cards.filter(card => {
    const q = query.toLocaleLowerCase();
    return (!q || (card.name + ' ' + card.id).toLocaleLowerCase().includes(q)) &&
      (rarity === 'all' || card.data.rarity === rarity) && (kind === 'all' || card.data.card_type === kind) &&
      (pool === 'all' || strings(card.data.pools).includes(pool));
  }), [clan, query, rarity, kind, pool]);

  async function openClan(key: string) {
    setBusy(true); setStatus(null);
    try { await refreshClan(key); setPage('overview'); setSelected(null); setQuery(''); }
    catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  async function inspectStat(key: string, item: StatsItem) {
    setBusy(true); setStatus(null);
    try {
      const next = await api<ClanSnapshot>('/clans/' + key);
      if (!next.entries.some(entry => entry.file === item.file && entry.section === item.section && entry.id === item.id)) throw new Error('El objeto ha cambiado o ya no existe. Actualiza las estadísticas.');
      setClan(next); setSelected({ file: item.file, section: item.section!, id: item.id! }); setPage('objects');
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  async function addFolder(input: string) {
    if (!input.trim()) return;
    setBusy(true); setStatus(null);
    try {
      const item = await post<LibraryItem>('/library', { path: input.trim() });
      await refreshLibrary(); setPathInput(''); await openClan(item.key);
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  async function create(input: { destination: string; name: string; id: string; author: string; champions: string[]; starters: string[]; draftCount: number }) {
    setBusy(true); setStatus(null);
    try {
      const item = await post<LibraryItem>('/create', input);
      await refreshLibrary(); await openClan(item.key);
      setStatus({ kind: 'success', text: 'Proyecto creado. Las imágenes son marcadores pendientes de sustituir; revisa mecánicas y validación antes de usarlo en el juego.' });
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  async function browse() {
    setBusy(true);
    try { const picked = await post<{ path: string }>('/pick-folder', {}); if (picked.path) await addFolder(picked.path); }
    catch (error) { setStatus({ kind: 'error', text: `No se pudo abrir el selector: ${(error as Error).message}. Puedes pegar la ruta.` }); }
    finally { setBusy(false); }
  }
  async function remove(key: string) {
    if (!window.confirm('Quitar esta carpeta de la biblioteca? No se borrarán sus archivos.')) return;
    try { await api('/library/' + key, { method: 'DELETE' }); await refreshLibrary(); if (clan?.key === key) { setClan(null); setPage('library'); } }
    catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
  }
  function openEntry(entry: Entry) { setSelected({ section: entry.section, id: entry.id, file: entry.file }); }
  function navigate(next: Page) { setPage(next); setSelected(null); setStatus(null); }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">MT</div><div><strong>Clan Editor</strong><small>Monster Train 2</small></div></div>
      <div className="sidebar-caption">ESPACIO DE TRABAJO</div>
      {(config?.navigation.global ?? []).map(item => <button key={item.id} className={'nav-item ' + (page === item.id ? 'active' : '')} onClick={() => navigate(item.id as Page)}><span>{item.icon}</span>{item.label}</button>)}
      {clan && <><div className="sidebar-caption clan-caption">CLAN ACTIVO</div><div className="sidebar-clan" title={clan.root}>{clan.name}<small>{short(clan.root)}</small></div>
        {(config?.navigation.clan ?? []).map(item => <button key={item.id} className={'nav-item ' + (page === item.id ? 'active' : '')} onClick={() => navigate(item.id as Page)}><span>{item.icon}</span>{item.label}{item.id === 'validation' && clan.issues.length > 0 && <em>{clan.issues.length}</em>}</button>)}</>}
      <div className="sidebar-bottom">Primera versión · Desarrollo en curso</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumbs">Biblioteca {clan && <> / <b>{clan.name}</b></>} {page !== 'library' && <> / <span>{config?.navigation.clan.concat(config.navigation.global).find(x => x.id === page)?.label ?? (page === 'create' ? 'Crear clan' : page)}</span></>}</div><div className="top-actions"><span className="pill">Local</span><button className="ghost" onClick={() => clan && refreshClan(clan.key)} disabled={!clan || busy}>↻ Actualizar</button></div></header>
      <div className="content">
        {status && <div className={'notice ' + status.kind}><span>{status.text}</span><button onClick={() => setStatus(null)}>×</button></div>}
        {page === 'library' && <LibraryView items={library} onOpen={openClan} onRemove={remove} pathInput={pathInput} setPathInput={setPathInput} onAdd={addFolder} onBrowse={browse} busy={busy} onStats={() => navigate('stats')} onCreate={() => navigate('create')} />}
        {page === 'create' && config && <CreateView onCreate={create} onCancel={() => navigate('library')} busy={busy} creation={config.creation} />}
        {page === 'stats' && <StatsView stats={stats} metrics={config?.stats.metrics ?? []} maxLevel={config?.stats.progressionMaxLevel ?? 10} onOpen={openClan} onInspect={inspectStat} />}
        {clan && page === 'overview' && <Overview clan={clan} onGo={navigate} />}
        {clan && page === 'champions' && <ChampionsView key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} onOpen={entry => { navigate('objects'); openEntry(entry); }} />}
        {clan && page === 'cards' && <><div className="page-head"><div><div className="eyebrow">CONTENIDO</div><h1>Cartas</h1><p>{cardList.length} de {cards.length} cartas. Selecciona una para ver sus datos y editar campos guiados.</p></div></div>
          <div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar nombre o ID…" aria-label="Buscar cartas" /><select value={rarity} onChange={e => setRarity(e.target.value)}><option value="all">Todas las rarezas</option>{['common','uncommon','rare','champion'].map(x => <option key={x}>{x}</option>)}</select><select value={kind} onChange={e => setKind(e.target.value)}><option value="all">Todos los tipos</option>{['monster','spell','equipment','room','blight'].map(x => <option key={x}>{x}</option>)}</select><select value={pool} onChange={e => setPool(e.target.value)}><option value="all">Todos los pools</option>{allPools.map(x => <option key={x}>{x}</option>)}</select><button className="ghost" onClick={() => { setQuery(''); setRarity('all'); setKind('all'); setPool('all'); }}>Limpiar</button></div>
          <div className={'split ' + (selectedEntry ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>Carta</th><th>Tipo</th><th>Rareza</th><th>Ember</th><th>Desbloqueo</th><th>Pool</th></tr></thead><tbody>{cardList.map(entry => <tr key={entry.file+entry.id} onClick={() => openEntry(entry)} className={selectedEntry?.id === entry.id ? 'selected-row' : ''}><td><strong>{entry.name}</strong><small>{entry.id}</small></td><td>{text(entry.data.card_type)}</td><td><span className={'rarity '+String(entry.data.rarity ?? '')}>{text(entry.data.rarity)}</span></td><td>{text(entry.data.cost)}</td><td>{entry.data.unlock_level === undefined ? 'Inicio' : `Nivel ${entry.data.unlock_level}`}</td><td className="muted">{strings(entry.data.pools).join(', ') || '—'}</td></tr>)}</tbody></table>{cardList.length === 0 && <div className="empty-inline">Ninguna carta coincide con los filtros.</div>}</div>{selectedEntry && <Inspector entry={selectedEntry} clan={clan} rules={config?.fields[selectedEntry.section] ?? []} assignments={config?.mechanics.assignments ?? []} onClose={() => setSelected(null)} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}</div></>}
        {clan && page === 'units' && <Units clan={clan} rules={config?.fields.characters ?? []} assignments={config?.mechanics.assignments ?? []} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}
        {clan && page === 'objects' && <ObjectExplorer key={clan.key} clan={clan} initialSelected={selected} fields={config?.fields ?? {}} assignments={config?.mechanics.assignments ?? []} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}
        {clan && page === 'progression' && <><Progression clan={clan} cards={cards} level={level} setLevel={setLevel} draftPools={config?.stats.draftPools ?? []} bannerPool={config?.stats.bannerPool ?? ''} maxLevel={config?.stats.progressionMaxLevel ?? 10} technicalLevels={config?.stats.technicalUnlockLevels ?? []} onOpen={entry => { navigate('cards'); openEntry(entry); }} /><ProgressionEditor key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} /></>}
        {clan && page === 'pools' && <Pools clan={clan} cards={cards} onOpen={entry => { navigate('cards'); openEntry(entry); }} />}
        {clan && page === 'mechanics' && <Mechanics clan={clan} onOpen={openEntry} selected={selectedEntry} onClose={() => setSelected(null)} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}
        {clan && page === 'assets' && <Assets clan={clan} />}
        {clan && page === 'character-art' && <CharacterPreview key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} onOpen={entry => { navigate('objects'); openEntry(entry); }} />}
        {clan && page === 'validation' && <Validation clan={clan} />}
        {clan && page === 'publish' && <Publish clan={clan} />}
      </div>
    </main>
  </div>;
}

function LibraryView(props: { items: LibraryItem[]; onOpen: (key: string) => void; onRemove: (key: string) => void; pathInput: string; setPathInput: (x: string) => void; onAdd: (x: string) => void; onBrowse: () => void; busy: boolean; onStats: () => void; onCreate: () => void }) {
  return <><div className="page-head"><div><div className="eyebrow">ESPACIO DE TRABAJO</div><h1>Biblioteca de clanes</h1><p>Abre una carpeta existente para recorrer sus cartas, campeones y recursos sin modificarla.</p></div><div className="head-actions"><button className="primary" onClick={props.onCreate}>Crear clan</button><button className="secondary" onClick={props.onStats}>Comparar clanes →</button></div></div>
    <div className="panel add-panel"><div><strong>Añadir un clan</strong><p>Selecciona la carpeta que contiene <code>json/</code>, <code>textures/</code> y los archivos del mod.</p></div><div className="add-controls"><input value={props.pathInput} onChange={e => props.setPathInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && props.onAdd(props.pathInput)} placeholder="Ruta de la carpeta del clan" /><button className="secondary" onClick={props.onBrowse} disabled={props.busy}>Examinar…</button><button className="primary" onClick={() => props.onAdd(props.pathInput)} disabled={props.busy || !props.pathInput.trim()}>Añadir</button></div></div>
    <div className="section-heading"><h2>Carpetas conocidas</h2><span>{props.items.length} clanes</span></div>
    {props.items.length === 0 ? <div className="empty-state"><div className="empty-symbol">▦</div><h3>La biblioteca está vacía</h3><p>Añade una carpeta para comenzar. El editor solo la leerá hasta que guardes un cambio.</p></div> : <div className="library-grid">{props.items.map(item => <div className="panel library-card" key={item.key}><div className="folder-icon">▣</div><div className="library-info"><h3>{item.root.replaceAll('\\','/').split('/').pop()}</h3><p title={item.root}>{short(item.root)}</p><small>Añadido {new Date(item.addedAt).toLocaleDateString('es-ES')}</small></div><div className="library-actions"><button className="primary" onClick={() => props.onOpen(item.key)}>Abrir →</button><button className="ghost danger" onClick={() => props.onRemove(item.key)}>Quitar</button></div></div>)}</div>}
  </>;
}

function CreateView({ onCreate, onCancel, busy, creation }: { onCreate: (input: { destination: string; name: string; id: string; author: string; champions: string[]; starters: string[]; draftCount: number }) => void; onCancel: () => void; busy: boolean; creation: Config['creation'] }) {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [author, setAuthor] = useState('');
  const [destination, setDestination] = useState('');
  const [champions, setChampions] = useState(['', '']);
  const [starters, setStarters] = useState(['', '']);
  const [draftCount, setDraftCount] = useState(creation.defaultDraftCards);
  function update(list: string[], setter: (items: string[]) => void, index: number, value: string) { setter(list.map((item, i) => i === index ? value : item)); }
  const valid = /^[A-Za-z][A-Za-z0-9_]{2,39}$/.test(id) && Boolean(name.trim() && author.trim() && destination.trim() && champions.every(Boolean) && starters.every(Boolean)) && Number.isInteger(draftCount) && draftCount >= creation.minimumDraftCards && draftCount <= creation.maximumDraftCards;
  return <><div className="page-head"><div><div className="eyebrow">NUEVO PROYECTO</div><h1>Crear clan</h1><p>Se generarán dos campeones, tres sendas por campeón, dos cartas iniciales, N cartas de draft, pools, estandarte, fuente C# y arte marcador.</p></div></div><div className="create-grid"><div className="panel content-panel"><h2>Identidad y carpeta</h2><label>Nombre<input value={name} onChange={e => { setName(e.target.value); if (!id) setId(e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'')); }} placeholder="Mi clan" /></label><label>ID técnico<input value={id} onChange={e => setId(e.target.value)} placeholder="MiClan" /></label><label>Autor o namespace de Thunderstore<input value={author} onChange={e => setAuthor(e.target.value)} placeholder="TuNombre" /></label><label>Carpeta nueva de destino<input value={destination} onChange={e => setDestination(e.target.value)} placeholder="D:\\Juegos\\MT2_mod\\MiClan" /></label><p>La carpeta contenedora debe existir; la carpeta final todavía no.</p></div><div className="panel content-panel"><h2>Contenido inicial</h2>{[0,1].map(index => <div className="create-pair" key={index}><h3>Campeón {index+1}</h3><label>Nombre<input value={champions[index]} onChange={e => update(champions, setChampions, index, e.target.value)} /></label><label>Carta inicial<input value={starters[index]} onChange={e => update(starters, setStarters, index, e.target.value)} /></label></div>)}<label>Cartas de draft<input type="number" min={creation.minimumDraftCards} max={creation.maximumDraftCards} value={draftCount} onChange={e => setDraftCount(Number(e.target.value))} /></label><p>Al menos {creation.minimumDraftCards} para el estandarte.</p></div></div><div className="head-actions create-actions"><button className="ghost" onClick={onCancel}>Cancelar</button><button className="primary" disabled={!valid || busy} onClick={() => onCreate({ destination, name, id, author, champions, starters, draftCount })}>{busy ? 'Creando…' : 'Crear proyecto'}</button></div></>;
}

function Overview({ clan, onGo }: { clan: ClanSnapshot; onGo: (page: Page) => void }) {
  const cards = clan.sections.cards ?? 0;
  const classEntry = clan.entries.find(entry => entry.section === 'classes');
  const champions = Array.isArray(classEntry?.data.champions) ? classEntry.data.champions.length : 0;
  const tiles = [{ label: 'Campeones', value: champions, page: 'champions' }, { label: 'Cartas', value: cards, page: 'cards' }, { label: 'Pools', value: clan.sections.card_pools ?? 0, page: 'pools' }, { label: 'Texturas', value: clan.textureCount, page: 'assets' }, { label: 'Efectos', value: clan.sections.effects ?? 0, page: 'mechanics' }, { label: 'Avisos', value: clan.issues.length, page: 'validation' }] as const;
  return <><div className="page-head"><div><div className="eyebrow">CLAN ACTIVO</div><h1>{clan.name}</h1><p>{clan.classId} · {short(clan.root)}</p></div><div className="head-actions"><span className="pill">{clan.hasSource ? 'Fuente disponible' : 'Sin fuente'}</span><span className="pill">{clan.files.length} JSON</span></div></div>
    <div className="metric-grid">{tiles.map(tile => <button className="metric panel" key={tile.label} onClick={() => onGo(tile.page)}><span>{tile.label}</span><strong>{tile.value}</strong><small>Ver sección →</small></button>)}</div>
    <div className="two-col"><div className="panel content-panel"><h2>Estructura del clan</h2><p>La clase puede estar en cualquier JSON; el lector identifica las secciones por su contenido.</p><div className="section-list">{Object.entries(clan.sections).sort((a,b) => b[1]-a[1]).slice(0,12).map(([name,count]) => <div key={name}><span>{name}</span><b>{count}</b></div>)}</div></div><div className="panel content-panel"><h2>Estado de lectura</h2>{clan.issues.length === 0 ? <div className="success-block">✓ Todos los JSON analizados sin errores de sintaxis o IDs duplicados.</div> : clan.issues.slice(0,6).map((issue,i) => <div className="issue-row" key={i}><b>{issue.code}</b><span>{issue.message}</span></div>)}<button className="secondary full" onClick={() => onGo('validation')}>Ver validación</button></div></div>
  </>;
}

type Assignment = Config['mechanics']['assignments'][number];
function Units({ clan, rules, assignments, onSaved, setStatus }: { clan: ClanSnapshot; rules: FieldRule[]; assignments: Assignment[]; onSaved: () => void; setStatus: (s: Status) => void }) {
  const units = clan.entries.filter(entry => entry.section === 'characters');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selected = units.find(entry => entry.id === selectedId);
  const filtered = units.filter(entry => (entry.name + ' ' + entry.id).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <><div className="page-head"><div><div className="eyebrow">PERSONAJES</div><h1>Unidades</h1><p>{units.length} personajes. Edita ataque, salud, tamaño y datos avanzados en el inspector.</p></div></div><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar unidad…" /></div><div className={'split ' + (selected ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>Unidad</th><th>Ataque</th><th>Salud</th><th>Tamaño</th><th>Archivo</th></tr></thead><tbody>{filtered.map(entry => <tr key={entry.file+entry.id} onClick={() => setSelectedId(entry.id)} className={selectedId === entry.id ? 'selected-row' : ''}><td><strong>{entry.name}</strong><small>{entry.id}</small></td><td>{text(entry.data.attack_damage)}</td><td>{text(entry.data.health)}</td><td>{text(entry.data.size)}</td><td className="muted">{entry.file}</td></tr>)}</tbody></table></div>{selected && <Inspector entry={selected} clan={clan} rules={rules} assignments={assignments} onClose={() => setSelectedId('')} onSaved={onSaved} setStatus={setStatus} />}</div></>;
}

function ObjectExplorer({ clan, fields, assignments, onSaved, setStatus, initialSelected }: { clan: ClanSnapshot; fields: Record<string, FieldRule[]>; assignments: Assignment[]; onSaved: () => void; setStatus: (s: Status) => void; initialSelected?: { file: string; section: string; id: string } | null }) {
  const [section, setSection] = useState(initialSelected?.section ?? 'all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<{ file: string; section: string; id: string } | null>(initialSelected ?? null);
  const sections = Object.entries(clan.sections).sort((a, b) => a[0].localeCompare(b[0]));
  const filtered = clan.entries.filter(entry => (section === 'all' || entry.section === section) && (entry.name + ' ' + entry.id + ' ' + entry.file).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const active = selected && clan.entries.find(entry => entry.file === selected.file && entry.section === selected.section && entry.id === selected.id);
  return <><div className="page-head"><div><div className="eyebrow">ESTRUCTURA COMPLETA</div><h1>Todos los objetos</h1><p>{clan.entries.length} objetos en {sections.length} secciones. Esta vista da acceso a definiciones que aún no tienen pantalla especializada.</p></div></div><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar nombre, ID o archivo…" /><select value={section} onChange={e => { setSection(e.target.value); setSelected(null); }}><option value="all">Todas las secciones</option>{sections.map(([name,count]) => <option value={name} key={name}>{name} ({count})</option>)}</select><span className="pill">{filtered.length} resultados</span></div><div className={'split ' + (active ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>Objeto</th><th>Sección</th><th>Archivo</th></tr></thead><tbody>{filtered.map(entry => <tr key={entry.file+entry.section+entry.id} onClick={() => setSelected({ file: entry.file, section: entry.section, id: entry.id })} className={active === entry ? 'selected-row' : ''}><td><strong>{entry.name}</strong><small>{entry.id}</small></td><td>{entry.section}</td><td className="muted">{entry.file}</td></tr>)}</tbody></table></div>{active && <Inspector entry={active} clan={clan} rules={fields[active.section] ?? []} assignments={assignments} onClose={() => setSelected(null)} onSaved={onSaved} setStatus={setStatus} />}</div></>;
}

function Inspector({ entry, clan, rules, assignments, onClose, onSaved, setStatus }: { entry: Entry; clan: ClanSnapshot; rules: FieldRule[]; assignments: Assignment[]; onClose: () => void; onSaved: () => void; setStatus: (s: Status) => void }) {
  const [field, setField] = useState(rules[0]?.path ?? '');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<{ changed: boolean; before: unknown; after: unknown } | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => { setField(rules[0]?.path ?? ''); setPreview(null); }, [entry.id, entry.file]);
  useEffect(() => { const rule = rules.find(r => r.path === field); const current = valueAt(entry.data, field); setValue(rule?.type === 'string-list' ? strings(current).join(', ') : current === undefined || current === null ? '' : String(current)); setPreview(null); }, [entry.id, entry.hash, field]);
  const rule = rules.find(r => r.path === field);
  function parsed(): unknown {
    if (!rule) throw new Error('Campo no disponible.');
    if (rule.optional && value.trim() === '') return null;
    if (rule.type === 'number') { const n = Number(value); if (!Number.isFinite(n) || value.trim() === '') throw new Error('Introduce un número válido.'); return n; }
    if (rule.type === 'string-list') return value.split(',').map(x => x.trim()).filter(Boolean);
    return value;
  }
  async function act(save: boolean) {
    setWorking(true);
    try {
      const payload = { key: clan.key, section: entry.section, id: entry.id, file: entry.file, field, value: parsed(), expectedHash: entry.hash };
      if (save) { const result = await post<{ changed: boolean }>('/edit/save', payload); setStatus({ kind: 'success', text: result.changed ? `Cambio guardado en ${entry.file}. Se creó una copia de seguridad.` : 'No había cambios que guardar.' }); setPreview(null); onSaved(); }
      else setPreview(await post('/edit/preview', payload));
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setWorking(false); }
  }
  return <aside className="panel inspector"><div className="inspector-head"><div><div className="eyebrow">{entry.section}</div><h2>{entry.name}</h2><small>{entry.id}</small></div><button className="close" onClick={onClose}>×</button></div><div className="file-ref">{entry.file}</div>
    {rules.length > 0 && <div className="edit-box"><h3>Editar campo</h3><label>Campo<select value={field} onChange={e => setField(e.target.value)}>{rules.map(r => <option key={r.path} value={r.path}>{r.label}</option>)}</select></label><label>{rule?.label}{rule?.type === 'textarea' ? <textarea value={value} onChange={e => setValue(e.target.value)} /> : rule?.type === 'select' ? <select value={value} onChange={e => setValue(e.target.value)}><option value="">—</option>{rule.options?.map(x => <option key={x}>{x}</option>)}</select> : <input type={rule?.type === 'number' ? 'number' : 'text'} value={value} onChange={e => setValue(e.target.value)} placeholder={rule?.optional ? 'Sin campo explícito' : ''} />}</label>{rule?.type === 'string-list' && <small>Separa los valores con comas.</small>}<button className="secondary full" disabled={working} onClick={() => act(false)}>Previsualizar cambio</button>{preview && <div className="preview"><div>Antes: <b>{JSON.stringify(preview.before) ?? 'sin campo'}</b></div><div>Después: <b>{JSON.stringify(preview.after) ?? 'sin campo'}</b></div><button className="primary full" disabled={!preview.changed || working} onClick={() => act(true)}>Guardar este campo</button></div>}</div>}
    <MechanismPicker entry={entry} clan={clan} assignments={assignments} onSaved={onSaved} setStatus={setStatus} />
    <AdvancedEditor entry={entry} clan={clan} onSaved={onSaved} setStatus={setStatus} />
  </aside>;
}

function AdvancedEditor({ entry, clan, onSaved, setStatus }: { entry: Entry; clan: ClanSnapshot; onSaved: () => void; setStatus: (s: Status) => void }) {
  const [json, setJson] = useState(() => JSON.stringify(entry.data, null, 2));
  const [preview, setPreview] = useState<{ changed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setJson(JSON.stringify(entry.data, null, 2)); setPreview(null); }, [entry.id, entry.file, entry.hash]);
  async function act(save: boolean) {
    setBusy(true);
    try {
      const payload = { key: clan.key, section: entry.section, id: entry.id, file: entry.file, json, expectedHash: entry.hash };
      if (save) {
        const result = await post<{ changed: boolean }>('/object/save', payload);
        setStatus({ kind: 'success', text: result.changed ? `Objeto guardado en ${entry.file}. Se creó una copia de seguridad.` : 'No había cambios que guardar.' });
        setPreview(null); onSaved();
      } else setPreview(await post('/object/preview', payload));
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  return <details className="raw-json"><summary>Edición avanzada · JSON</summary><p className="muted">Puedes editar cualquier parámetro de este objeto. El ID se mantiene fijo para proteger sus referencias.</p><textarea className="json-editor" aria-label={`JSON de ${entry.id}`} spellCheck={false} value={json} onChange={e => { setJson(e.target.value); setPreview(null); }} /><button className="secondary full" disabled={busy} onClick={() => act(false)}>Validar y previsualizar</button>{preview && <div className="preview"><div>{preview.changed ? 'Se modificará este objeto en su archivo.' : 'Sin cambios.'}</div><button className="primary full" disabled={!preview.changed || busy} onClick={() => act(true)}>Guardar objeto</button></div>}</details>;
}

function MechanismPicker({ entry, clan, assignments, onSaved, setStatus }: { entry: Entry; clan: ClanSnapshot; assignments: Assignment[]; onSaved: () => void; setStatus: (s: Status) => void }) {
  const choices = assignments.filter(item => item.section === entry.section);
  const [kind, setKind] = useState(choices[0]?.path ?? '');
  const [mechanism, setMechanism] = useState('');
  const [preview, setPreview] = useState<{ changed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setKind(choices[0]?.path ?? ''); setMechanism(''); setPreview(null); }, [entry.id, entry.file]);
  if (!choices.length) return null;
  const assignment = choices.find(item => item.path === kind) ?? choices[0];
  const candidates = clan.entries.filter(item => item.section === assignment.sourceSection && (!assignment.filter || item.data[assignment.filter] === true));
  function proposed() {
    if (!mechanism || !candidates.some(item => item.id === mechanism)) throw new Error('Selecciona una definición existente.');
    const data = structuredClone(entry.data);
    const reference = '@' + mechanism;
    if (assignment.mode === 'set-reference') data[assignment.path] = reference;
    else {
      const list = data[assignment.path];
      if (list !== undefined && !Array.isArray(list)) throw new Error('El campo de destino no es una lista.');
      const existing = (list ?? []) as unknown[];
      if (existing.some(item => item && typeof item === 'object' && 'id' in item && item.id === reference)) throw new Error('Esta definición ya está asignada.');
      data[assignment.path] = [...existing, { id: reference }];
    }
    return JSON.stringify(data, null, 2);
  }
  async function act(save: boolean) {
    setBusy(true);
    try {
      const payload = { key: clan.key, section: entry.section, id: entry.id, file: entry.file, expectedHash: entry.hash, json: proposed() };
      if (save) {
        const result = await post<{ changed: boolean }>('/object/save', payload);
        setStatus({ kind: 'success', text: result.changed ? `${assignment.label} asignado en ${entry.name}.` : 'Sin cambios.' });
        setPreview(null); onSaved();
      } else setPreview(await post('/object/preview', payload));
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  return <div className="edit-box mechanism-picker"><h3>Asignar mecánica existente</h3><label>Tipo<select value={kind} onChange={e => { setKind(e.target.value); setMechanism(''); setPreview(null); }}>{choices.map(item => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label><label>Definición<select value={mechanism} onChange={e => { setMechanism(e.target.value); setPreview(null); }}><option value="">Seleccionar…</option>{candidates.map(item => <option key={item.file+item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><button className="secondary full" onClick={() => act(false)} disabled={!mechanism || busy}>Previsualizar asignación</button>{preview && <div className="preview"><div>{preview.changed ? `Se asignará ${mechanism}.` : 'Sin cambios.'}</div><button className="primary full" disabled={!preview.changed || busy} onClick={() => act(true)}>Guardar asignación</button></div>}</div>;
}

function Progression({ clan, cards, level, setLevel, draftPools, bannerPool, maxLevel, technicalLevels, onOpen }: { clan: ClanSnapshot; cards: Entry[]; level: number; setLevel: (n: number) => void; draftPools: string[]; bannerPool: string; maxLevel: number; technicalLevels: number[]; onOpen: (entry: Entry) => void }) {
  const draft = cards.filter(card => strings(card.data.pools).some(p => draftPools.includes(p)) && card.data.is_an_ability !== true && card.data.rarity !== 'champion' && !technicalLevels.includes(Number(card.data.unlock_level ?? 0)));
  const available = draft.filter(card => Number(card.data.unlock_level ?? 0) <= level);
  const locked = draft.filter(card => Number(card.data.unlock_level ?? 0) > level);
  const rows = Array.from({length: maxLevel + 1},(_,n) => ({ level: n, cards: draft.filter(card => Number(card.data.unlock_level ?? 0) === n) }));
  return <><div className="page-head"><div><div className="eyebrow">DESBLOQUEOS</div><h1>Progresión del clan</h1><p>Consulta qué cartas entran en los drafts según el nivel. El patrón de referencia es Yokai.</p></div><span className="pill">{draft.length} cartas obtenibles</span></div><div className="progress-layout"><div className="panel content-panel"><h2>Por nivel</h2><div className="timeline">{rows.map(row => <button key={row.level} className={'timeline-row '+(row.level === level ? 'active' : '')} onClick={() => setLevel(row.level)}><span className="timeline-badge">{row.level === 0 ? '0' : row.level}</span><span><b>{row.level === 0 ? 'Desde el inicio' : `Nivel ${row.level}`}</b><small>{row.cards.slice(0,3).map(c => c.name).join(' · ') || 'Sin desbloqueos'}{row.cards.length > 3 ? '…' : ''}</small></span><strong>{row.cards.length}</strong></button>)}</div></div><div className="panel content-panel"><div className="sim-head"><div><div className="eyebrow">SIMULACIÓN</div><h2>Nivel {level}</h2></div><select value={level} onChange={e => setLevel(Number(e.target.value))}>{rows.map(row => <option key={row.level} value={row.level}>Nivel {row.level}</option>)}</select></div><div className="sim-counts"><div><strong>{available.length}</strong><span>disponibles</span></div><div><strong>{locked.length}</strong><span>bloqueadas</span></div><div><strong>{available.filter(c => strings(c.data.pools).includes(bannerPool)).length}</strong><span>de estandarte</span></div></div><h3>Se desbloquean ahora</h3>{rows.find(row => row.level === level)?.cards.length ? rows.find(row => row.level === level)!.cards.map(card => <button className="link-row" key={card.id} onClick={() => onOpen(card)}>{card.name}<span>→</span></button>) : <p className="muted">No hay cartas nuevas en este nivel.</p>}<h3>Aún bloqueadas</h3><div className="scroll-list">{locked.map(card => <button className="link-row" key={card.id} onClick={() => onOpen(card)}>{card.name}<span>Nivel {String(card.data.unlock_level)}</span></button>)}</div></div></div></>;
}

function Pools({ clan, cards, onOpen }: { clan: ClanSnapshot; cards: Entry[]; onOpen: (entry: Entry) => void }) {
  const names = [...new Set([...clan.entries.filter(e => e.section === 'card_pools').map(e => e.id), ...cards.flatMap(c => strings(c.data.pools))])].sort();
  const [current, setCurrent] = useState('MegaPool');
  const selected = names.includes(current) ? current : names[0];
  const members = cards.filter(card => strings(card.data.pools).includes(selected));
  return <><div className="page-head"><div><div className="eyebrow">RECOMPENSAS</div><h1>Pools</h1><p>Las cartas pueden pertenecer a pools de draft, estandarte, iniciales y recompensas auxiliares.</p></div></div><div className="pool-layout"><div className="panel pool-list">{names.map(name => <button key={name} className={name === selected ? 'active' : ''} onClick={() => setCurrent(name)}><span>{name}</span><b>{cards.filter(c => strings(c.data.pools).includes(name)).length}</b></button>)}</div><div className="panel content-panel"><div className="section-heading"><h2>{selected}</h2><span>{members.length} cartas</span></div>{members.map(card => <button className="link-row" key={card.file+card.id} onClick={() => onOpen(card)}><span>{card.name}<small>{card.id}</small></span><span>{String(card.data.rarity ?? '—')} →</span></button>)}{members.length === 0 && <p className="muted">No hay cartas declaradas en este pool.</p>}</div></div></>;
}

function Mechanics({ clan, onOpen, selected, onClose, onSaved, setStatus }: { clan: ClanSnapshot; onOpen: (e: Entry) => void; selected?: Entry; onClose: () => void; onSaved: () => void; setStatus: (s: Status) => void }) {
  const [tab, setTab] = useState('effects');
  const [q, setQ] = useState('');
  const choices = [{id:'effects',label:'Efectos'},{id:'character_triggers',label:'Triggers de unidad'},{id:'card_triggers',label:'Triggers de carta'},{id:'traits',label:'Traits'},{id:'abilities',label:'Habilidades'}];
  const list = tab === 'abilities' ? clan.entries.filter(e => e.section === 'cards' && e.data.is_an_ability === true) : clan.entries.filter(e => e.section === tab);
  const filtered = list.filter(e => (e.name+' '+e.id+' '+String(e.data.name ?? '')).toLowerCase().includes(q.toLowerCase()));
  return <><div className="page-head"><div><div className="eyebrow">CATÁLOGO DEL CLAN</div><h1>Mecánicas</h1><p>Explora y modifica las definiciones existentes del clan.</p></div></div><div className="tabs">{choices.map(x => <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => {setTab(x.id);onClose();}}>{x.label}<small>{x.id === 'abilities' ? clan.entries.filter(e => e.section === 'cards' && e.data.is_an_ability === true).length : clan.sections[x.id] ?? 0}</small></button>)}</div><div className="filters"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar mecanismo…" /></div><div className={'split '+(selected ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>Nombre / ID</th><th>Clase o trigger</th><th>Archivo</th></tr></thead><tbody>{filtered.map(e => <tr key={e.file+e.id} onClick={() => onOpen(e)}><td><strong>{e.name}</strong><small>{e.id}</small></td><td>{text(e.data.name ?? e.data.trigger)}</td><td className="muted">{e.file}</td></tr>)}</tbody></table></div>{selected && <aside className="panel inspector"><button className="close right" onClick={onClose}>×</button><h2>{selected.name}</h2><p className="muted">{selected.file}</p><AdvancedEditor entry={selected} clan={clan} onSaved={onSaved} setStatus={setStatus} /></aside>}</div></>;
}

function Assets({ clan }: { clan: ClanSnapshot }) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [state, setState] = useState('all');
  const [active, setActive] = useState<AssetInfo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setAssets([]); setError(''); api<AssetInfo[]>(`/clans/${clan.key}/assets`).then(setAssets).catch(e => setError(e.message)); }, [clan.key]);
  const categories = [...new Map(assets.map(asset => [asset.category, asset.categoryLabel])).entries()];
  const list = assets.filter(asset => (asset.id+' '+asset.image).toLowerCase().includes(q.toLowerCase()) && (category === 'all' || asset.category === category) && (state === 'all' || asset.status === state));
  function imageUrl(asset: AssetInfo) { return asset.status === 'ok' || asset.status === 'case-mismatch' ? `/api/assets/${clan.key}?file=${encodeURIComponent(asset.image)}` : ''; }
  return <><div className="page-head"><div><div className="eyebrow">IMÁGENES DEL MOD</div><h1>Recursos visuales</h1><p>{assets.length} sprites declarados · {clan.textureCount} PNG en textures/. Se clasifican según su uso y nombre.</p></div></div>{error && <div className="notice error">{error}</div>}<div className="filters"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar ID o ruta de imagen…" /><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">Todas las categorías</option>{categories.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><select value={state} onChange={e => setState(e.target.value)}><option value="all">Todos los estados</option><option value="ok">Correcto</option><option value="missing">Falta archivo</option><option value="case-mismatch">Mayúsculas distintas</option><option value="invalid-path">Ruta o imagen inválida</option></select></div><div className="asset-grid">{list.map(asset => <button className="panel asset-card" key={asset.file+asset.id} onClick={() => setActive(asset)}><div className="asset-thumb">{imageUrl(asset) ? <img src={imageUrl(asset)} loading="lazy" /> : <span>▧</span>}</div><strong>{asset.id}</strong><small>{asset.categoryLabel} · {asset.width ?? '?'} × {asset.height ?? '?'}</small><small>{asset.status === 'ok' ? `${asset.uses.length} usos` : asset.status}</small></button>)}</div>{active && <div className="modal-backdrop" onClick={() => setActive(null)}><div className="modal-card asset-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setActive(null)}>×</button><h2>{active.id}</h2>{imageUrl(active) && <img src={imageUrl(active)} />}<p>{active.image}</p><div className="section-list"><div><span>Categoría</span><b>{active.categoryLabel}</b></div><div><span>Tamaño</span><b>{active.width ?? '?'} × {active.height ?? '?'}</b></div><div><span>Estado</span><b>{active.status}</b></div></div><h3>Usado por</h3>{active.uses.length ? active.uses.map((use,i) => <div className="link-row" key={i}>{use.section} · {use.id}<small>{use.file}</small></div>) : <p className="muted">Sin referencias directas por ID.</p>}<ArtEditor clan={clan} asset={active} onSaved={() => { api<AssetInfo[]>(`/clans/${clan.key}/assets`).then(setAssets); setActive(null); }} /><small>{active.file}</small></div></div>}</>;
}

function ArtEditor({ clan, asset, onSaved }: { clan: ClanSnapshot; asset: AssetInfo; onSaved: () => void }) {
  const [imageBase64, setImageBase64] = useState('');
  const [filename, setFilename] = useState('');
  const [hash, setHash] = useState('');
  const [mode, setMode] = useState<'preserve' | 'match-existing'>(asset.category === 'card' ? 'match-existing' : 'preserve');
  const [preview, setPreview] = useState<{ changed: boolean; sourceWidth: number; sourceHeight: number; newWidth: number; newHeight: number; image: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<{hash: string}>(`/assets/${clan.key}/hash?file=${encodeURIComponent(asset.image)}`).then(result => setHash(result.hash)).catch(e => setError(e.message)); }, [clan.key, asset.image]);
  async function select(file?: File) {
    setPreview(null); setError(''); setImageBase64(''); setFilename('');
    if (!file) return;
    if (file.size > 15_000_000) { setError('La imagen supera 15 MB.'); return; }
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    setImageBase64(data.split(',')[1] ?? ''); setFilename(file.name);
  }
  async function act(save: boolean) {
    setBusy(true); setError('');
    try {
      const payload = { key: clan.key, spriteId: asset.id, file: asset.file, imageBase64, mode, expectedHash: hash };
      if (save) { await post('/art/save', payload); onSaved(); }
      else setPreview(await post('/art/preview', payload));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="art-editor"><h3>Reemplazar imagen</h3><p>Se conservará una copia de seguridad del PNG actual. El ajuste encaja la imagen dentro del tamaño actual sin recortarla.</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => select(e.target.files?.[0])} /><label>Ajuste<select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setPreview(null); }}><option value="preserve">Conservar tamaño de origen</option><option value="match-existing">Encajar en tamaño actual</option></select></label>{filename && <small>Elegida: {filename}</small>}{error && <div className="notice error">{error}</div>}<button className="secondary full" disabled={!imageBase64 || !hash || busy} onClick={() => act(false)}>Previsualizar imagen</button>{preview && <div className="art-preview"><img src={preview.image} /><p>{preview.sourceWidth} × {preview.sourceHeight} → {preview.newWidth} × {preview.newHeight}</p><button className="primary full" disabled={!preview.changed || busy} onClick={() => act(true)}>Guardar imagen</button></div>}</div>;
}

function Validation({ clan }: { clan: ClanSnapshot }) {
  const [issues, setIssues] = useState<Issue[]>(clan.issues);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  async function run() { setRunning(true); setError(''); try { setIssues(await api<Issue[]>(`/clans/${clan.key}/validation`)); } catch (e) { setError((e as Error).message); } finally { setRunning(false); } }
  useEffect(() => { void run(); }, [clan.key]);
  const visible = issues.filter(issue => filter === 'all' || issue.severity === filter);
  return <><div className="page-head"><div><div className="eyebrow">DIAGNÓSTICO</div><h1>Validación</h1><p>Comprueba estructura de campeones, cartas iniciales, coste, desbloqueos, referencias principales y recursos visuales.</p></div><button className="secondary" onClick={run} disabled={running}>{running ? 'Comprobando…' : 'Volver a validar'}</button></div>{error && <div className="notice error">{error}</div>}<div className="filters"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todas las severidades</option><option value="error">Errores</option><option value="warning">Avisos</option><option value="info">Información</option></select><span className="pill">{visible.length} resultados</span></div><div className="panel content-panel">{issues.length === 0 ? <div className="success-block">✓ Sin problemas en las comprobaciones implementadas.</div> : visible.map((issue,i) => <div className="issue-row" key={i}><span className={'severity '+issue.severity}>{issue.severity}</span><b>{issue.code}</b><span>{issue.message}</span><small>{issue.file}</small></div>)}</div></>;
}

function Publish({ clan }: { clan: ClanSnapshot }) {
  type State = { error?: string; repository?: string; branch?: string; sha?: string; remote?: string; files?: string[]; runs?: { databaseId: number; headSha: string; status: string; conclusion: string | null; url: string; workflowName: string }[]; actionsError?: string };
  type BuildState = { projects: string[]; sdkVersion: string; configuration: string; diagnostic?: string; offline: { ready: boolean; configFile: string; missing: string[]; trainworksVersion: string } };
  type BuildResult = { ok: boolean; project: string; exitCode: number; diagnostic?: string; dll?: string; sha256?: string; builtAt?: string; trainworksVersion?: string; log: string };
  const [state, setState] = useState<State | null>(null);
  const [buildState, setBuildState] = useState<BuildState | null>(null);
  const [buildProject, setBuildProject] = useState('');
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [message, setMessage] = useState('');
  const [download, setDownload] = useState<{ sha: string; destination: string; dlls: string[] } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function refresh() { setWorking(true); try { setState(await api<State>(`/clans/${clan.key}/publish`)); } catch (e) { setError((e as Error).message); } finally { setWorking(false); } }
  useEffect(() => {
    void refresh();
    setBuildResult(null);
    api<BuildState>(`/clans/${clan.key}/build`).then(value => { setBuildState(value); setBuildProject(value.projects[0] ?? ''); }).catch(e => setError((e as Error).message));
  }, [clan.key]);
  async function compileLocal(mode = 'packages') {
    setWorking(true); setError(''); setBuildResult(null);
    try { setBuildResult(await post<BuildResult>(`/clans/${clan.key}/build`, { project: buildProject, mode })); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }
  async function action(kind: 'commit' | 'push') {
    setWorking(true); setError('');
    try { setState(await post<State>(`/clans/${clan.key}/publish/${kind}`, kind === 'commit' ? { message } : {})); if (kind === 'commit') setMessage(''); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }
  async function downloadRun(runId: number) {
    setWorking(true); setError('');
    try { setDownload(await post(`/clans/${clan.key}/publish/download`, { runId })); }
    catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }
  return <><div className="page-head"><div><div className="eyebrow">GIT Y COMPILACIÓN</div><h1>Publicación</h1><p>Compila el clan en este equipo o envíalo a GitHub Actions.</p></div><button className="secondary" onClick={refresh} disabled={working}>Actualizar estado</button></div>{error && <div className="notice error">{error}</div>}
    <div className="panel content-panel"><h2>Compilación local</h2><p>SDK .NET: {buildState?.sdkVersion || 'No detectado'} · Configuración: {buildState?.configuration ?? '—'}.</p>{buildState?.diagnostic && <p>{buildState.diagnostic}</p>}{buildState?.projects.length ? <><label>Proyecto C#<select value={buildProject} onChange={e => setBuildProject(e.target.value)}>{buildState.projects.map(project => <option key={project} value={project}>{project}</option>)}</select></label><button className="primary" disabled={working || !buildState.sdkVersion || !buildProject} onClick={() => compileLocal()}>{working ? 'Compilando…' : 'Compilar DLL local'}</button><button className="secondary" disabled={working || !buildState.sdkVersion || !buildProject || !buildState.offline.ready} onClick={() => compileLocal("installed")}>Compilar con DLL instaladas</button><p>DLL locales: {buildState.offline.ready ? `Trainworks ${buildState.offline.trainworksVersion}` : `Configura ${buildState.offline.configFile}. Faltan: ${buildState.offline.missing.join(", ")}`}. Esta opción compila las fuentes C# con las referencias locales; los pasos personalizados del .csproj requieren la compilación normal.</p></> : <p>No se encontró un proyecto .csproj en la carpeta del clan.</p>}{buildResult && <><div className={buildResult.ok ? 'success-block' : 'notice error'}>{buildResult.ok ? `DLL creada: ${buildResult.dll}` : buildResult.diagnostic}{buildResult.sha256 && <div>SHA-256: {buildResult.sha256}</div>}</div><details><summary>Registro de dotnet</summary><pre>{buildResult.log}</pre></details></>}</div>
    <PackagePanel key={clan.key} clan={clan} changedAt={buildResult?.builtAt} /><div className="two-col"><div className="panel content-panel"><h2>Repositorio</h2>{state?.error ? <p>{state.error}</p> : <><div className="section-list"><div><span>Rama</span><b>{state?.branch ?? '—'}</b></div><div><span>Commit</span><b title={state?.sha}>{state?.sha?.slice(0,12) ?? '—'}</b></div><div><span>Remoto</span><b>{state?.remote || 'Sin origin'}</b></div><div><span>Fuente C#</span><b>{clan.hasSource ? 'Encontrada' : 'No encontrada'}</b></div></div><h3>Cambios del clan ({state?.files?.length ?? 0})</h3><div className="publish-files">{state?.files?.length ? state.files.map((file,i) => <div key={i}>{file}</div>) : <p className="muted">No hay cambios en esta carpeta.</p>}</div><label>Mensaje de commit<input value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe el cambio" /></label><div className="head-actions"><button className="secondary" disabled={working || !message.trim() || !state?.files?.length} onClick={() => action('commit')}>Crear commit</button><button className="primary" disabled={working || !state?.remote || Boolean(state?.files?.length)} onClick={() => action('push')}>Enviar a GitHub</button></div></>}</div><div className="panel content-panel"><h2>GitHub Actions</h2>{state?.actionsError && <p>{state.actionsError}</p>}{state?.runs?.length ? state.runs.map(run => <div className="issue-row" key={run.databaseId}><b>{run.workflowName}</b><span>{run.status} · {run.conclusion ?? 'en curso'}</span><a href={run.url} target="_blank" rel="noreferrer">Ver run ↗</a><small>{run.headSha.slice(0,12)}</small>{run.conclusion === 'success' && <button className="secondary" disabled={working} onClick={() => downloadRun(run.databaseId)}>Descargar y comprobar DLL</button>}</div>) : <p className="muted">No se encontró un workflow para este commit. Puede que no se haya enviado o que GitHub Actions aún no lo haya iniciado.</p>}{download && <div className="success-block">DLL comprobada para {download.sha.slice(0,12)}: {download.dlls.map(file => <div key={file}>{file}</div>)}</div>}<p>La descarga guarda el artefacto en data/downloads; no instala la DLL en el juego.</p></div></div></>;
}

function PackagePanel({ clan, changedAt }: { clan: ClanSnapshot; changedAt?: string }) {
  type State = { build: { dll: string; sha256: string; fresh: boolean; changed: string[] } | null; package: { destination: string; fresh: boolean; changed: string[] } | null };
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setBusy(true); setError('');
    try { setState(await api<State>(`/clans/${clan.key}/package`)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [clan.key, changedAt]);
  async function prepare() {
    setBusy(true); setError('');
    try { await post(`/clans/${clan.key}/package`, {}); setState(await api<State>(`/clans/${clan.key}/package`)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="panel content-panel"><h2>Preparar el mod para probarlo</h2><p>Reúne la DLL, los JSON y las texturas en una carpeta nueva. Guarda los hashes para comprobar si la salida sigue al día.</p>{error && <div className="notice error">{error}</div>}{state?.build ? <><p>Última DLL: {state.build.dll}</p>{!state.build.fresh && <p className="notice error">Necesita recompilar: {state.build.changed.join(', ')}</p>}</> : <p>Compila primero desde el editor para registrar la DLL.</p>}{state?.package && <><p>Carpeta preparada: {state.package.destination}</p><p className={state.package.fresh ? 'success-block' : 'notice error'}>{state.package.fresh ? 'La salida coincide con los archivos actuales.' : `Salida desactualizada: ${state.package.changed.join(', ')}`}</p></>}<div className="head-actions"><button className="secondary" disabled={busy} onClick={refresh}>Actualizar comprobación</button><button className="primary" disabled={busy || !state?.build?.fresh} onClick={prepare}>{busy ? 'Comprobando…' : 'Preparar carpeta del mod'}</button></div><p>Después puedes copiar esa carpeta a un perfil de pruebas de BepInEx. La carga en el juego debe verificarse en ese perfil.</p></div>;
}

createRoot(document.getElementById('root')!).render(<App />);



