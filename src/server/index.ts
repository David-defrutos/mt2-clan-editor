import {officialArtCatalog,officialArtImage} from './official-art.js';
import {exampleCatalog,copyExample} from './examples.js';
import {poolCountModel, preparePoolCount, savePoolCount, type PoolCountRequest} from './pool-count.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { languageCatalogs } from './locales.js';
import { promisify } from 'node:util';
import { addLibraryPath, getLibraryItem, loadLibrary, removeLibraryItem } from './library.js';
import { configRoot, inside, projectRoot } from './paths.js';
import { scanClan } from './scan.js';
import { loadStatsRules, statsDetails, summarizeClan } from './stats.js';
import { prepareEdit, saveEdit, prepareObjectEdit, saveObjectEdit, type EditRequest, type ObjectEditRequest } from './edit.js';
import { inventoryAssets } from './assets.js';
import { artChecklist } from './art-checklist.js';
import { analyzeArt } from './art-analysis.js';
import { validateClan } from './validate.js';
import { prepareArt, saveArt, type ArtRequest } from './art.js';
import { createClan } from './create.js';
import { discoverMods, importDiscovered } from './discovery.js';
import { visualCatalog, prepareVisualAssignment, saveVisualAssignment, type VisualRequest } from './visual-assignments.js';
import { bundleInventory } from './resource-review.js';
import { referenceModel, prepareReference, saveReference, type ReferenceRequest } from './reference-editor.js';
import { mechanicsSupport } from './mechanics-support.js';
import {contentActionRules,prepareContentAction,saveContentAction,type ActionRequest} from './content-actions.js';
import { prepareVisualCopy, saveVisualCopy, type VisualCopyRequest } from './visual-copy.js';
import { spawnRules, spawnModel, prepareSpawnAssignment, saveSpawnAssignment, type SpawnRequest } from './spawn-assignment.js';
import { poolModel, preparePoolChanges, savePoolChanges, type PoolChange } from './pool-editor.js';
import { poolAssignmentRules, poolAssignmentModel, preparePoolAssignment, savePoolAssignment, type PoolAssignmentRequest } from './pool-assignment.js';
import { rewardSettingsModel, prepareRewardSettings, saveRewardSettings, type RewardSettingsRequest } from './reward-settings.js';
import { characterPoolRules, characterPoolModel, prepareCharacterPool, saveCharacterPool, type CharacterPoolRequest } from './character-pool.js';
import { prepareContent, saveContent, contentTemplates, type ContentRequest } from './content.js';
import { buildClan, buildStatus } from './build.js';
import { buildOffline, offlineStatus } from './offline-build.js';
import { artifactStatus, packageClan } from './artifacts.js';
import { prepareUnlocks, progressionStatus, saveUnlocks, type UnlockChange } from './progression.js';
import { commitClan, downloadDll, publishStatus, pushClan } from './publish.js';
import { championRules, describeChampions, combineChampion } from './champions.js';
import { prepareChampionTree, saveChampionTree, type TreeRequest } from './champion-tree.js';
import { characterBackground, characterModels, prepareCharacterTransform, saveCharacterTransform, type CharacterRequest } from './character-preview.js';

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
  if (req.method === 'GET' && pathname === '/api/languages') return send(res,200,await languageCatalogs());
  if (!pathname.startsWith('/api/')) {
    const dist = path.join(projectRoot, 'dist');
    const candidate = path.resolve(dist, '.' + pathname);
    const file = inside(dist, candidate) && (await fs.stat(candidate).catch(() => null))?.isFile() ? candidate : path.join(dist, 'index.html');
    const bytes = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/official-art') { const model=await officialArtCatalog();return send(res,200,{rules:model.rules,rows:model.rows.map(({file,sha256,...row})=>row)}); }
  if (req.method === 'GET' && pathname === '/api/official-art/image') { const bytes=await officialArtImage(required(url.searchParams.get('id'),'id'));res.writeHead(200,{'Content-Type':'image/png','X-Content-Type-Options':'nosniff'});res.end(bytes);return; }
  if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/api/reward-templates') {
    const rules = JSON.parse(await fs.readFile(path.join(configRoot, 'templates/content.json'), 'utf8'));
    return send(res, 200, Object.entries(rules.rewards).map(([id, value]) => ({ id, label: (value as { label: string }).label })));
  }
  if (req.method === 'GET' && pathname === '/api/spawn-rules') return send(res, 200, await spawnRules());
  if (req.method === 'GET' && pathname === '/api/pool-assignment-rules') return send(res, 200, await poolAssignmentRules());
  if (req.method === 'GET' && pathname === '/api/character-pool-rules') return send(res, 200, await characterPoolRules());
  if (req.method === 'GET' && pathname === '/api/character-background') {
    const file = await characterBackground();
    if (!file) return send(res, 404, { error: 'No hay una captura de fondo configurada.' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await fs.readFile(file));
    return;
  }
  if (req.method === 'GET' && pathname === '/api/config') {
    const [navigation, fields, stats, assets, mechanics, creation, poolReferences] = await Promise.all(['navigation.json', 'fields.json', 'stats.json', 'assets.json', 'mechanics.json', 'templates/new-clan.json', 'pool-references.json'].map(file => fs.readFile(path.join(configRoot, file), 'utf8').then(JSON.parse)));
    return send(res, 200, { navigation, fields, stats, assets, mechanics, poolReferences, creation: { minimumDraftCards: creation.banner.unitCount, defaultDraftCards: creation.defaultDraftCards, maximumDraftCards: creation.maxDraftCards } });
  }
  if (req.method === 'GET' && pathname === '/api/examples') return send(res,200,await exampleCatalog());
  if (req.method === 'POST' && pathname === '/api/examples/copy') { const input=await body(req);const id=required(input.id,'id');const root=await copyExample(id);const example=(await exampleCatalog()).find(e=>e.id===id)!;return send(res,200,example.kind==='source'?{root,kind:'source'}:{...await addLibraryPath(root),kind:'clan'}); }
  if (req.method === 'GET' && pathname === '/api/library') return send(res, 200, await loadLibrary());
  if (req.method === 'POST' && pathname === '/api/library/discover') {
    const input = await body(req);
    return send(res, 200, await discoverMods(typeof input.path === 'string' && input.path.trim() ? input.path.trim() : undefined));
  }
  if (req.method === 'POST' && pathname === '/api/library/import') {
    const input = await body(req);
    return send(res, 200, await importDiscovered(required(input.path, 'path')));
  }
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
  const contentMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/content\/(preview|save)$/);
  if(req.method==='GET'&&pathname==='/api/content-actions')return send(res,200,await contentActionRules());
  const contentActionMatch=pathname.match(/^\/api\/clans\/([a-f0-9]+)\/content-actions\/(preview|save)$/);
  if(req.method==='POST'&&contentActionMatch){const item=await getLibraryItem(contentActionMatch[1]);const input=await body(req);const request={...input,root:item.root} as ActionRequest;if(contentActionMatch[2]==='save')return send(res,200,await saveContentAction(request));const p=await prepareContentAction(request);return send(res,200,{changed:p.changed,changes:p.changes,token:p.token});}
  const templatesMatch=pathname.match(/^\/api\/clans\/([a-f0-9]+)\/content-templates$/);
  if(req.method==='GET'&&pathname==='/api/content-sections'){const config=JSON.parse(await fs.readFile(path.join(configRoot,'templates/content.json'),'utf8'));return send(res,200,[{id:'rewards',label:'recompensa'},...Object.entries(config.objects).map(([id,value])=>({id,label:(value as {label:string}).label}))]);}
  if(req.method==='GET'&&templatesMatch){const item=await getLibraryItem(templatesMatch[1]);return send(res,200,await contentTemplates(item.root,required(url.searchParams.get('section'),'section')));}
  const referenceMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/references(?:\/(preview|save))?$/);
  if (referenceMatch) {
    const item = await getLibraryItem(referenceMatch[1]);
    if (req.method === 'GET' && !referenceMatch[2]) return send(res,200,await referenceModel(await scanClan(item.root),required(url.searchParams.get('section'),'section'),required(url.searchParams.get('id'),'id'),required(url.searchParams.get('file'),'file')));
    if (req.method === 'POST' && referenceMatch[2]) {
      const input=await body(req);
      const request={...input,root:item.root,section:required(input.section,'section'),id:required(input.id,'id'),file:required(input.file,'file'),field:required(input.field,'field'),expectedHash:required(input.expectedHash,'expectedHash')} as ReferenceRequest;
      const preview=referenceMatch[2]==='save'?await saveReference(request):await prepareReference(request);
      return send(res,200,referenceMatch[2]==='save'?preview: {changed:preview.changed,before:'before' in preview?preview.before:undefined,after:'after' in preview?preview.after:undefined,token:'token' in preview?preview.token:undefined,uses:'uses' in preview?preview.uses:[]});
    }
  }
  const visualMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/visual-assignments(?:\/(preview|save))?$/);
  const visualCopyMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/visual-copy\/(preview|save)$/);
  const spawnMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/spawn-assignment(?:\/(preview|save))?$/);
  const characterPoolMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/character-pool(?:\/(preview|save))?$/);
  if (characterPoolMatch) {
    const item = await getLibraryItem(characterPoolMatch[1]);
    if (req.method === 'GET' && !characterPoolMatch[2]) return send(res, 200, await characterPoolModel(item.root, required(url.searchParams.get('file'), 'file'), required(url.searchParams.get('id'), 'id')));
    if (req.method === 'POST' && characterPoolMatch[2]) {
      const input = await body(req); if (!Array.isArray(input.changes)) throw new Error('Falta la lista de cambios.');
      const request: CharacterPoolRequest = { root: item.root, file: required(input.file, 'file'), id: required(input.id, 'id'), expectedHash: required(input.expectedHash, 'expectedHash'), changes: input.changes as CharacterPoolRequest['changes'], expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
      if (characterPoolMatch[2] === 'save') return send(res, 200, await saveCharacterPool(request));
      const preview = await prepareCharacterPool(request); return send(res, 200, { changed: preview.changed, changes: preview.changes, members: preview.members, uses: preview.uses, token: preview.token });
    }
  }
  const rewardSettingsMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/reward-settings(?:\/(preview|save))?$/);
  if (rewardSettingsMatch) {
    const item = await getLibraryItem(rewardSettingsMatch[1]);
    if (req.method === 'GET' && !rewardSettingsMatch[2]) return send(res, 200, await rewardSettingsModel(item.root, required(url.searchParams.get('file'), 'file'), required(url.searchParams.get('id'), 'id')));
    if (req.method === 'POST' && rewardSettingsMatch[2]) {
      const input = await body(req);
      const request: RewardSettingsRequest = { root: item.root, file: required(input.file, 'file'), id: required(input.id, 'id'), field: required(input.field, 'field'), value: input.value, expectedHash: required(input.expectedHash, 'expectedHash'), expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
      if (rewardSettingsMatch[2] === 'save') return send(res, 200, await saveRewardSettings(request));
      const preview = await prepareRewardSettings(request);
      return send(res, 200, { changed: preview.changed, label: preview.label, before: preview.before, after: preview.after, token: preview.token });
    }
  }
  const poolAssignmentMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/pool-assignment(?:\/(preview|save))?$/);
  if (poolAssignmentMatch) {
    const item = await getLibraryItem(poolAssignmentMatch[1]);
    if (req.method === 'GET' && !poolAssignmentMatch[2]) return send(res, 200, await poolAssignmentModel(item.root, required(url.searchParams.get('section'), 'section'), required(url.searchParams.get('file'), 'file'), required(url.searchParams.get('id'), 'id')));
    if (req.method === 'POST' && poolAssignmentMatch[2]) {
      const input = await body(req);
      const request: PoolAssignmentRequest = { root: item.root, section: required(input.section, 'section'), file: required(input.file, 'file'), id: required(input.id, 'id'), poolId: required(input.poolId, 'poolId'), expectedHash: required(input.expectedHash, 'expectedHash'), expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
      if (poolAssignmentMatch[2] === 'save') return send(res, 200, await savePoolAssignment(request));
      const preview = await preparePoolAssignment(request);
      return send(res, 200, { changed: preview.changed, label: preview.label, before: preview.before, after: preview.after, pool: preview.pool, uses: preview.uses, token: preview.token });
    }
  }
  const poolCountMatch=pathname.match(/^\/api\/clans\/([a-f0-9]+)\/pool-count(?:\/(preview|save))?$/);
  if(poolCountMatch){
    const item=await getLibraryItem(poolCountMatch[1]);
    if(req.method==='GET' && !poolCountMatch[2])return send(res,200,await poolCountModel(item.root,required(url.searchParams.get('pool'),'pool'),required(url.searchParams.get('id'),'id')));
    if(req.method==='POST' && poolCountMatch[2]){
      const input=await body(req);const request:PoolCountRequest={root:item.root,pool:required(input.pool,'pool'),id:required(input.id,'id'),entry:required(input.entry,'entry'),count:input.count as number,expectedHash:required(input.expectedHash,'expectedHash'),expectedToken:typeof input.expectedToken==='string'?input.expectedToken:undefined};
      if(poolCountMatch[2]==='save')return send(res,200,await savePoolCount(request));
      const preview=await preparePoolCount(request);
      return send(res,200,{changed:preview.changed,before:preview.before,after:preview.after,totalBefore:preview.totalBefore,totalAfter:preview.totalAfter,file:preview.file,token:preview.token});
    }
  }
  const poolsMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/pools(?:\/(preview|save))?$/);
  if (poolsMatch) {
    const item = await getLibraryItem(poolsMatch[1]);
    if (req.method === 'GET' && !poolsMatch[2]) return send(res, 200, await poolModel(item.root));
    if (req.method === 'POST' && poolsMatch[2]) {
      const input = await body(req);
      if (!Array.isArray(input.changes)) throw new Error('Falta la lista de cambios.');
      const request = { root: item.root, pool: required(input.pool, 'pool'), changes: input.changes as PoolChange[], expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
      if (poolsMatch[2] === 'save') return send(res, 200, await savePoolChanges(request));
      const preview = await preparePoolChanges(request);
      return send(res, 200, { pool: preview.pool, warning: preview.warning, changes: preview.changes, files: preview.files.map(f => f.file), token: preview.token });
    }
  }
  if (spawnMatch) {
    const item = await getLibraryItem(spawnMatch[1]);
    if (req.method === 'GET' && !spawnMatch[2]) return send(res, 200, await spawnModel(item.root, required(url.searchParams.get('file'), 'file'), required(url.searchParams.get('id'), 'id')));
    if (req.method === 'POST' && spawnMatch[2]) {
      const input = await body(req);
      const request: SpawnRequest = { root: item.root, file: required(input.file, 'file'), id: required(input.id, 'id'), field: required(input.field, 'field'), characterId: input.characterId === null ? null : required(input.characterId, 'characterId'), expectedHash: required(input.expectedHash, 'expectedHash'), expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
      if (spawnMatch[2] === 'save') return send(res, 200, await saveSpawnAssignment(request));
      const preview = await prepareSpawnAssignment(request);
      return send(res, 200, { changed: preview.changed, label: preview.label, before: preview.before, after: preview.after, character: preview.character, uses: preview.uses, token: preview.token });
    }
  }
  if (visualCopyMatch && req.method === 'POST') {
    const item = await getLibraryItem(visualCopyMatch[1]);
    const input = await body(req);
    const request: VisualCopyRequest = { root: item.root, section: required(input.section, 'section'), file: required(input.file, 'file'), id: required(input.id, 'id'), field: required(input.field, 'field'), sourceId: required(input.sourceId, 'sourceId'), newId: required(input.newId, 'newId'), expectedHash: required(input.expectedHash, 'expectedHash'), expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
    if (visualCopyMatch[2] === 'save') return send(res, 200, await saveVisualCopy(request));
    const preview = await prepareVisualCopy(request);
    return send(res, 200, { file: preview.file, token: preview.token, document: preview.document, images: preview.images.map(image => image.file), sourceUses: preview.sourceUses });
  }
  if (visualMatch) {
    const item = await getLibraryItem(visualMatch[1]);
    if (req.method === 'GET' && !visualMatch[2]) return send(res, 200, await visualCatalog(await scanClan(item.root), required(url.searchParams.get('section'), 'section'), url.searchParams.has('id') ? { id: required(url.searchParams.get('id'), 'id'), file: required(url.searchParams.get('file'), 'file') } : undefined));
    if (req.method === 'POST' && visualMatch[2]) {
      const input = await body(req);
      const request: VisualRequest = { root: item.root, section: required(input.section, 'section'), file: required(input.file, 'file'), id: required(input.id, 'id'), field: required(input.field, 'field'), targetId: required(input.targetId, 'targetId'), expectedHash: required(input.expectedHash, 'expectedHash') };
      return send(res, 200, visualMatch[2] === 'save' ? await saveVisualAssignment(request) : await prepareVisualAssignment(request));
    }
  }
  if (contentMatch && req.method === 'POST') {
    const item = await getLibraryItem(contentMatch[1]);
    const input = await body(req);
    if (!['cards','characters','upgrades','card_pools','rewards','map_nodes','effects','relic_effects','character_triggers','card_triggers','relics'].includes(String(input.section))) throw new Error('Sección no permitida.');
    let source: ContentRequest['source'];
    if (input.source) {
      const candidate = input.source as Record<string, unknown>;
      source = { id: required(candidate.id, 'source.id'), file: required(candidate.file, 'source.file') };
    }
    const request: ContentRequest = { root: item.root, section: input.section as ContentRequest['section'], id: required(input.id, 'id'), name: typeof input.name==='string'?input.name:'', kind: input.kind as ContentRequest['kind'], poolId: typeof input.poolId === 'string' ? input.poolId : undefined, links:input.links as ContentRequest['links'], source, expectedToken: typeof input.expectedToken === 'string' ? input.expectedToken : undefined };
    if (contentMatch[2] === 'save') return send(res, 200, await saveContent(request));
    const preview = await prepareContent(request);
    return send(res, 200, { file: preview.file, token: preview.token, objects: preview.objects, warnings: preview.warnings, poolCopy: preview.poolCopy, document: preview.document, images: preview.images.map(image => image.file) });
  }
  const characterMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/character-art(?:\/(preview|save))?$/);
  if (characterMatch) {
    const item = await getLibraryItem(characterMatch[1]);
    if (req.method === 'GET' && !characterMatch[2]) return send(res, 200, await characterModels(await scanClan(item.root)));
    if (req.method === 'POST' && characterMatch[2]) {
      const input = await body(req);
      const request: CharacterRequest = { root: item.root, file: required(input.file, 'file'), id: required(input.id, 'id'), expectedHash: required(input.expectedHash, 'expectedHash'), changes: input.changes as CharacterRequest['changes'] };
      if (characterMatch[2] === 'save') return send(res, 200, await saveCharacterTransform(request));
      const preview = await prepareCharacterTransform(request);
      return send(res, 200, { changed: preview.changed, changes: preview.changes, uses: preview.uses });
    }
  }
  const treeMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/champions\/tree\/(preview|save)$/);
  if (treeMatch && req.method === 'POST') {
    const item = await getLibraryItem(treeMatch[1]);
    const input = await body(req);
    const request: TreeRequest = { root: item.root, file: required(input.file, 'file'), classId: required(input.classId, 'classId'), championIndex: Number(input.championIndex), expectedHash: required(input.expectedHash, 'expectedHash'), changes: input.changes as TreeRequest['changes'], structure: input.structure as TreeRequest['structure'] };
    if (treeMatch[2] === 'save') return send(res, 200, await saveChampionTree(request));
    const preview = await prepareChampionTree(request);
    return send(res, 200, { changed: preview.changed, file: preview.file, champion: preview.champion, changes: preview.changes, warnings: preview.warnings });
  }
  const championMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/champions(?:\/(preview))?$/);
  if (championMatch) {
    const item = await getLibraryItem(championMatch[1]);
    const rules = await championRules();
    const snapshot = await scanClan(item.root);
    const champions = describeChampions(snapshot, rules);
    if (req.method === 'GET' && !championMatch[2]) {
      const upgrades = snapshot.entries.filter(e => e.section === 'upgrades');
      return send(res, 200, { champions, upgrades, maxCombinedLevels: rules.maxCombinedLevels, maxSelectedPaths: rules.maxSelectedPaths, structure: rules.structure });
    }
    if (req.method === 'POST' && championMatch[2]) {
      const input = await body(req);
      if (!Number.isInteger(input.champion) || Number(input.champion) < 0 || Number(input.champion) >= champions.length) throw new Error('Campeón inválido.');
      return send(res, 200, combineChampion(champions[Number(input.champion)], input.levels, rules));
    }
  }
  const analysisMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/art-analysis$/);
  if (req.method === 'GET' && analysisMatch) {
    const item = await getLibraryItem(analysisMatch[1]);
    return send(res, 200, await analyzeArt(item.root, required(url.searchParams.get('file'), 'file')));
  }
  const checklistMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/art-checklist$/);
  if (req.method === 'GET' && checklistMatch) {
    const item = await getLibraryItem(checklistMatch[1]);
    return send(res, 200, await artChecklist(await scanClan(item.root)));
  }
  const resourceReviewMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/resource-review$/);
  const mechanicsSupportMatch=pathname.match(/^\/api\/clans\/([a-f0-9]+)\/mechanics-support$/);
  if(req.method==='GET'&&mechanicsSupportMatch){const item=await getLibraryItem(mechanicsSupportMatch[1]);return send(res,200,await mechanicsSupport(await scanClan(item.root)));}
  if (req.method === 'GET' && resourceReviewMatch) { const item = await getLibraryItem(resourceReviewMatch[1]); return send(res, 200, await bundleInventory(await scanClan(item.root))); }
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
  const progressionMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/progression(?:\/(preview|save))?$/);
  if (progressionMatch) {
    const item = await getLibraryItem(progressionMatch[1]);
    if (req.method === 'GET' && !progressionMatch[2]) return send(res, 200, await progressionStatus(item.root));
    if (req.method === 'POST') {
      const input = await body(req);
      if (!Array.isArray(input.changes)) throw new Error('Se necesita una lista de cambios.');
      if (progressionMatch[2] === 'save') return send(res, 200, await saveUnlocks(item.root, input.changes as UnlockChange[]));
      if (progressionMatch[2] === 'preview') {
        const preview = await prepareUnlocks(item.root, input.changes as UnlockChange[]);
        return send(res, 200, { changes: preview.changes, files: preview.files.map(file => file.file) });
      }
    }
  }
  const packageMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/package$/);
  if (packageMatch) {
    const item = await getLibraryItem(packageMatch[1]);
    if (req.method === 'GET') return send(res, 200, await artifactStatus(item.root));
    if (req.method === 'POST') return send(res, 200, await packageClan(item.root));
  }
  const buildMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/build$/);
  if (buildMatch) {
    const item = await getLibraryItem(buildMatch[1]);
    if (req.method === 'GET') return send(res, 200, { ...await buildStatus(item.root), offline: await offlineStatus() });
    if (req.method === 'POST') {
      const input = await body(req);
      if (input.mode === 'installed') return send(res, 200, await buildOffline(item.root, required(input.project, 'project')));
      return send(res, 200, await buildClan(item.root, required(input.project, 'project')));
    }
  }
  if (req.method === 'GET' && pathname === '/api/stats') {
    const items = await loadLibrary();
    const results = await Promise.all(items.map(async item => {
      try { const clan = await scanClan(item.root); clan.issues = await validateClan(clan); return await summarizeClan(clan); }
      catch (error) { return { key: item.key, root: item.root, name: path.basename(item.root), error: (error as Error).message }; }
    }));
    return send(res, 200, { rules: await loadStatsRules(), clans: results });
  }
  const statsMatch = pathname.match(/^\/api\/clans\/([a-f0-9]+)\/stats$/);
  if (req.method === 'GET' && statsMatch) {
    const item = await getLibraryItem(statsMatch[1]);
    const clan = await scanClan(item.root);
    clan.issues = await validateClan(clan);
    return send(res, 200, await statsDetails(clan, required(url.searchParams.get('metric'), 'metric')));
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
    const request: ArtRequest = { root: item.root, section: typeof input.section === 'string' ? input.section : undefined, spriteId: required(input.spriteId, 'spriteId'), file: required(input.file, 'file'), imageBase64: required(input.imageBase64, 'imageBase64'), mode, expectedHash: required(input.expectedHash, 'expectedHash'), expectedDefinitionHash: typeof input.expectedDefinitionHash === 'string' ? input.expectedDefinitionHash : undefined, compensateCharacterScale:input.compensateCharacterScale===true,expectedToken:typeof input.expectedToken==='string'?input.expectedToken:undefined };
    if (pathname.endsWith('/save')) return send(res, 200, await saveArt(request));
    const preview = await prepareArt(request);
    return send(res, 200, { changed: preview.changed, oldWidth: preview.oldWidth, oldHeight: preview.oldHeight, sourceWidth: preview.sourceWidth, sourceHeight: preview.sourceHeight, newWidth: preview.newWidth, newHeight: preview.newHeight, token:preview.token,compensations:preview.compensation.changes,warnings:preview.compensation.warnings,image: `data:image/png;base64,${preview.output.toString('base64')}` });
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
