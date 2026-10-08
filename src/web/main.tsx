import {cardPoolMemberships} from './pool-memberships';
import {ExamplesPanel} from './examples-panel';
import { matchesMechanic } from './mechanic-rule';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, post } from './api';
import { StatsView } from './stats-view';
import { ProgressionEditor } from './progression-editor';
import { ChampionsView } from './champions-view';
import { CharacterPreview } from './character-preview';
import { ContentCreator, DefinitionCreator } from './content-creator';
import { DiscoveryView } from './discovery-view';
import { VisualPicker } from './visual-picker';
import { SpawnPicker } from './spawn-picker';
import { PoolPicker } from './pool-picker';
import { CharacterPoolPicker } from './character-pool-picker';
import { PoolsView } from './pools-view';
import { ArtChecklist } from './art-checklist';
import { ArtAnalysis } from './art-analysis';
import { ResourceReview } from './resource-review';
import { ReferenceEditor } from './reference-editor';
import { StatusParameter } from './status-parameter';
import { MechanicsSupport } from './mechanics-support';
import {BatchFields,DeleteDefinition} from './content-actions';
import type { AssetInfo, ClanSnapshot, ClanStats, Config, Entry, FieldRule, Issue, LibraryItem, StatsItem } from './types';
import './style.css';
import {LanguageProvider,LanguageSelector,useLanguage} from './i18n';
import {FieldSelect} from './field-select';

type Page = 'library' | 'create' | 'stats' | 'overview' | 'champions' | 'cards' | 'units' | 'objects' | 'progression' | 'pools' | 'mechanics' | 'assets' | 'character-art' | 'validation' | 'publish';
type Status = { kind: 'error' | 'success' | 'info'; text: string; values?: Record<string,string|number> } | null;

function valueAt(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, data);
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []; }
function text(value: unknown): string { return value === undefined || value === null ? '—' : String(value); }
function short(value: string): string { return value.length > 65 ? '…' + value.slice(-64) : value; }

function App() {
  const {t}=useLanguage();
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
  const memberships=(card:Entry)=>clan&&config?cardPoolMemberships(clan,card,config.poolReferences):[];
  const allPools = useMemo(() => [...new Set(cards.flatMap(card => memberships(card)))].sort(), [clan,config]);
  const cardList = useMemo(() => cards.filter(card => {
    const q = query.toLocaleLowerCase();
    return (!q || (card.name + ' ' + card.id).toLocaleLowerCase().includes(q)) &&
      (rarity === 'all' || card.data.rarity === rarity) && (kind === 'all' || card.data.card_type === kind) &&
      (pool === 'all' || memberships(card).includes(pool));
  }), [clan, query, rarity, kind, pool, config]);

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
    if (!window.confirm(t('Quitar esta carpeta de la biblioteca? No se borrarán sus archivos.'))) return;
    try { await api('/library/' + key, { method: 'DELETE' }); await refreshLibrary(); if (clan?.key === key) { setClan(null); setPage('library'); } }
    catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
  }
  function openEntry(entry: Entry) { setSelected({ section: entry.section, id: entry.id, file: entry.file }); }
  function navigate(next: Page) { setPage(next); setSelected(null); setStatus(null); }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">MT</div><div><strong>Clan Editor</strong><small>Monster Train 2</small></div></div>
      <div className="sidebar-caption">{t("ESPACIO DE TRABAJO")}</div>
      {(config?.navigation.global ?? []).map(item => <button key={item.id} className={'nav-item ' + (page === item.id ? 'active' : '')} onClick={() => navigate(item.id as Page)}><span>{item.icon}</span>{t(item.label)}</button>)}
      {clan && <><div className="sidebar-caption clan-caption">{t("CLAN ACTIVO")}</div><div className="sidebar-clan" title={clan.root}>{clan.name}<small>{short(clan.root)}</small></div>
        {(config?.navigation.clan ?? []).map(item => <button key={item.id} className={'nav-item ' + (page === item.id ? 'active' : '')} onClick={() => navigate(item.id as Page)}><span>{item.icon}</span>{t(item.label)}{item.id === 'validation' && clan.issues.length > 0 && <em>{clan.issues.length}</em>}</button>)}</>}
      <div className="sidebar-bottom">{t("Primera versión · Desarrollo en curso")}</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumbs">{t("Biblioteca")} {clan && <> / <b>{clan.name}</b></>} {page !== 'library' && <> / <span>{t(config?.navigation.clan.concat(config.navigation.global).find(x => x.id === page)?.label ?? (page === 'create' ? 'Crear clan' : page))}</span></>}</div><div className="top-actions"><LanguageSelector/><span className="pill">{t("Local")}</span><button className="ghost" onClick={() => clan && refreshClan(clan.key)} disabled={!clan || busy}>{t("↻ Actualizar")}</button></div></header>
      <div className="content">
        {status && <div className={'notice ' + status.kind}><span>{t(status.text,status.values)}</span><button onClick={() => setStatus(null)}>×</button></div>}

        {page === 'library' && <LibraryView items={library} onOpen={openClan} onRemove={remove} pathInput={pathInput} setPathInput={setPathInput} onAdd={addFolder} onBrowse={browse} busy={busy} onStats={() => navigate('stats')} onCreate={() => navigate('create')} onDiscovered={refreshLibrary} />}
        {page === 'create' && config && <CreateView onCreate={create} onCancel={() => navigate('library')} busy={busy} creation={config.creation} />}
        {page === 'stats' && <StatsView stats={stats} metrics={config?.stats.metrics ?? []} maxLevel={config?.stats.progressionMaxLevel ?? 10} onOpen={openClan} onInspect={inspectStat} />}
        {clan && page === 'overview' && <Overview clan={clan} onGo={navigate} />}
        {clan && page === 'champions' && <ChampionsView key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} onOpen={entry => { navigate('objects'); openEntry(entry); }} />}
        {clan && page === 'cards' && <><div className="page-head"><div><div className="eyebrow">{t("CONTENIDO")}</div><h1>{t("Cartas")}</h1><p>{t("{visible} de {total} cartas. Selecciona una para ver sus datos y editar campos guiados.",{visible:cardList.length,total:cards.length})}</p></div></div>
          <ContentCreator key={clan.key} clan={clan} section="cards" selected={selectedEntry} onSaved={async () => { setQuery(''); setRarity('all'); setKind('all'); setPool('all'); await refreshClan(clan.key); }} /><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Buscar nombre o ID…")} aria-label={t("Buscar cartas")} /><select value={rarity} onChange={e => setRarity(e.target.value)}><option value="all">{t("Todas las rarezas")}</option>{['common','uncommon','rare','champion'].map(x => <option key={x} value={x}>{x}</option>)}</select><select value={kind} onChange={e => setKind(e.target.value)}><option value="all">{t("Todos los tipos")}</option>{['monster','spell','equipment','room','blight'].map(x => <option key={x} value={x}>{x}</option>)}</select><select value={pool} onChange={e => setPool(e.target.value)}><option value="all">{t("Todos los pools")}</option>{allPools.map(x => <option key={x} value={x}>{x}</option>)}</select><button className="ghost" onClick={() => { setQuery(''); setRarity('all'); setKind('all'); setPool('all'); }}>{t("Limpiar")}</button></div>
          <div className={'split ' + (selectedEntry ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>{t("Carta")}</th><th>{t("Tipo")}</th><th>{t("Rareza")}</th><th>{t("Ember")}</th><th>{t("Desbloqueo")}</th><th>{t("Pool")}</th></tr></thead><tbody>{cardList.map(entry => <tr key={entry.file+entry.id} onClick={() => openEntry(entry)} tabIndex={0} aria-label={t("Abrir {name}",{name:entry.name})} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openEntry(entry); } }} className={selectedEntry?.id === entry.id ? 'selected-row' : ''}><td><strong>{entry.name}</strong><small>{entry.id}</small></td><td>{text(entry.data.card_type)}</td><td><span className={'rarity '+String(entry.data.rarity ?? '')}>{text(entry.data.rarity)}</span></td><td>{text(entry.data.cost)}</td><td>{entry.data.unlock_level === undefined ? t('Inicio') : t('Nivel {level}',{level:String(entry.data.unlock_level)})}</td><td className="muted">{memberships(entry).join(', ') || '—'}</td></tr>)}</tbody></table>{cardList.length === 0 && <div className="empty-inline">{t("Ninguna carta coincide con los filtros.")}</div>}</div>{selectedEntry && <Inspector key={JSON.stringify([clan.key,selectedEntry.section,selectedEntry.file,selectedEntry.id])} entry={selectedEntry} clan={clan} rules={config?.fields[selectedEntry.section] ?? []} assignments={config?.mechanics.assignments ?? []} onClose={() => setSelected(null)} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}</div></>}
        {clan && page === 'units' && <Units clan={clan} rules={config?.fields.characters ?? []} assignments={config?.mechanics.assignments ?? []} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}
        {clan && page === 'objects' && <ObjectExplorer key={clan.key} clan={clan} initialSelected={selected} fields={config?.fields ?? {}} assignments={config?.mechanics.assignments ?? []} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}
        {clan && page === 'progression' && <><Progression memberships={memberships} clan={clan} cards={cards} level={level} setLevel={setLevel} draftPools={config?.stats.draftPools ?? []} bannerPool={config?.stats.bannerPool ?? ''} maxLevel={config?.stats.progressionMaxLevel ?? 10} technicalLevels={config?.stats.technicalUnlockLevels ?? []} onOpen={entry => { navigate('cards'); openEntry(entry); }} /><ProgressionEditor key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} /></>}
        {clan && page === 'pools' && <PoolsView key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} onOpen={entry => { navigate(entry.section === 'cards' ? 'cards' : 'objects'); openEntry(entry); }} />}
        {clan && config && page === 'mechanics' && <Mechanics clan={clan} fields={config.fields} tabs={config.mechanics.tabs} onOpen={openEntry} selected={selectedEntry} onClose={() => setSelected(null)} onSaved={() => refreshClan(clan.key)} setStatus={setStatus} />}
        {clan && page === 'assets' && <Assets clan={clan} onSaved={()=>refreshClan(clan.key)} />}
        {clan && page === 'character-art' && <CharacterPreview key={clan.key} clan={clan} onSaved={() => refreshClan(clan.key)} onOpen={entry => { navigate('objects'); openEntry(entry); }} />}
        {clan && page === 'validation' && <Validation clan={clan} />}
        {clan && page === 'publish' && <Publish clan={clan} />}
      </div>
    </main>
  </div>;
}

