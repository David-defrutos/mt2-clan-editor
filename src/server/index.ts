import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { addLibraryPath, getLibraryItem, loadLibrary, removeLibraryItem } from './library.js';
import { configRoot, inside, projectRoot } from './paths.js';
import { scanClan } from './scan.js';
import { loadStatsRules, summarizeClan } from './stats.js';
import { prepareEdit, saveEdit, prepareObjectEdit, saveObjectEdit, type EditRequest, type ObjectEditRequest } from './edit.js';
import { inventoryAssets } from './assets.js';
import { validateClan } from './validate.js';
import { prepareArt, saveArt, type ArtRequest } from './art.js';
import { createClan } from './create.js';
import { buildClan, buildStatus } from './build.js';
import { commitClan, downloadDll, publishStatus, pushClan } from './publish.js';

const execFileAsync = promisify(execFile);
const port = Number(process.env.CLAN_EDITOR_PORT ?? 4318);

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage, limit = 1_000_000): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Se necesita Content-Type: application/json.');
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString();
    if (text.length > limit) throw new Error('Solicitud demasiado grande.');
  }
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Se necesita un objeto JSON.');
  return parsed as Record<string, unknown>;
}

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Falta ${name}.`);
  return value;
}

async function pickFolder(): Promise<string> {
  if (process.platform === 'win32') {
    const script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Selecciona la carpeta del clan'; if ($d.ShowDialog() -eq 'OK') { [Console]::Write($d.SelectedPath) }";
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { timeout: 120_000, windowsHide: false });
    return stdout.trim();
  }
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Selecciona la carpeta del clan")'], { timeout: 120_000 });
    return stdout.trim();
  }
  const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=Selecciona la carpeta del clan'], { timeout: 120_000 });
  return stdout.trim();
}

const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) {
    const dist = path.join(projectRoot, 'dist');
    const candidate = path.resolve(dist, '.' + pathname);
    const file = inside(dist, candidate) && (await fs.stat(candidate).catch(() => null))?.isFile() ? candidate : path.join(dist, 'index.html');
    const bytes = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/api/config') {
    const [navigation, fields, stats, assets, mechanics, creation] = await Promise.all(['navigation.json', 'fields.json', 'stats.json', 'assets.json', 'mechanics.json', 'templates/new-clan.json'].map(file => fs.readFile(path.join(configRoot, file), 'utf8').then(JSON.parse)));
    return send(res, 200, { navigation, fields, stats, assets, mechanics, creation: { minimumDraftCards: creation.banner.unitCount, defaultDraftCards: creation.defaultDraftCards, maximumDraftCards: creation.maxDraftCards } });
  }
  if (req.method === 'GET' && pathname === '/api/library') return send(res, 200, await loadLibrary());
  if (req.method === 'POST' && pathname === '/api/library') {
    const input = await body(req);
    const item = await addLibraryPath(required(input.path, 'path'));
    return send(res, 200, item);
  }
  if (req.method === 'POST' && pathname === '/api/create') {
    const input = await body(req);
    const champions = input.champions;
    const starters = input.starters;
    if (!Array.isArray(champions) || champions.length !== 2 || !champions.every(value => typeof value === 'string')) throw new Error('Se necesitan dos campeones.');
    if (!Array.isArray(starters) || starters.length !== 2 || !starters.every(value => typeof value === 'string')) throw new Error('Se necesitan dos cartas iniciales.');
    const root = await createClan({ destination: required(input.destination, 'destination'), name: required(input.name, 'name'), id: required(input.id, 'id'), author: required(input.author, 'author'), champions: champions as [string, string], starters: starters as [string, string], draftCount: Number(input.draftCount) });
    const item = await addLibraryPath(root);
    return send(res, 200, item);
  }
  if (req.method === 'POST' && pathname === '/api/pick-folder') {
    const selected = await pickFolder();
    return send(res, 200, { path: selected });
  }
  const libraryMatch = pathname.match(/^\/api\/library\/([a-f0-9]+)$/);
  if (req.method === 'DELETE' && libraryMatch) {
    await removeLibraryItem(libraryMatch[1]);
    return send(res, 200, { ok: true });
  }
  const clanMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)$/);
  if (req.method === 'GET' && clanMatch) {
    const item = await getLibraryItem(clanMatch[1]);
    const snapshot = await scanClan(item.root);
    snapshot.issues = await validateClan(snapshot);
    return send(res, 200, snapshot);
  }
  const inventoryMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/assets$/);
  if (req.method === 'GET' && inventoryMatch) {
    const item = await getLibraryItem(inventoryMatch[1]);
    return send(res, 200, await inventoryAssets(await scanClan(item.root)));
  }
  const validationMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/validation$/);
  if (req.method === 'GET' && validationMatch) {
    const item = await getLibraryItem(validationMatch[1]);
    return send(res, 200, await validateClan(await scanClan(item.root)));
  }
  const publishMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/publish(?:\/(commit|push|download))?$/);
  if (publishMatch) {
    const item = await getLibraryItem(publishMatch[1]);
    if (req.method === 'GET' && !publishMatch[2]) return send(res, 200, await publishStatus(item.root));
    if (req.method === 'POST' && publishMatch[2] === 'commit') {
      const input = await body(req);
      return send(res, 200, await commitClan(item.root, required(input.message, 'message')));
    }
    if (req.method === 'POST' && publishMatch[2] === 'push') return send(res, 200, await pushClan(item.root));
    if (req.method === 'POST' && publishMatch[2] === 'download') {
      const input = await body(req);
      return send(res, 200, await downloadDll(item.root, Number(input.runId)));
    }
  }
  const buildMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/build$/);
  if (buildMatch) {
    const item = await getLibraryItem(buildMatch[1]);
    if (req.method === 'GET') return send(res, 200, await buildStatus(item.root));
    if (req.method === 'POST') {
      const input = await body(req);
      return send(res, 200, await buildClan(item.root, required(input.project, 'project')));
    }
  }
  if (req.method === 'GET' && pathname === '/api/stats') {
    const items = await loadLibrary();
    const results = await Promise.all(items.map(async item => {
      try { return await summarizeClan(await scanClan(item.root)); }
      catch (error) { return { key: item.key, root: item.root, name: path.basename(item.root), error: (error as Error).message }; }
    }));
    return send(res, 200, { rules: await loadStatsRules(), clans: results });
  }
  const assetMatch = pathname.match(/^\/api\/assets\/([a-f0-9]+)$/);
  if (req.method === 'GET' && assetMatch) {
    const item = await getLibraryItem(assetMatch[1]);
    const relative = required(url.searchParams.get('file'), 'file');
    const absolute = path.resolve(item.root, relative);
    if (!inside(item.root, absolute) || !/\.(png|jpe?g|webp)$/i.test(absolute)) throw new Error('Ruta de imagen no permitida.');
    const bytes = await fs.readFile(absolute);
    res.writeHead(200, { 'Content-Type': mime[path.extname(absolute).toLowerCase()] ?? 'image/jpeg', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
    return;
  }
  const assetHashMatch = pathname.match(/^\/api\/assets\/([a-f0-9]+)\/hash$/);
  if (req.method === 'GET' && assetHashMatch) {
    const item = await getLibraryItem(assetHashMatch[1]);
    const relative = required(url.searchParams.get('file'), 'file');
    const absolute = path.resolve(item.root, relative);
    if (!inside(item.root, absolute) || path.extname(absolute).toLowerCase() !== '.png') throw new Error('Ruta de imagen no permitida.');
    return send(res, 200, { hash: createHash('sha256').update(await fs.readFile(absolute)).digest('hex') });
  }
  if (req.method === 'POST' && (pathname === '/api/art/preview' || pathname === '/api/art/save')) {
    const input = await body(req, 21_000_000);
    const item = await getLibraryItem(required(input.key, 'key'));
    const mode = required(input.mode, 'mode');
    if (mode !== 'preserve' && mode !== 'match-existing') throw new Error('Modo de ajuste no válido.');
    const request: ArtRequest = { root: item.root, spriteId: required(input.spriteId, 'spriteId'), file: required(input.file, 'file'), imageBase64: required(input.imageBase64, 'imageBase64'), mode, expectedHash: required(input.expectedHash, 'expectedHash') };
    if (pathname.endsWith('/save')) return send(res, 200, await saveArt(request));
    const preview = await prepareArt(request);
    return send(res, 200, { changed: preview.changed, oldWidth: preview.oldWidth, oldHeight: preview.oldHeight, sourceWidth: preview.sourceWidth, sourceHeight: preview.sourceHeight, newWidth: preview.newWidth, newHeight: preview.newHeight, image: `data:image/png;base64,${preview.output.toString('base64')}` });
  }
  if (req.method === 'POST' && (pathname === '/api/edit/preview' || pathname === '/api/edit/save')) {
    const input = await body(req);
    const item = await getLibraryItem(required(input.key, 'key'));
    const edit: EditRequest = {
      root: item.root, section: required(input.section, 'section'), id: required(input.id, 'id'),
      file: required(input.file, 'file'), field: required(input.field, 'field'),
      value: input.value, expectedHash: required(input.expectedHash, 'expectedHash')
    };
    if (pathname.endsWith('/preview')) {
      const preview = await prepareEdit(edit);
      return send(res, 200, { changed: preview.changed, file: preview.file, field: preview.field, before: preview.before, after: preview.after });
    }
    return send(res, 200, await saveEdit(edit));
  }
  if (req.method === 'POST' && (pathname === '/api/object/preview' || pathname === '/api/object/save')) {
    const input = await body(req);
    const item = await getLibraryItem(required(input.key, 'key'));
    const edit: ObjectEditRequest = {
      root: item.root, section: required(input.section, 'section'), id: required(input.id, 'id'),
      file: required(input.file, 'file'), json: required(input.json, 'json'),
      expectedHash: required(input.expectedHash, 'expectedHash')
    };
    if (pathname.endsWith('/preview')) {
      const preview = await prepareObjectEdit(edit);
      return send(res, 200, { changed: preview.changed, file: preview.file, before: preview.before, after: preview.after });
    }
    return send(res, 200, await saveObjectEdit(edit));
  }
  send(res, 404, { error: 'Ruta no encontrada.' });
}

createServer((req, res) => {
  route(req, res).catch(error => send(res, error?.code === 'ENOENT' ? 404 : 400, { error: (error as Error).message }));
}).listen(port, '127.0.0.1', () => console.log(`Editor de clanes: http://127.0.0.1:${port}`));
