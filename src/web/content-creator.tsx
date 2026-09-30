import React, { useState } from 'react';
import { post } from './api';
import type { ClanSnapshot, Entry } from './types';

type Preview = { file: string; token: string; objects: { section: string; id: string }[]; warnings: string[]; document: Record<string, unknown>; images: string[] };
export function ContentCreator({ clan, section, selected, onSaved }: { clan: ClanSnapshot; section: 'cards' | 'characters'; selected?: Entry; onSaved: () => void | Promise<void> }) {
  const [mode, setMode] = useState<'new' | 'copy' | null>(null);
  const [source, setSource] = useState<Entry>();
  const [id, setId] = useState(''); const [name, setName] = useState('');
  const [kind, setKind] = useState('monster');
  const [preview, setPreview] = useState<Preview>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  function open(copy: boolean) {
    setMode(copy ? 'copy' : 'new'); setSource(copy ? selected : undefined);
    setId(copy ? selected!.id + 'Copy' : ''); setName(copy ? selected!.name + ' (copia)' : '');
    setPreview(undefined); setError(''); setSaved('');
  }
  async function act(save: boolean) {
    setBusy(true); setError('');
    try {
      const input = { section, id, name, kind, source: source ? { id: source.id, file: source.file } : undefined, expectedToken: save ? preview?.token : undefined };
      if (save) {
        const result = await post<{ file: string }>(`/clans/${clan.key}/content/save`, input);
        setMode(null); setSaved(`Creado ${id} en ${result.file}.`); await onSaved();
      } else setPreview(await post<Preview>(`/clans/${clan.key}/content/preview`, input));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const valid = /^[A-Za-z][A-Za-z0-9_]{2,79}$/.test(id) && Boolean(name.trim());
  return <div className="content-creator"><div className="head-actions"><button className="primary" onClick={() => open(false)}>Crear {section === 'cards' ? 'carta' : 'unidad'}</button><button className="secondary" disabled={!selected} onClick={() => open(true)}>Duplicar selección</button></div>{saved && <p className="success-block" role="status">{saved}</p>}{mode && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-modal="true" aria-label={mode === 'copy' ? 'Duplicar contenido' : 'Crear contenido'}><h2>{mode === 'copy' ? 'Duplicar' : 'Crear'} {section === 'cards' ? 'carta' : 'unidad'}</h2><p>{source ? `Origen: ${source.name} · ${source.id}` : 'Los valores iniciales se cargan desde la plantilla de configuración.'}</p><fieldset disabled={busy}><label>ID técnico<input autoFocus value={id} maxLength={80} onChange={e => { setId(e.target.value); setPreview(undefined); }} /></label><label>Nombre<input value={name} maxLength={120} onChange={e => { setName(e.target.value); setPreview(undefined); }} /></label>{mode === 'new' && section === 'cards' && <label>Tipo<select value={kind} onChange={e => { setKind(e.target.value); setPreview(undefined); }}><option value="monster">Carta de unidad</option><option value="spell">Hechizo</option></select></label>}<p>Se añadirá un JSON independiente. Revisa el arte, las mecánicas y los pools antes de usar el contenido en el juego.</p>{error && <div className="notice error" role="alert">{error}</div>}{preview && <div className="content-preview"><h3>Se creará en {preview.file}</h3>{preview.objects.map(object => <div key={object.section + object.id}>{object.section} · <b>{object.id}</b></div>)}{preview.warnings.map(warning => <p className="notice info" key={warning}>{warning}</p>)}<details><summary>JSON completo</summary><pre>{JSON.stringify(preview.document, null, 2)}</pre></details></div>}<div className="head-actions"><button className="ghost" onClick={() => setMode(null)}>Cancelar</button><button className="secondary" disabled={!valid} onClick={() => act(false)}>Previsualizar</button><button className="primary" disabled={!preview} onClick={() => act(true)}>Guardar {mode === 'copy' ? 'copia' : 'nuevo contenido'}</button></div></fieldset></div></div>}</div>;
}