function LibraryView(props: { items: LibraryItem[]; onOpen: (key: string) => void; onRemove: (key: string) => void; pathInput: string; setPathInput: (x: string) => void; onAdd: (x: string) => void; onBrowse: () => void; busy: boolean; onStats: () => void; onCreate: () => void; onDiscovered: () => Promise<void> }) {
  const {t,locale}=useLanguage();
  return <><div className="page-head"><div><div className="eyebrow">{t("ESPACIO DE TRABAJO")}</div><h1>{t("Biblioteca de clanes")}</h1><p>{t("Abre una carpeta existente para recorrer sus cartas, campeones y recursos sin modificarla.")}</p></div><div className="head-actions"><button className="primary" onClick={props.onCreate}>{t("Crear clan")}</button><button className="secondary" onClick={props.onStats}>{t("Comparar clanes →")}</button></div></div>
    <div className="panel add-panel"><div><strong>{t("Añadir un clan")}</strong><p>{t("Selecciona la carpeta que contiene")} <code>json/</code>, <code>textures/</code> {t("y los archivos del mod.")}</p></div><div className="add-controls"><input value={props.pathInput} onChange={e => props.setPathInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && props.onAdd(props.pathInput)} placeholder={t("Ruta de la carpeta del clan")} /><button className="secondary" onClick={props.onBrowse} disabled={props.busy}>{t("Examinar…")}</button><button className="primary" onClick={() => props.onAdd(props.pathInput)} disabled={props.busy || !props.pathInput.trim()}>{t("Añadir")}</button></div></div>
    <ExamplesPanel onAdded={props.onDiscovered} /><DiscoveryView onAdded={props.onDiscovered} /><div className="section-heading"><h2>{t("Carpetas conocidas")}</h2><span>{t("{count} clanes",{count:props.items.length})}</span></div>
    {props.items.length === 0 ? <div className="empty-state"><div className="empty-symbol">▦</div><h3>{t("La biblioteca está vacía")}</h3><p>{t("Añade una carpeta para comenzar. El editor solo la leerá hasta que guardes un cambio.")}</p></div> : <div className="library-grid">{props.items.map(item => <div className="panel library-card" key={item.key}><div className="folder-icon">▣</div><div className="library-info"><h3>{item.root.replaceAll('\\','/').split('/').pop()}</h3><p title={item.root}>{short(item.root)}</p><small>{t("Añadido {date}",{date:new Date(item.addedAt).toLocaleDateString(locale)})}</small></div><div className="library-actions"><button className="primary" onClick={() => props.onOpen(item.key)}>{t("Abrir →")}</button><button className="ghost danger" onClick={() => props.onRemove(item.key)}>{t("Quitar")}</button></div></div>)}</div>}
  </>;
}

