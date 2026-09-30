import React, { useState } from 'react';
import { post } from './api';
type Mod = { root: string; name: string; version: string; classes: string[]; status: 'ready' | 'disabled' | 'not-clan' | 'invalid'; reason: string };
type Result = { roots: string[]; mods: Mod[]; warnings: string[] };
export function DiscoveryView({ onAdded }: { onAdded: () => Promise<void> }) {
  const [result, setResult] = useState<Result>(); const [path, setPath] = useState('');
  const [showOther, setShowOther] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function discover() {
    setBusy(true); setError(''); setNotice('');
    try { setResult(await post<Result>('/library/discover', { path })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function add(mods: Mod[]) {
    setBusy(true); setError(''); let count = 0; const failures: string[] = [];
    try {
      for (const mod of mods) {
        try { await post('/library/import', { path: mod.root }); count++; }
        catch (e) { failures.push(`${mod.name}: ${(e as Error).message}`); }
      }
      await onAdded(); setNotice(`${count} clanes añadidos o ya presentes. Las versiones desactivadas se abren desde copias de trabajo.`);
      if (failures.length) setError(failures.join('\n'));
    } finally { setBusy(false); }
  }
  const available = result?.mods.filter(mod => mod.status === 'ready' || mod.status === 'disabled') ?? [];
  return <div className="panel content-panel discovery-panel"><h2>Buscar clanes instalados</h2><p>Detecta clanes por sus definiciones, incluidos archivos desactivados. Estos últimos se copian a la carpeta de trabajo del editor; la instalación permanece desactivada.</p><label>Carpeta de plugins de otro perfil (opcional)<input value={path} onChange={e => setPath(e.target.value)} placeholder="Vacío: usar rutas de config/library-discovery.json" /></label><div className="head-actions"><button className="secondary" disabled={busy} onClick={discover}>{busy ? 'Procesando…' : 'Buscar clanes'}</button>{result && <button className="primary" disabled={busy || !available.length} onClick={() => add(available)}>Añadir todos los clanes detectados ({available.length})</button>}</div>{error && <div className="notice error" role="alert">{error}</div>}{notice && <p className="success-block" role="status">{notice}</p>}{result && <><p>{available.length} clanes detectados · {result.mods.filter(mod => mod.status === 'not-clan').length} carpetas sin definición de clan.</p><label><input type="checkbox" checked={showOther} onChange={e => setShowOther(e.target.checked)} /> Mostrar también complementos y formatos no compatibles</label>{result.warnings.map(warning => <p key={warning} className="notice error">{warning}</p>)}{result.mods.filter(mod => showOther || mod.status !== 'not-clan').map(mod => <div className="discovered-mod" key={mod.root}><div><strong>{mod.name}{mod.version && ` · ${mod.version}`}</strong><small>{mod.classes.join(', ')}</small><p>{mod.reason}</p><small title={mod.root}>{mod.root}</small></div>{(mod.status === 'ready' || mod.status === 'disabled') && <button className="secondary" disabled={busy} onClick={() => add([mod])}>{mod.status === 'disabled' ? 'Importar copia' : 'Añadir carpeta'}</button>}</div>)}</>}</div>;
}
