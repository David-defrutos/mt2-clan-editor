import React, { useEffect, useState } from 'react';
import { post } from './api';
import type { ClanSnapshot, Entry } from './types';
type Preview = { file: string; token: string; document: { game_objects: Record<string, unknown>[]; sprites: Record<string, unknown>[] }; images: string[]; sourceUses: { section: string; id: string; file: string }[] };
export function VisualCopy({ clan, entry, field, sourceId, onSaved, onBusy }: { clan: ClanSnapshot; entry: Entry; field: string; sourceId: string; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const [newId, setNewId] = useState(entry.id + 'VisualCopy');
  const [preview, setPreview] = useState<Preview>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { setNewId(entry.id + 'VisualCopy'); }, [entry.id, entry.file]);
  useEffect(() => { setPreview(undefined); setError(''); setNotice(''); }, [sourceId, field, entry.hash]);
  async function act(save: boolean) {
    setBusy(true); onBusy(true); setError(''); setNotice('');
    try {
      const input = { section: entry.section, file: entry.file, id: entry.id, field, sourceId, newId, expectedHash: entry.hash, expectedToken: save ? preview?.token : undefined };
      if (save) {
        const result = await post<{ backup: string }>(`/clans/${clan.key}/visual-copy/save`, input);
        setPreview(undefined); setNotice('Copia creada y asignada. Respaldo: ' + result.backup); onSaved();
      } else setPreview(await post<Preview>(`/clans/${clan.key}/visual-copy/preview`, input));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); onBusy(false); }
  }
  return <details className="visual-copy"><summary>Crear una copia de arte independiente</summary><p>Copia el arte seleccionado, sus sprites y PNG y lo asigna a este objeto. Después podrás cambiar su imagen o sus transformaciones sin modificar el arte original.</p><label>ID del nuevo recurso<input value={newId} maxLength={60} disabled={busy} onChange={e => { setNewId(e.target.value); setPreview(undefined); }} /></label>{error && <div className="notice error" role="alert">{error}</div>}{notice && <p className="success-block" role="status">{notice}</p>}<button className="secondary full" disabled={busy || !/^[A-Za-z][A-Za-z0-9_]{2,59}$/.test(newId)} onClick={() => act(false)}>Previsualizar copia de arte</button>{preview && <div className="preview"><p>Nuevo JSON: {preview.file}</p><p>1 objeto de arte · {preview.document.sprites.length} sprites · {preview.images.length} PNG</p><p>Referencia de {entry.name}: {JSON.stringify(entry.data[field] ?? 'Sin asignar')} → @{newId}</p><p>El recurso original conserva sus {preview.sourceUses.length} usos actuales hasta reasignar este objeto.</p><details><summary>Archivos y definiciones que se crearán</summary>{preview.images.map(file => <p key={file}>{file}</p>)}<pre>{JSON.stringify(preview.document, null, 2)}</pre></details><button className="primary full" disabled={busy} onClick={() => act(true)}>Crear copia y asignarla con respaldo</button></div>}</details>;
}