function CreateView({ onCreate, onCancel, busy, creation }: { onCreate: (input: { destination: string; name: string; id: string; author: string; champions: string[]; starters: string[]; draftCount: number }) => void; onCancel: () => void; busy: boolean; creation: Config['creation'] }) {
  const {t}=useLanguage();
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [author, setAuthor] = useState('');
  const [destination, setDestination] = useState('');
  const [champions, setChampions] = useState(['', '']);
  const [starters, setStarters] = useState(['', '']);
  const [draftCount, setDraftCount] = useState(creation.defaultDraftCards);
  function update(list: string[], setter: (items: string[]) => void, index: number, value: string) { setter(list.map((item, i) => i === index ? value : item)); }
  const valid = /^[A-Za-z][A-Za-z0-9_]{2,39}$/.test(id) && Boolean(name.trim() && author.trim() && destination.trim() && champions.every(Boolean) && starters.every(Boolean)) && Number.isInteger(draftCount) && draftCount >= creation.minimumDraftCards && draftCount <= creation.maximumDraftCards;
  return <><div className="page-head"><div><div className="eyebrow">{t("NUEVO PROYECTO")}</div><h1>{t("Crear clan")}</h1><p>{t("Se generarán dos campeones, tres sendas por campeón, dos cartas iniciales, N cartas de draft, pools, estandarte, fuente C# y arte marcador.")}</p></div></div><div className="create-grid"><div className="panel content-panel"><h2>{t("Identidad y carpeta")}</h2><label>{t("Nombre")}<input value={name} onChange={e => { setName(e.target.value); if (!id) setId(e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'')); }} placeholder={t("Mi clan")} /></label><label>{t("ID técnico")}<input value={id} onChange={e => setId(e.target.value)} placeholder={t("MiClan")} /></label><label>{t("Autor o namespace de Thunderstore")}<input value={author} onChange={e => setAuthor(e.target.value)} placeholder={t("TuNombre")} /></label><label>{t("Carpeta nueva de destino")}<input value={destination} onChange={e => setDestination(e.target.value)} placeholder="D:\\Juegos\\MT2_mod\\MiClan" /></label><p>{t("La carpeta contenedora debe existir; la carpeta final todavía no.")}</p></div><div className="panel content-panel"><h2>{t("Contenido inicial")}</h2>{[0,1].map(index => <div className="create-pair" key={index}><h3>{t("Campeón {index}",{index:index+1})}</h3><label>{t("Nombre")}<input value={champions[index]} onChange={e => update(champions, setChampions, index, e.target.value)} /></label><label>{t("Carta inicial")}<input value={starters[index]} onChange={e => update(starters, setStarters, index, e.target.value)} /></label></div>)}<label>{t("Cartas de draft")}<input type="number" min={creation.minimumDraftCards} max={creation.maximumDraftCards} value={draftCount} onChange={e => setDraftCount(Number(e.target.value))} /></label><p>{t("Al menos {count} para el estandarte.",{count:creation.minimumDraftCards})}</p></div></div><div className="head-actions create-actions"><button className="ghost" onClick={onCancel}>{t("Cancelar")}</button><button className="primary" disabled={!valid || busy} onClick={() => onCreate({ destination, name, id, author, champions, starters, draftCount })}>{t(busy ? 'Creando…' : 'Crear proyecto')}</button></div></>;
}

function Overview({ clan, onGo }: { clan: ClanSnapshot; onGo: (page: Page) => void }) {
  const {t}=useLanguage();
  const cards = clan.sections.cards ?? 0;
  const classEntry = clan.entries.find(entry => entry.section === 'classes');
  const champions = Array.isArray(classEntry?.data.champions) ? classEntry.data.champions.length : 0;
  const tiles = [{ label: 'Campeones', value: champions, page: 'champions' }, { label: 'Cartas', value: cards, page: 'cards' }, { label: 'Pools', value: clan.sections.card_pools ?? 0, page: 'pools' }, { label: 'Texturas', value: clan.textureCount, page: 'assets' }, { label: 'Efectos', value: clan.sections.effects ?? 0, page: 'mechanics' }, { label: 'Avisos', value: clan.issues.length, page: 'validation' }] as const;
  return <><div className="page-head"><div><div className="eyebrow">{t("CLAN ACTIVO")}</div><h1>{clan.name}</h1><p>{clan.classId} · {short(clan.root)}</p></div><div className="head-actions"><span className="pill">{t(clan.hasSource ? 'Fuente disponible' : 'Sin fuente')}</span><span className="pill">{clan.files.length} JSON</span></div></div>
    <div className="metric-grid">{tiles.map(tile => <button className="metric panel" key={t(tile.label)} onClick={() => onGo(tile.page)}><span>{t(tile.label)}</span><strong>{tile.value}</strong><small>{t("Ver sección →")}</small></button>)}</div>
    <div className="two-col"><div className="panel content-panel"><h2>{t("Estructura del clan")}</h2><p>{t("La clase puede estar en cualquier JSON; el lector identifica las secciones por su contenido.")}</p><div className="section-list">{Object.entries(clan.sections).sort((a,b) => b[1]-a[1]).slice(0,12).map(([name,count]) => <div key={name}><span>{name}</span><b>{count}</b></div>)}</div></div><div className="panel content-panel"><h2>{t("Estado de lectura")}</h2>{clan.issues.length === 0 ? <div className="success-block">{t("✓ Todos los JSON analizados sin errores de sintaxis o IDs duplicados.")}</div> : clan.issues.slice(0,6).map((issue,i) => <div className="issue-row" key={i}><b>{issue.code}</b><span>{t(issue.message)}</span></div>)}<button className="secondary full" onClick={() => onGo('validation')}>{t("Ver validación")}</button></div></div>
  </>;
}

