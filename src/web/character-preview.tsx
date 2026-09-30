import React, { useEffect, useRef, useState } from 'react';
import { api, post } from './api';
import { projectCharacter, type Projection } from './character-geometry';
import type { ClanSnapshot, Entry } from './types';

type Values = Record<string, number>;
interface Item { entry: Entry; sprite?: Entry; image?: string; width: number; height: number; ppu: number; pivot: { x: number; y: number }; values: Values; automaticY: boolean; usable: boolean; context: string; warnings: string[]; uses: Entry[]; projection?: Projection }
interface Viewport { width: number; height: number; originX: number; originY?: number; floorY: number; pixelsPerUnit: number; pixelsPerUnitY?: number }
interface Rules { groundHeightMultiplier: number; viewport: Viewport; background?: { available: boolean; label: string; viewport: Viewport; calibration: string }; controls: { id: string; label: string; min: number; max: number; step: number }[] }
interface Model { rules: Rules; items: Item[] }
interface Preview { changed: boolean; changes: { label: string; before?: number; after: number }[]; uses: { section: string; id: string; file: string }[] }
const identity = (item: Item) => item.entry.file + ':' + item.entry.id;
const rounded = (n: number) => Math.round(n * 10000) / 10000;

export function CharacterPreview({ clan, onSaved, onOpen }: { clan: ClanSnapshot; onSaved: () => void; onOpen: (entry: Entry) => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [id, setId] = useState(''); const [query, setQuery] = useState(''); const [context, setContext] = useState('all');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setError(''); setModel(null);
    api<Model>(`/clans/${clan.key}/character-art`).then(value => { if (active) { setModel(value); setId(current => value.items.some(i => identity(i) === current) ? current : value.items[0] ? identity(value.items[0]) : ''); } }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [clan]);
  const filtered = model?.items.filter(item => (context === 'all' || context === item.context) && `${item.entry.name} ${item.entry.id} ${item.sprite?.id ?? ''} ${item.uses.map(e => e.name).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const selected = model?.items.find(item => identity(item) === id);
  return <><div className="page-head"><div><div className="eyebrow">ARTE Y ENCUADRE</div><h1>Vista de personaje</h1><p>Arrastra el personaje para moverlo y su tirador para cambiar el tamaño. Los ajustes se guardan en el character art seleccionado.</p></div></div>{notice && <div className="notice success">{notice}</div>}{error && <div className="notice error">{error}</div>}<div className="filters"><input aria-label="Buscar arte de personaje" value={query} onChange={e => setQuery(e.target.value)} placeholder="Personaje, sprite o ID…" /><select aria-label="Filtrar uso del personaje" value={context} onChange={e => setContext(e.target.value)}><option value="all">Todos los usos</option><option value="battle">Combate</option><option value="selection">Selección de campeón</option><option value="other">Otros / sin referencias</option></select><select aria-label="Elegir character art" value={filtered.some(i => identity(i) === id) ? id : ''} onChange={e => setId(e.target.value)}><option value="" disabled>Selecciona arte de personaje</option>{filtered.map(item => <option key={identity(item)} value={identity(item)}>{item.entry.name} · {item.entry.id}</option>)}</select></div><p>{filtered.length} recursos coinciden. Combate y selección pueden compartir imagen y usar transformaciones distintas.</p>{!model && !error && <p>Cargando imágenes…</p>}{model && model.items.length === 0 && <div className="empty-state">No hay game_objects de tipo character_art en este clan.</div>}{model && selected && <CharacterCanvas key={identity(selected) + selected.entry.hash} item={selected} rules={model.rules} clanKey={clan.key} onOpen={onOpen} onSaved={backup => { setNotice('Ajustes guardados. Copia de seguridad: ' + backup); onSaved(); }} />}</>;
}

function CharacterCanvas({ item, rules, clanKey, onSaved, onOpen }: { item: Item; rules: Rules; clanKey: string; onSaved: (backup: string) => void; onOpen: (entry: Entry) => void }) {
  const [edits, setEdits] = useState<Values>({}); const [zoom, setZoom] = useState(1); const [grid, setGrid] = useState(!rules.background?.available); const [locked, setLocked] = useState(true);
  const [background, setBackground] = useState(Boolean(rules.background?.available));
  const [backgroundError, setBackgroundError] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [imageError, setImageError] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; values: Values; width: number; height: number } | null>(null);
  const values = { ...item.values, ...edits };
  if (item.automaticY && edits.positionY === undefined) values.positionY = item.height / Math.max(item.ppu, 1) / 2 * rules.groundHeightMultiplier * values.scaleY;
  const v = background && rules.background?.available ? rules.background.viewport : rules.viewport;
  const originY = v.originY ?? v.floorY;
  const { unit, unitY, width, height, px, py, right, bottom } = projectCharacter(item, values, v, background ? item.projection : undefined);
  function update(changes: Values) {
    const clamped = Object.fromEntries(Object.entries(changes).map(([id, value]) => { const c = rules.controls.find(c => c.id === id)!; return [id, rounded(Math.max(c.min, Math.min(c.max, value)))]; }));
    setEdits(current => ({ ...current, ...clamped })); setPreview(null); setError('');
  }
  function control(id: string, value: number) {
    if (!Number.isFinite(value)) return;
    const changes = { [id]: value };
    if (locked && id === 'scaleX') changes.scaleY = values.scaleX === 0 ? value : values.scaleY * value / values.scaleX;
    if (locked && id === 'scaleY') changes.scaleX = values.scaleY === 0 ? value : values.scaleX * value / values.scaleY;
    update(changes);
  }
  function begin(e: React.PointerEvent, mode: 'move' | 'resize') {
    if (busy || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, values: { ...values }, width: Math.abs(width * values.scaleX), height: Math.abs(height * values.scaleY) };
  }
  function move(e: React.PointerEvent) {
    const start = drag.current; const rect = svg.current?.getBoundingClientRect(); if (!start || !rect) return;
    const ratio = Math.min(rect.width / v.width, rect.height / v.height) * zoom;
    const dx = (e.clientX - start.x) / ratio; const dy = (e.clientY - start.y) / ratio;
    if (start.mode === 'move') update({ positionX: start.values.positionX + dx / unit, positionY: start.values.positionY - dy / unitY });
    else {
      const factor = Math.max(0.02, 1 + (dx + dy) / Math.max(start.width + start.height, 1));
      update({ scaleX: start.values.scaleX * (locked ? factor : Math.max(0.02, 1 + dx / Math.max(start.width, 1))), scaleY: start.values.scaleY * (locked ? factor : Math.max(0.02, 1 + dy / Math.max(start.height, 1))) });
    }
  }
  function reset() { setEdits({}); setPreview(null); setError(''); }
  async function act(save: boolean) {
    setBusy(true); setError('');
    try {
      const request = { file: item.entry.file, id: item.entry.id, expectedHash: item.entry.hash, changes: edits };
      if (save) { const result = await post<{ changed: boolean; backup?: string }>(`/clans/${clanKey}/character-art/save`, request); if (result.changed) onSaved(result.backup!); else reset(); }
      else setPreview(await post<Preview>(`/clans/${clanKey}/character-art/preview`, request));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const usable = item.usable && !imageError;
  const outside = v.originX + px * unit * zoom < 0 || v.originX + px * unit * zoom > v.width || originY - py * unitY * zoom < 0 || originY - py * unitY * zoom > v.height;
  return <div className="character-preview-layout"><section className="panel character-stage"><h2>{item.entry.name}</h2><p className="muted">{background ? rules.background?.calibration : 'Referencia 2D sobre suelo y cuadrícula. La cámara, iluminación, VFX y animaciones del juego no se reproducen.'}</p><div className="head-actions"><label>Fondo<select value={background ? 'game' : 'grid'} onChange={e => { setBackground(e.target.value === 'game'); setZoom(1); setGrid(e.target.value !== 'game'); }}><option value="grid">Cuadrícula</option>{rules.background?.available && <option value="game">{rules.background.label}</option>}</select></label><label>Zoom de vista <input aria-label="Zoom de vista" type="range" min={0.1} max={3} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label><button className="ghost" onClick={() => setZoom(1)}>Zoom 100 %</button><label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> Cuadrícula</label></div><svg ref={svg} className="character-canvas" style={{ aspectRatio: `${v.width}/${v.height}` }} viewBox={`0 0 ${v.width} ${v.height}`} role="img" aria-label={`Vista previa ajustable de ${item.entry.name}`} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><defs><pattern id="character-grid" width={unit} height={unitY} patternUnits="userSpaceOnUse"><path d={`M ${unit} 0 L 0 0 0 ${unitY}`} fill="none" stroke="#3e4f5b" strokeWidth={1} /></pattern></defs><rect width={v.width} height={v.height} fill="#121c24" /><g transform={`translate(${v.originX} ${originY}) scale(${zoom})`}>{background && <image href="/api/character-background" x={-v.originX} y={-originY} width={v.width} height={v.height} onError={() => setBackgroundError(true)} />}{grid && <rect x={-v.width / zoom} y={-v.height / zoom} width={v.width * 2 / zoom} height={v.height * 2 / zoom} fill="url(#character-grid)" opacity={background ? 0.35 : 1} />}{grid && <line x1={-v.width / zoom} x2={v.width / zoom} y1={v.floorY - originY} y2={v.floorY - originY} stroke="#dab377" strokeWidth={3 / zoom} />}{grid && <line x1={0} x2={0} y1={-v.height / zoom} y2={v.height / zoom} stroke="#627580" strokeDasharray="8 8" />}{usable && <><g transform={`translate(${px * unit} ${-py * unitY}) scale(${values.scaleX} ${values.scaleY})`} onPointerDown={e => begin(e, 'move')} style={{ cursor: busy ? 'wait' : 'grab' }}><image preserveAspectRatio="none" href={`/api/assets/${clanKey}?file=${encodeURIComponent(item.image!)}`} x={-width * item.pivot.x} y={-height * (1 - item.pivot.y)} width={width} height={height} onError={() => setImageError(true)} /><rect x={-width * item.pivot.x} y={-height * (1 - item.pivot.y)} width={width} height={height} fill="transparent" stroke="#a5cee5" strokeWidth={1} vectorEffect="non-scaling-stroke" /></g><circle cx={px * unit} cy={-py * unitY} r={5 / zoom} fill="#e9ba71" pointerEvents="none" /><circle cx={right} cy={bottom} r={10 / zoom} fill="#d9ae72" stroke="#fff" strokeWidth={2 / zoom} onPointerDown={e => begin(e, 'resize')} style={{ cursor: 'nwse-resize' }} /></>}</g><text x={20} y={v.height - 20} fill="#d8b878" fontSize={18}>{background ? 'Referencia del juego · ' : 'Suelo · cada celda = 1 unidad · '}zoom {Math.round(zoom * 100)} %</text></svg>{backgroundError && background && <div className="notice error">No se pudo cargar el fondo del juego. Puedes usar la cuadrícula.</div>}{!usable && <div className="notice error">No se puede mostrar la imagen. Revisa el sprite y su ruta; los ajustes siguen disponibles.</div>}{outside && <div className="notice info">El pivote queda fuera de la vista. Reduce el zoom o ajusta la posición.</div>}<p>{item.width} × {item.height} px · {item.ppu} píxeles/unidad · pivote ({item.pivot.x}, {item.pivot.y}). El zoom cambia la vista y no se guarda en el clan.</p>{background && item.projection?.note && <div className="notice info">{item.projection.note}</div>}{item.warnings.length > 0 && <details open><summary>Avisos de la vista previa</summary><ul>{item.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}</section><section className="panel character-controls"><h2>Tamaño y posición</h2><fieldset disabled={busy}><label><input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} /> Mantener proporciones</label>{rules.controls.map(c => <label key={c.id}>{c.label}<div className="character-control"><input aria-label={`${c.label}: deslizador`} type="range" min={c.min} max={c.max} step={c.step} value={values[c.id]} onChange={e => control(c.id, Number(e.target.value))} /><input aria-label={c.label} type="number" min={c.min} max={c.max} step={c.step} value={rounded(values[c.id])} onChange={e => e.target.value !== '' && control(c.id, Number(e.target.value))} /></div></label>)}{item.automaticY && edits.positionY === undefined && <p>Altura automática: sigue la escala vertical hasta que ajustes la altura.</p>}<div className="head-actions"><button className="ghost" onClick={reset}>Restablecer cambios</button><button className="primary" disabled={Object.keys(edits).length === 0} onClick={() => act(false)}>Previsualizar guardado</button></div></fieldset><h3>Objetos que usan este arte</h3>{item.uses.map(use => <button className="secondary full" key={use.file + use.section + use.id} onClick={() => onOpen(use)}>{use.section} · {use.name} ↗</button>)}<button className="ghost" onClick={() => onOpen(item.entry)}>Abrir JSON del character art ↗</button>{error && <div className="notice error" role="alert">{error}</div>}{preview && <div className="character-save-preview"><h3>Cambios a guardar</h3>{preview.changes.map(change => <p key={change.label}>{change.label}: <b>{change.before ?? 'Automático / por defecto'} → {change.after}</b></p>)}<p>Se actualizan {preview.uses.length} usos de este objeto. El PNG y los demás character art conservan sus archivos y ajustes.</p><button className="primary" disabled={!preview.changed || busy} onClick={() => act(true)}>{busy ? 'Guardando…' : 'Guardar ajustes con respaldo'}</button></div>}</section></div>;
}
