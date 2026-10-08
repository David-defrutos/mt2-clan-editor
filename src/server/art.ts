import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { loadAssetRules } from './assets.js';
import { configRoot, dataRoot, inside, keyForPath } from './paths.js';
import { scanClan } from './scan.js';
import {prepareArtScale} from './art-scale.js';

export interface ArtRequest { root: string; section?: string; spriteId: string; file: string; imageBase64: string; mode: 'preserve' | 'match-existing'; expectedHash: string; expectedDefinitionHash?: string; compensateCharacterScale?:boolean; expectedToken?:string }
function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

export async function prepareArt(request: ArtRequest) {
  const rules = await loadAssetRules();
  const clan = await scanClan(request.root);
  const section = request.section ?? 'sprites';
  if (!rules.inventorySections.includes(section)) throw new Error('Sección de arte no permitida.');
  if (!['preserve','match-existing'].includes(request.mode)) throw new Error('Ajuste de imagen no permitido.');
  const matches = clan.entries.filter(entry => entry.section === section && entry.id === request.spriteId);
  const sprite = matches.length === 1 && matches[0].file === request.file ? matches[0] : undefined;
  if (!sprite) throw new Error('El sprite ya no existe. Actualiza el clan.');
  if (request.expectedDefinitionHash && sprite.hash !== request.expectedDefinitionHash) throw new Error('La definición cambió. Actualiza el recurso.');
  const image = sprite.data.path;
  if (typeof image !== 'string') throw new Error('El sprite no tiene ruta de imagen.');
  const absolute = path.resolve(request.root, image);
  if (!inside(request.root, absolute) || path.extname(absolute).toLowerCase() !== '.png') throw new Error('La ruta de imagen debe ser un PNG dentro del clan.');
  if (!inside(await fs.realpath(request.root), await fs.realpath(absolute))) throw new Error('La ruta resuelta sale del clan.');
  const original = await fs.readFile(absolute);
  if (hash(original) !== request.expectedHash) throw new Error('La imagen cambió en disco. Actualiza el recurso y revisa los cambios.');
  const source = Buffer.from(request.imageBase64, 'base64');
  if (!source.length || source.length > rules.maxUploadBytes) throw new Error('La imagen supera el tamaño permitido o está vacía.');
  const input = await sharp(source, { limitInputPixels: 100_000_000 }).metadata();
  if (!input.width || !input.height) throw new Error('No se pudo leer la imagen.');
  const current = await sharp(original).metadata();
  if (!current.width || !current.height) throw new Error('No se pudo leer la imagen actual.');
  const pipeline = sharp(source, { limitInputPixels: 100_000_000 }).rotate();
  const output = request.mode === 'match-existing'
    ? await pipeline.resize(current.width, current.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    : await pipeline.png().toBuffer();
  const metadata = await sharp(output).metadata();
  const compensation=request.compensateCharacterScale?await prepareArtScale(clan,image,current.width,current.height,metadata.width!,metadata.height!):{files:[],changes:[],warnings:[]};
  const token=hash(Buffer.from(JSON.stringify([clan.files.map(file=>[file,clan.entries.find(e=>e.file===file)?.hash]),image,hash(original),hash(output),request.compensateCharacterScale,await fs.readFile(path.join(configRoot,'character-preview.json'),'utf8')])));
  if(request.expectedToken&&request.expectedToken!==token)throw new Error('El clan o la imagen cambió. Previsualiza de nuevo.');
  return { absolute, image, original, token,compensation,originalHash: hash(original), oldWidth: current.width, oldHeight: current.height,
    sourceWidth: input.width, sourceHeight: input.height, newWidth: metadata.width, newHeight: metadata.height,
    changed: !output.equals(original), output };
}

const saving=new Set<string>();
export async function saveArt(request: ArtRequest) {
  if(request.compensateCharacterScale&&!request.expectedToken)throw new Error('Previsualiza la compensación antes de guardar.');
  const root=await fs.realpath(request.root);if(saving.has(root))throw new Error('Hay otro reemplazo de arte en curso.');saving.add(root);
  try{return await saveArtLocked(request);}finally{saving.delete(root);}
}
async function saveArtLocked(request: ArtRequest) {
  const preview = await prepareArt(request);
  if (!preview.changed) return { changed: false, image: preview.image };
  const backupRoot=path.join(dataRoot,'backups',keyForPath(request.root));await fs.mkdir(backupRoot,{recursive:true});const folder=await fs.mkdtemp(path.join(backupRoot,'art-'));
  const backup = path.join(folder,preview.image);
  const outputs=[...preview.compensation.files.map(f=>({absolute:path.resolve(request.root,f.file),file:f.file,before:Buffer.from(f.original),after:Buffer.from(f.newText)})),{absolute:preview.absolute,file:preview.image,before:preview.original,after:preview.output}];
  const written:typeof outputs=[];const staged:{temp:string;output:typeof outputs[number]}[]=[];
  try{
    for(const output of outputs){const targetBackup=path.join(folder,output.file);await fs.mkdir(path.dirname(targetBackup),{recursive:true});await fs.writeFile(targetBackup,output.before,{flag:'wx'});const temp=output.absolute+`.clan-editor-${randomUUID()}.tmp`;staged.push({temp,output});await fs.writeFile(temp,output.after,{flag:'wx'});}
    const current=await prepareArt(request);if(current.token!==preview.token)throw new Error('El clan cambió durante el guardado.');
    for(const {temp,output} of staged){if(hash(await fs.readFile(output.absolute))!==hash(output.before))throw new Error('Un archivo cambió durante el guardado.');await fs.rename(temp,output.absolute);written.push(output);}
  }catch(error){for(const output of written.reverse()){if(hash(await fs.readFile(output.absolute))===hash(output.after))await fs.writeFile(output.absolute,output.before);}throw error;}
  finally{for(const {temp} of staged)await fs.rm(temp,{force:true}).catch(()=>undefined);}
  return { changed: true, image: preview.image, backup, hash: hash(preview.output) };
}