type Assignment = Config['mechanics']['assignments'][number];
function Units({ clan, rules, assignments, onSaved, setStatus }: { clan: ClanSnapshot; rules: FieldRule[]; assignments: Assignment[]; onSaved: () => void; setStatus: (s: Status) => void }) {
  const {t}=useLanguage();
  const units = clan.entries.filter(entry => entry.section === 'characters');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const selected = units.find(entry => entry.id === selectedId);
  const filtered = units.filter(entry => (entry.name + ' ' + entry.id).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <><div className="page-head"><div><div className="eyebrow">{t("PERSONAJES")}</div><h1>{t("Unidades")}</h1><p>{t("{count} personajes. Edita ataque, salud, tamaño y datos avanzados en el inspector.",{count:units.length})}</p></div></div><ContentCreator key={clan.key} clan={clan} section="characters" selected={selected} onSaved={() => { setQuery(''); onSaved(); }} /><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Buscar unidad…")} /></div><div className={'split ' + (selected ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>{t("Unidad")}</th><th>{t("Ataque")}</th><th>{t("Salud")}</th><th>{t("Tamaño")}</th><th>{t("Archivo")}</th></tr></thead><tbody>{filtered.map(entry => <tr key={entry.file+entry.id} onClick={() => setSelectedId(entry.id)} tabIndex={0} aria-label={t("Abrir {name}",{name:entry.name})} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedId(entry.id); } }} className={selectedId === entry.id ? 'selected-row' : ''}><td><strong>{entry.name}</strong><small>{entry.id}</small></td><td>{text(entry.data.attack_damage)}</td><td>{text(entry.data.health)}</td><td>{text(entry.data.size)}</td><td className="muted">{entry.file}</td></tr>)}</tbody></table></div>{selected && <Inspector key={JSON.stringify([clan.key,selected.section,selected.file,selected.id])} entry={selected} clan={clan} rules={rules} assignments={assignments} onClose={() => setSelectedId('')} onSaved={onSaved} setStatus={setStatus} />}</div></>;
}

function ObjectExplorer({ clan, fields, assignments, onSaved, setStatus, initialSelected }: { clan: ClanSnapshot; fields: Record<string, FieldRule[]>; assignments: Assignment[]; onSaved: () => void; setStatus: (s: Status) => void; initialSelected?: { file: string; section: string; id: string } | null }) {
  const {t}=useLanguage();
  const [section, setSection] = useState(initialSelected?.section ?? 'all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<{ file: string; section: string; id: string } | null>(initialSelected ?? null);
  const sections = Object.entries({ rewards: 0,map_nodes:0,effects:0,relic_effects:0,character_triggers:0,card_triggers:0,relics:0, ...clan.sections }).sort((a, b) => a[0].localeCompare(b[0]));
  const filtered = clan.entries.filter(entry => (section === 'all' || entry.section === section) && (entry.name + ' ' + entry.id + ' ' + entry.file).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const active = selected && clan.entries.find(entry => entry.file === selected.file && entry.section === selected.section && entry.id === selected.id);
  return <><div className="page-head"><div><div className="eyebrow">{t("ESTRUCTURA COMPLETA")}</div><h1>{t("Todos los objetos")}</h1><p>{t("{objects} objetos en {sections} secciones. Esta vista da acceso a definiciones que aún no tienen pantalla especializada.",{objects:clan.entries.length,sections:sections.length})}</p></div></div><BatchFields key={clan.key} clan={clan} onSaved={onSaved}/><DefinitionCreator clan={clan} selected={active||undefined} onSaved={onSaved} onCreated={(section,id)=>{setSection(section);setQuery('');setSelected({section,id,file:`json/editor-${id}.json`});}} /><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Buscar nombre, ID o archivo…")} /><select value={section} onChange={e => { setSection(e.target.value); setSelected(null); }}><option value="all">{t("Todas las secciones")}</option>{sections.map(([name,count]) => <option value={name} key={name}>{name} ({count})</option>)}</select><span className="pill">{t("{count} resultados",{count:filtered.length})}</span></div><div className={'split ' + (active ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>{t("Objeto")}</th><th>{t("Sección")}</th><th>{t("Archivo")}</th></tr></thead><tbody>{filtered.map(entry => <tr key={entry.file+entry.section+entry.id} onClick={() => setSelected({ file: entry.file, section: entry.section, id: entry.id })} tabIndex={0} aria-label={t("Abrir {name}",{name:entry.name})} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelected({ file: entry.file, section: entry.section, id: entry.id }); } }} className={active === entry ? 'selected-row' : ''}><td><strong>{entry.name}</strong><small>{entry.id}</small></td><td>{entry.section}</td><td className="muted">{entry.file}</td></tr>)}</tbody></table></div>{active && <Inspector key={JSON.stringify([clan.key,active.section,active.file,active.id])} entry={active} clan={clan} rules={fields[active.section] ?? []} assignments={assignments} onClose={() => setSelected(null)} onSaved={onSaved} setStatus={setStatus} />}</div></>;
}

function Inspector({ entry, clan, rules: definitions, assignments, onClose, onSaved, setStatus }: { entry: Entry; clan: ClanSnapshot; rules: FieldRule[]; assignments: Assignment[]; onClose: () => void; onSaved: () => void; setStatus: (s: Status) => void }) {
  const {t}=useLanguage();
  function locations(data: unknown, pattern: string, prefix = ''): string[] {
    const [part, ...rest] = pattern.split('.'); const many = part.endsWith('[]'); const key = many ? part.slice(0, -2) : part;
    const next = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined; const full = prefix ? prefix + '.' + key : key;
    if (many) return Array.isArray(next) ? next.flatMap((v, i) => rest.length ? locations(v, rest.join('.'), full + '.' + i) : [full + '.' + i]) : [];
    return rest.length ? locations(next, rest.join('.'), full) : [full];
  }
  const rules = definitions.filter(r => !r.special && matchesMechanic(entry.data, r)).flatMap(r => locations(entry.data, r.path).map((path, i) => ({ ...r, path, label: t(r.label) + (r.path.includes('[]') ? ' · ' + (i + 1) : '') })));
  const [field, setField] = useState(rules[0]?.path ?? '');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<{ changed: boolean; before: unknown; after: unknown } | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => { setField(rules[0]?.path ?? ''); setPreview(null); }, [clan.key, entry.section, entry.id, entry.file]);
  useEffect(() => { const rule = rules.find(r => r.path === field); const current = valueAt(entry.data, field); setValue(rule?.type === 'class-reference' && current && typeof current === 'object' ? JSON.stringify(current) : rule?.type === 'status-list' ? JSON.stringify(current??[]) : rule?.type === 'string-list' ? strings(current).join(', ') : current === undefined || current === null ? '' : String(current)); setPreview(null); }, [clan.key, entry.section, entry.id, entry.file, entry.hash, field]);
  const rule = rules.find(r => r.path === field);
  function parsed(): unknown {
    if (!rule) throw new Error(t("Campo no disponible."));
    if (rule.optional && value.trim() === '') return null;
    if (rule.type === 'number') { const n = Number(value); if (!Number.isFinite(n) || value.trim() === '') throw new Error(t("Introduce un número válido.")); return n; }
    if (rule.type === 'string-list') return value.split(',').map(x => x.trim()).filter(Boolean);
    if (rule.type === 'boolean') { if (!['true','false'].includes(value)) throw new Error(t("Selecciona verdadero o falso.")); return value === 'true'; }
    if (rule.type === 'status-list') return JSON.parse(value || '[]');
    if (rule.type === 'class-reference') return value.trim().startsWith('{') ? JSON.parse(value) : value.trim();
    return value;
  }
  async function act(save: boolean) {
    setWorking(true);
    try {
      const payload = { key: clan.key, section: entry.section, id: entry.id, file: entry.file, field, value: parsed(), expectedHash: entry.hash };
      if (save) { const result = await post<{ changed: boolean }>('/edit/save', payload); setStatus({ kind: 'success', text: result.changed ? 'Cambio guardado en {file}. Se creó una copia de seguridad.' : 'No había cambios que guardar.', values:{file:entry.file} }); setPreview(null); onSaved(); }
      else setPreview(await post('/edit/preview', payload));
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setWorking(false); }
  }
  return <aside className="panel inspector"><div className="inspector-head"><div><div className="eyebrow">{entry.section}</div><h2>{entry.name}</h2><small>{entry.id}</small></div><button className="close" aria-label={t("Cerrar inspector")} onClick={onClose}>×</button></div><div className="file-ref">{entry.file}</div>
    {rules.length > 0 && <div className="edit-box"><h3>{t("Editar campo")}</h3><label>{t("Campo")}<select value={field} onChange={e => setField(e.target.value)}>{rules.map(r => <option key={r.path} value={r.path}>{r.label}</option>)}</select></label><div className="parameter-control"><div className="parameter-label">{rule?.label}</div>{rule?.type === 'status-list' ? <StatusParameter value={value} onChange={v=>{setValue(v);setPreview(null);}} options={rule.options??[]} presets={rule.statusPresets??[]} clan={clan}/> : rule?.type === 'textarea' ? <textarea aria-label={rule?.label} value={value} onChange={e => {setValue(e.target.value);setPreview(null);}} /> : (rule?.type === 'select' || rule?.type === 'boolean') ? <FieldSelect label={rule?.label} value={value} onChange={next=>{setValue(next);setPreview(null);}} options={rule.options} boolean={rule.type === 'boolean'} t={t}/> : <input aria-label={rule?.label} min={rule?.min} max={rule?.max} type={rule?.type === 'number' ? 'number' : 'text'} value={value} onChange={e => {setValue(e.target.value);setPreview(null);}} placeholder={rule?.optional ? t('Sin campo explícito') : ''} />}</div>{rule?.help && <p className="muted">{t(rule.help)}</p>}{rule?.type === 'string-list' && <small>{t("Separa los valores con comas.")}</small>}<button className="secondary full" disabled={working} onClick={() => act(false)}>{t("Previsualizar cambio")}</button>{preview && <div className="preview"><div>{t("Antes:")} <b>{JSON.stringify(preview.before) ?? t('sin campo')}</b></div><div>{t("Después:")} <b>{JSON.stringify(preview.after) ?? t('sin campo')}</b></div><button className="primary full" disabled={!preview.changed || working} onClick={() => act(true)}>{t("Guardar este campo")}</button></div>}</div>}
    <SpawnPicker entry={entry} clan={clan} onSaved={onSaved} />
    <PoolPicker entry={entry} clan={clan} onSaved={onSaved} />
    <CharacterPoolPicker entry={entry} clan={clan} onSaved={onSaved} />
    <VisualPicker entry={entry} clan={clan} onSaved={onSaved} />
    <ReferenceEditor entry={entry} clan={clan} onSaved={onSaved} />
    <MechanismPicker entry={entry} clan={clan} assignments={assignments} onSaved={onSaved} setStatus={setStatus} />
    <AdvancedEditor entry={entry} clan={clan} onSaved={onSaved} setStatus={setStatus} />
    <DeleteDefinition entry={entry} clan={clan} onSaved={onSaved} />
  </aside>;
}

function AdvancedEditor({ entry, clan, onSaved, setStatus }: { entry: Entry; clan: ClanSnapshot; onSaved: () => void; setStatus: (s: Status) => void }) {
  const {t}=useLanguage();
  const [json, setJson] = useState(() => JSON.stringify(entry.data, null, 2));
  const [preview, setPreview] = useState<{ changed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setJson(JSON.stringify(entry.data, null, 2)); setPreview(null); }, [clan.key, entry.section, entry.id, entry.file, entry.hash]);
  async function act(save: boolean) {
    setBusy(true);
    try {
      const payload = { key: clan.key, section: entry.section, id: entry.id, file: entry.file, json, expectedHash: entry.hash };
      if (save) {
        const result = await post<{ changed: boolean }>('/object/save', payload);
        setStatus({ kind: 'success', text: result.changed ? 'Objeto guardado en {file}. Se creó una copia de seguridad.' : 'No había cambios que guardar.', values:{file:entry.file} });
        setPreview(null); onSaved();
      } else setPreview(await post('/object/preview', payload));
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  return <details className="raw-json"><summary>{t("Edición avanzada · JSON")}</summary><p className="muted">{t("Puedes editar cualquier parámetro de este objeto. El ID se mantiene fijo para proteger sus referencias.")}</p><textarea className="json-editor" aria-label={t("JSON de {id}",{id:entry.id})} spellCheck={false} value={json} onChange={e => { setJson(e.target.value); setPreview(null); }} /><button className="secondary full" disabled={busy} onClick={() => act(false)}>{t("Validar y previsualizar")}</button>{preview && <div className="preview"><div>{t(preview.changed ? 'Se modificará este objeto en su archivo.' : 'Sin cambios.')}</div><button className="primary full" disabled={!preview.changed || busy} onClick={() => act(true)}>{t("Guardar objeto")}</button></div>}</details>;
}

function MechanismPicker({ entry, clan, assignments, onSaved, setStatus }: { entry: Entry; clan: ClanSnapshot; assignments: Assignment[]; onSaved: () => void; setStatus: (s: Status) => void }) {
  const {t}=useLanguage();
  const choices = assignments.filter(item => item.section === entry.section);
  const [kind, setKind] = useState(choices[0]?.path ?? '');
  const [mechanism, setMechanism] = useState('');
  const [preview, setPreview] = useState<{ changed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setKind(choices[0]?.path ?? ''); setMechanism(''); setPreview(null); }, [clan.key, entry.section, entry.id, entry.file]);
  if (!choices.length) return null;
  const assignment = choices.find(item => item.path === kind) ?? choices[0];
  const candidates = clan.entries.filter(item => item.section === assignment.sourceSection && (!assignment.filter || item.data[assignment.filter] === true));
  function proposed() {
    if (!mechanism || !candidates.some(item => item.id === mechanism)) throw new Error(t("Selecciona una definición existente."));
    const data = structuredClone(entry.data);
    const reference = '@' + mechanism;
    if (assignment.mode === 'set-reference') data[assignment.path] = reference;
    else {
      const list = data[assignment.path];
      if (list !== undefined && !Array.isArray(list)) throw new Error(t("El campo de destino no es una lista."));
      const existing = (list ?? []) as unknown[];
      if (existing.some(item => item && typeof item === 'object' && 'id' in item && item.id === reference)) throw new Error(t("Esta definición ya está asignada."));
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
        setStatus({ kind: 'success', text: result.changed ? '{label} asignado en {name}.' : 'Sin cambios.',values:{label:t(assignment.label),name:entry.name} });
        setPreview(null); onSaved();
      } else setPreview(await post('/object/preview', payload));
    } catch (error) { setStatus({ kind: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }
  return <div className="edit-box mechanism-picker"><h3>{t("Asignar mecánica existente")}</h3><label>{t("Tipo")}<select value={kind} onChange={e => { setKind(e.target.value); setMechanism(''); setPreview(null); }}>{choices.map(item => <option key={item.path} value={item.path}>{t(item.label)}</option>)}</select></label><label>{t("Definición")}<select value={mechanism} onChange={e => { setMechanism(e.target.value); setPreview(null); }}><option value="">{t("Seleccionar…")}</option>{candidates.map(item => <option key={item.file+item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><button className="secondary full" onClick={() => act(false)} disabled={!mechanism || busy}>{t("Previsualizar asignación")}</button>{preview && <div className="preview"><div>{preview.changed ? t('Se asignará {id}.',{id:mechanism}) : t('Sin cambios.')}</div><button className="primary full" disabled={!preview.changed || busy} onClick={() => act(true)}>{t("Guardar asignación")}</button></div>}</div>;
}

function Progression({ memberships, clan, cards, level, setLevel, draftPools, bannerPool, maxLevel, technicalLevels, onOpen }: { memberships:(card:Entry)=>string[]; clan: ClanSnapshot; cards: Entry[]; level: number; setLevel: (n: number) => void; draftPools: string[]; bannerPool: string; maxLevel: number; technicalLevels: number[]; onOpen: (entry: Entry) => void }) {
 const {t}=useLanguage();
  const draft = cards.filter(card => memberships(card).some(p => draftPools.includes(p)) && card.data.is_an_ability !== true && card.data.rarity !== 'champion' && !technicalLevels.includes(Number(card.data.unlock_level ?? 0)));
  const available = draft.filter(card => Number(card.data.unlock_level ?? 0) <= level);
  const locked = draft.filter(card => Number(card.data.unlock_level ?? 0) > level);
  const rows = Array.from({length: maxLevel + 1},(_,n) => ({ level: n, cards: draft.filter(card => Number(card.data.unlock_level ?? 0) === n) }));
  return <><div className="page-head"><div><div className="eyebrow">{t("DESBLOQUEOS")}</div><h1>{t("Progresión del clan")}</h1><p>{t("Consulta qué cartas entran en los drafts según el nivel. El patrón de referencia es Yokai.")}</p></div><span className="pill">{t("{count} cartas obtenibles",{count:draft.length})}</span></div><div className="progress-layout"><div className="panel content-panel"><h2>{t("Por nivel")}</h2><div className="timeline">{rows.map(row => <button key={row.level} className={'timeline-row '+(row.level === level ? 'active' : '')} onClick={() => setLevel(row.level)}><span className="timeline-badge">{row.level === 0 ? '0' : row.level}</span><span><b>{row.level === 0 ? t('Desde el inicio') : t('Nivel {level}',{level:row.level})}</b><small>{row.cards.slice(0,3).map(c => c.name).join(' · ') || t('Sin desbloqueos')}{row.cards.length > 3 ? '…' : ''}</small></span><strong>{row.cards.length}</strong></button>)}</div></div><div className="panel content-panel"><div className="sim-head"><div><div className="eyebrow">{t("SIMULACIÓN")}</div><h2>{t("Nivel {level}",{level})}</h2></div><select value={level} onChange={e => setLevel(Number(e.target.value))}>{rows.map(row => <option key={row.level} value={row.level}>{t("Nivel {level}",{level:row.level})}</option>)}</select></div><div className="sim-counts"><div><strong>{available.length}</strong><span>{t("disponibles")}</span></div><div><strong>{locked.length}</strong><span>{t("bloqueadas")}</span></div><div><strong>{available.filter(c => memberships(c).includes(bannerPool)).length}</strong><span>{t("de estandarte")}</span></div></div><h3>{t("Se desbloquean ahora")}</h3>{rows.find(row => row.level === level)?.cards.length ? rows.find(row => row.level === level)!.cards.map(card => <button className="link-row" key={card.id} onClick={() => onOpen(card)}>{card.name}<span>→</span></button>) : <p className="muted">{t("No hay cartas nuevas en este nivel.")}</p>}<h3>{t("Aún bloqueadas")}</h3><div className="scroll-list">{locked.map(card => <button className="link-row" key={card.id} onClick={() => onOpen(card)}>{card.name}<span>{t("Nivel {level}",{level:String(card.data.unlock_level)})}</span></button>)}</div></div></div></>;
}

function Mechanics({ clan, fields, tabs, onOpen, selected, onClose, onSaved, setStatus }: { clan: ClanSnapshot; fields:Record<string,FieldRule[]>; tabs:{id:string;label:string}[]; onOpen: (e: Entry) => void; selected?: Entry; onClose: () => void; onSaved: () => void; setStatus: (s: Status) => void }) {
 const {t}=useLanguage();
  const [tab, setTab] = useState('effects');
  const [q, setQ] = useState('');
  const choices = tabs;
  const list = tab === 'abilities' ? clan.entries.filter(e => e.section === 'cards' && e.data.is_an_ability === true) : clan.entries.filter(e => e.section === tab);
  const filtered = list.filter(e => (e.name+' '+e.id+' '+String(e.data.name ?? '')).toLowerCase().includes(q.toLowerCase()));
  return <><div className="page-head"><div><div className="eyebrow">{t("CATÁLOGO DEL CLAN")}</div><h1>{t("Mecánicas")}</h1><p>{t("Explora y modifica las definiciones existentes del clan.")}</p></div></div><MechanicsSupport key={clan.key+JSON.stringify(clan.files.map(f=>clan.entries.find(e=>e.file===f)?.hash))} clanKey={clan.key} /><div className="tabs">{choices.map(x => <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => {setTab(x.id);onClose();}}>{t(x.label)}<small>{x.id === 'abilities' ? clan.entries.filter(e => e.section === 'cards' && e.data.is_an_ability === true).length : clan.sections[x.id] ?? 0}</small></button>)}</div><div className="filters"><input value={q} onChange={e => setQ(e.target.value)} placeholder={t("Buscar mecanismo…")} /></div><div className={'split '+(selected ? 'with-inspector' : '')}><div className="panel table-panel"><table><thead><tr><th>{t("Nombre / ID")}</th><th>{t("Clase o trigger")}</th><th>{t("Archivo")}</th></tr></thead><tbody>{filtered.map(e => <tr key={e.file+e.id} onClick={() => onOpen(e)} tabIndex={0} aria-label={t("Abrir {v0}",{v0:e.name})} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(e); } }}><td><strong>{e.name}</strong><small>{e.id}</small></td><td>{text(e.data.name ?? e.data.trigger)}</td><td className="muted">{e.file}</td></tr>)}</tbody></table></div>{selected && <Inspector key={JSON.stringify([clan.key,selected.section,selected.file,selected.id])} entry={selected} clan={clan} rules={fields[selected.section]??[]} assignments={[]} onClose={onClose} onSaved={onSaved} setStatus={setStatus}/>}</div></>;
}

function Assets({ clan,onSaved }: { clan: ClanSnapshot;onSaved:()=>void }) {
 const {t}=useLanguage();
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
  return <><div className="page-head"><div><div className="eyebrow">{t("IMÁGENES DEL MOD")}</div><h1>{t("Recursos visuales")}</h1><p>{assets.length}{" "}{t("recursos declarados (sprites y atlas) ·")}{" "}{clan.textureCount}{" "}{t("PNG en textures/. Se clasifican según su uso y nombre.")}</p></div></div><ArtChecklist key={clan.key + JSON.stringify(assets)} clanKey={clan.key} /><ResourceReview clanKey={clan.key} assets={assets} />{error && <div className="notice error">{t(error)}</div>}<div className="filters"><input value={q} onChange={e => setQ(e.target.value)} placeholder={t("Buscar ID o ruta de imagen…")} /><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">{t("Todas las categorías")}</option>{categories.map(([id,label]) => <option key={id} value={id}>{t(label)}</option>)}</select><select value={state} onChange={e => setState(e.target.value)}><option value="all">{t("Todos los estados")}</option><option value="ok">{t("Correcto")}</option><option value="missing">{t("Falta archivo")}</option><option value="case-mismatch">{t("Mayúsculas distintas")}</option><option value="invalid-path">{t("Ruta o imagen inválida")}</option><option value="external">{t("Bundle o externo")}</option></select></div><div className="asset-grid">{list.map(asset => <button className="panel asset-card" key={asset.section+asset.file+asset.id} onClick={() => setActive(asset)}><div className="asset-thumb">{imageUrl(asset) ? <img src={imageUrl(asset)} loading="lazy" /> : <span>▧</span>}</div><strong>{asset.id}</strong><small>{asset.section}</small><small>{t(asset.categoryLabel)} · {asset.width ?? '?'} × {asset.height ?? '?'}</small><small>{asset.status === 'ok' ? t("{v0} usos",{v0:asset.uses.length}) : asset.status}</small></button>)}</div>{active && <div className="modal-backdrop" onClick={() => setActive(null)}><div className="modal-card asset-modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setActive(null)}>×</button><h2>{active.id}</h2>{imageUrl(active) && <ArtAnalysis clanKey={clan.key} file={active.image} url={imageUrl(active)} />}<p>{active.image}</p><div className="section-list"><div><span>{t("Categoría")}</span><b>{t(active.categoryLabel)}</b></div><div><span>{t("Tamaño")}</span><b>{active.width ?? '?'} × {active.height ?? '?'}</b></div><div><span>{t("Estado")}</span><b>{active.status}</b></div></div><h3>{t("Usado por")}</h3>{active.uses.length ? active.uses.map((use,i) => <div className="link-row" key={i}>{use.section} · {use.id}<small>{use.file}</small></div>) : <p className="muted">{t("Sin referencias directas por ID.")}</p>}{active.section === 'atlas_icons' && <p className="muted">{t("Símbolo de tooltip. Los usos dentro del texto no se cuentan como referencias de sprites. Puedes sustituir su PNG con el formulario de abajo.")}</p>}{['ok','case-mismatch'].includes(active.status) && ['sprites','atlas_icons'].includes(active.section) && <ArtEditor clan={clan} asset={active} onSaved={() => { api<AssetInfo[]>(`/clans/${clan.key}/assets`).then(setAssets); setActive(null);onSaved(); }} />}<small>{active.file}</small></div></div>}</>;
}

function ArtEditor({ clan, asset, onSaved }: { clan: ClanSnapshot; asset: AssetInfo; onSaved: () => void }) {
 const {t}=useLanguage();
  const [imageBase64, setImageBase64] = useState('');
  const [filename, setFilename] = useState('');
  const [hash, setHash] = useState('');
  const [mode, setMode] = useState<'preserve' | 'match-existing'>(asset.category === 'card' ? 'match-existing' : 'preserve');
  const [preview, setPreview] = useState<{ changed: boolean; sourceWidth: number; sourceHeight: number; newWidth: number; newHeight: number; image: string;token:string;compensations:{id:string;before:{x:number;y:number};after:{x:number;y:number}}[];warnings:string[] } | null>(null);const [compensate,setCompensate]=useState(false);
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
      const payload = { key: clan.key, section: asset.section, spriteId: asset.id, file: asset.file, imageBase64, mode, expectedHash: hash, compensateCharacterScale:compensate,expectedToken:save?preview?.token:undefined,expectedDefinitionHash: clan.entries.find(e => e.section === asset.section && e.id === asset.id && e.file === asset.file)?.hash };
      if (save) { await post('/art/save', payload); onSaved(); }
      else setPreview(await post('/art/preview', payload));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="art-editor"><h3>{t("Reemplazar imagen")}</h3><p>{t("Se conservará una copia de seguridad del PNG actual. El ajuste encaja la imagen dentro del tamaño actual sin recortarla.")}</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => select(e.target.files?.[0])} /><label>{t("Ajuste")}<select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setPreview(null); }}><option value="preserve">{t("Conservar tamaño de origen")}</option><option value="match-existing">{t("Encajar en tamaño actual")}</option></select></label>{asset.section==='sprites'&&<label><input type="checkbox" checked={compensate} onChange={e=>{setCompensate(e.target.checked);setPreview(null);}}/>{t("Compensar escala de personajes estáticos que usan esta imagen")}</label>}<p>{t("La compensación conserva el tamaño del lienzo en unidades del juego. No recorta ni garantiza el apoyo de los pies; revisa la vista de personaje. Animaciones y Spine quedan fuera de esta compensación.")}</p>{filename && <small>{t("Elegida:")}{" "}{filename}</small>}{error && <div className="notice error">{t(error)}</div>}<button className="secondary full" disabled={!imageBase64 || !hash || busy} onClick={() => act(false)}>{t("Previsualizar imagen")}</button>{preview && <div className="art-preview"><img src={preview.image} /><p>{preview.sourceWidth} × {preview.sourceHeight} → {preview.newWidth} × {preview.newHeight}</p>{preview.compensations.map(c=><p key={c.id}>{c.id}{t(": escala (")}{c.before.x}, {c.before.y}) → ({c.after.x}, {c.after.y})</p>)}{preview.warnings.map(w=><p key={w}>{t(w)}</p>)}<button className="primary full" disabled={!preview.changed || busy} onClick={() => act(true)}>{t("Guardar imagen")}</button></div>}</div>;
}

function Validation({ clan }: { clan: ClanSnapshot }) {
 const {t}=useLanguage();
  const [issues, setIssues] = useState<Issue[]>(clan.issues);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  async function run() { setRunning(true); setError(''); try { setIssues(await api<Issue[]>(`/clans/${clan.key}/validation`)); } catch (e) { setError((e as Error).message); } finally { setRunning(false); } }
  useEffect(() => { void run(); }, [clan.key]);
  const visible = issues.filter(issue => filter === 'all' || issue.severity === filter);
  return <><div className="page-head"><div><div className="eyebrow">{t("DIAGNÓSTICO")}</div><h1>{t("Validación")}</h1><p>{t("Comprueba estructura de campeones, cartas iniciales, coste, desbloqueos, referencias principales y recursos visuales.")}</p></div><button className="secondary" onClick={run} disabled={running}>{running ? t("Comprobando…") : t("Volver a validar")}</button></div>{error && <div className="notice error">{t(error)}</div>}<div className="filters"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("Todas las severidades")}</option><option value="error">{t("Errores")}</option><option value="warning">{t("Avisos")}</option><option value="info">{t("Información")}</option></select><span className="pill">{visible.length}{" "}{t("resultados")}</span></div><div className="panel content-panel">{issues.length === 0 ? <div className="success-block">{t("✓ Sin problemas en las comprobaciones implementadas.")}</div> : visible.map((issue,i) => <div className="issue-row" key={i}><span className={'severity '+issue.severity}>{t(issue.severity)}</span><b>{issue.code}</b><span>{t(issue.message)}</span><small>{issue.file}</small></div>)}</div></>;
}

function Publish({ clan }: { clan: ClanSnapshot }) {
 const {t}=useLanguage();
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
  return <><div className="page-head"><div><div className="eyebrow">{t("GIT Y COMPILACIÓN")}</div><h1>{t("Publicación")}</h1><p>{t("Compila el clan en este equipo o envíalo a GitHub Actions.")}</p></div><button className="secondary" onClick={refresh} disabled={working}>{t("Actualizar estado")}</button></div>{error && <div className="notice error">{t(error)}</div>}
    <div className="panel content-panel"><h2>{t("Compilación local")}</h2><p>{t("SDK .NET:")}{" "}{buildState?.sdkVersion || t("No detectado")}{" "}{t("· Configuración:")}{" "}{buildState?.configuration ?? '—'}.</p>{buildState?.diagnostic && <p>{t(buildState.diagnostic)}</p>}{buildState?.projects.length ? <><label>{t("Proyecto C#")}<select value={buildProject} onChange={e => setBuildProject(e.target.value)}>{buildState.projects.map(project => <option key={project} value={project}>{project}</option>)}</select></label><button className="primary" disabled={working || !buildState.sdkVersion || !buildProject} onClick={() => compileLocal()}>{working ? t("Compilando…") : t("Compilar DLL local")}</button><button className="secondary" disabled={working || !buildState.sdkVersion || !buildProject || !buildState.offline.ready} onClick={() => compileLocal("installed")}>{t("Compilar con DLL instaladas")}</button><p>{t("DLL locales:")}{" "}{buildState.offline.ready ? t("Trainworks {v0}",{v0:buildState.offline.trainworksVersion}) : t("Configura {v0}. Faltan: {v1}",{v0:buildState.offline.configFile,v1:buildState.offline.missing.join(", ")})}{t(". Esta opción compila las fuentes C# con las referencias locales; los pasos personalizados del .csproj requieren la compilación normal.")}</p></> : <p>{t("No se encontró un proyecto .csproj en la carpeta del clan.")}</p>}{buildResult && <><div className={buildResult.ok ? 'success-block' : 'notice error'}>{buildResult.ok ? t("DLL creada: {v0}",{v0:buildResult.dll??'—'}) : t(buildResult.diagnostic??'')}{buildResult.sha256 && <div>{t("SHA-256:")}{" "}{buildResult.sha256}</div>}</div><details><summary>{t("Registro de dotnet")}</summary><pre>{buildResult.log}</pre></details></>}</div>
    <PackagePanel key={clan.key} clan={clan} changedAt={buildResult?.builtAt} /><div className="two-col"><div className="panel content-panel"><h2>{t("Repositorio")}</h2>{state?.error ? <p>{t(state.error)}</p> : <><div className="section-list"><div><span>{t("Rama")}</span><b>{state?.branch ?? '—'}</b></div><div><span>{t("Commit")}</span><b title={state?.sha}>{state?.sha?.slice(0,12) ?? '—'}</b></div><div><span>{t("Remoto")}</span><b>{state?.remote || t("Sin origin")}</b></div><div><span>{t("Fuente C#")}</span><b>{clan.hasSource ? t("Encontrada") : t("No encontrada")}</b></div></div><h3>{t("Cambios del clan (")}{state?.files?.length ?? 0})</h3><div className="publish-files">{state?.files?.length ? state.files.map((file,i) => <div key={i}>{file}</div>) : <p className="muted">{t("No hay cambios en esta carpeta.")}</p>}</div><label>{t("Mensaje de commit")}<input value={message} onChange={e => setMessage(e.target.value)} placeholder={t("Describe el cambio")} /></label><div className="head-actions"><button className="secondary" disabled={working || !message.trim() || !state?.files?.length} onClick={() => action('commit')}>{t("Crear commit")}</button><button className="primary" disabled={working || !state?.remote || Boolean(state?.files?.length)} onClick={() => action('push')}>{t("Enviar a GitHub")}</button></div></>}</div><div className="panel content-panel"><h2>{t("GitHub Actions")}</h2>{state?.actionsError && <p>{t(state.actionsError)}</p>}{state?.runs?.length ? state.runs.map(run => <div className="issue-row" key={run.databaseId}><b>{run.workflowName}</b><span>{run.status} · {run.conclusion ?? t("en curso")}</span><a href={run.url} target="_blank" rel="noreferrer">{t("Ver run ↗")}</a><small>{run.headSha.slice(0,12)}</small>{run.conclusion === 'success' && <button className="secondary" disabled={working} onClick={() => downloadRun(run.databaseId)}>{t("Descargar y comprobar DLL")}</button>}</div>) : <p className="muted">{t("No se encontró un workflow para este commit. Puede que no se haya enviado o que GitHub Actions aún no lo haya iniciado.")}</p>}{download && <div className="success-block">{t("DLL comprobada para")}{" "}{download.sha.slice(0,12)}: {download.dlls.map(file => <div key={file}>{file}</div>)}</div>}<p>{t("La descarga guarda el artefacto en data/downloads; no instala la DLL en el juego.")}</p></div></div></>;
}

function PackagePanel({ clan, changedAt }: { clan: ClanSnapshot; changedAt?: string }) {
 const {t}=useLanguage();
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
  return <div className="panel content-panel"><h2>{t("Preparar el mod para probarlo")}</h2><p>{t("Reúne la DLL, los JSON y las texturas en una carpeta nueva. Guarda los hashes para comprobar si la salida sigue al día.")}</p>{error && <div className="notice error">{t(error)}</div>}{state?.build ? <><p>{t("Última DLL:")}{" "}{state.build.dll}</p>{!state.build.fresh && <p className="notice error">{t("Necesita recompilar:")}{" "}{state.build.changed.join(", ")}</p>}</> : <p>{t("Compila primero desde el editor para registrar la DLL.")}</p>}{state?.package && <><p>{t("Carpeta preparada:")}{" "}{state.package.destination}</p><p className={state.package.fresh ? 'success-block' : 'notice error'}>{state.package.fresh ? t("La salida coincide con los archivos actuales.") : t("Salida desactualizada: {v0}",{v0:state.package.changed.join(', ')})}</p></>}<div className="head-actions"><button className="secondary" disabled={busy} onClick={refresh}>{t("Actualizar comprobación")}</button><button className="primary" disabled={busy || !state?.build?.fresh} onClick={prepare}>{busy ? t("Comprobando…") : t("Preparar carpeta del mod")}</button></div><p>{t("Después puedes copiar esa carpeta a un perfil de pruebas de BepInEx. La carga en el juego debe verificarse en ese perfil.")}</p></div>;
}

createRoot(document.getElementById('root')!).render(<LanguageProvider><App /></LanguageProvider>);



