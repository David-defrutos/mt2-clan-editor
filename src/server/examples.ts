import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectRoot,dataRoot,configRoot,inside} from './paths.js';
import {scanClan} from './scan.js';
export interface Example {kind?:'clan'|'source';id:string;label:string;version:string;directory:string;files:{file:string;sha256:string}[]}
export interface CopyRules {excludedNames:string[];allowedExtensions:string[];allowedNames:string[];maximumFiles:number;maximumBytes:number}
export async function copyExampleFiles(source:string,destination:string,rules:CopyRules) {
 const files:Example['files']=[];let bytes=0;
 async function walk(relative:string){
  for(const item of await fs.readdir(path.join(source,relative),{withFileTypes:true})){
   if(item.name.startsWith('.')||rules.excludedNames.includes(item.name))continue;
   const next=path.join(relative,item.name);const from=path.join(source,next);const stat=await fs.lstat(from);
   if(stat.isSymbolicLink())throw new Error('Los ejemplos no pueden contener enlaces simbólicos.');
   if(stat.isDirectory()){await walk(next);continue;}
   if(!stat.isFile()||(!rules.allowedNames.includes(item.name)&&!rules.allowedExtensions.includes(path.extname(item.name).toLowerCase())))continue;
   bytes+=stat.size;if(files.length>=rules.maximumFiles||bytes>rules.maximumBytes)throw new Error('El ejemplo supera los límites de distribución configurados.');
   const buffer=await fs.readFile(from);
   if(path.extname(item.name)==='.config'&&/<packageSourceCredentials\b/i.test(buffer.toString('utf8')))throw new Error('El ejemplo contiene credenciales NuGet; retíralas antes de distribuir.');
   const target=path.join(destination,next);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,buffer,{flag:'wx'});
   files.push({file:next.replaceAll('\\','/'),sha256:createHash('sha256').update(buffer).digest('hex')});
  }
 }
 await walk('');return files;
}
export async function validateExample(source:string,kind:Example['kind']='clan') {
 if(kind==='source') {
  let code=false,project=false;
  async function visit(folder:string):Promise<void>{for(const item of await fs.readdir(folder,{withFileTypes:true})){if(item.name.startsWith('.')||['node_modules','bin','obj'].includes(item.name))continue;const file=path.join(folder,item.name);if(item.isSymbolicLink())throw new Error('Los ejemplos no pueden contener enlaces simbólicos.');if(item.isDirectory())await visit(file);else if(item.isFile()){code ||= item.name.endsWith('.cs');project ||= item.name.endsWith('.csproj');}}}
  await visit(source);if(!code||!project)throw new Error('El ejemplo de código debe incluir fuentes C# y un proyecto .csproj.');return;
 }
 if(kind!=='clan')throw new Error('Tipo de ejemplo inválido.');
 const clan=await scanClan(source);if(!clan.classId)throw new Error('El ejemplo no contiene una clase de clan.');
}
async function exampleRoot(){const rules=JSON.parse(await fs.readFile(path.join(configRoot,'distribution.json'),'utf8'));const root=path.resolve(projectRoot,rules.examples.directory);if(!inside(projectRoot,root)||root===projectRoot)throw new Error('Ruta de ejemplos inválida.');return root;}
export async function exampleCatalog():Promise<Example[]> {
 const root=await exampleRoot();const items=await fs.readFile(path.join(root,'index.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 if(!Array.isArray(items))throw new Error('Catálogo de ejemplos inválido.');
 for(const item of items){if(!/^[a-z0-9-]+$/.test(item.id)||item.directory!==item.id||typeof item.label!=='string'||!Array.isArray(item.files)||(item.kind!==undefined&&!['clan','source'].includes(item.kind)))throw new Error('Catálogo de ejemplos inválido.');}
 return items;
}
export async function copyExample(id:string){
 const item=(await exampleCatalog()).find(e=>e.id===id);if(!item)throw new Error('Ejemplo no disponible.');
 const root=await exampleRoot();const source=path.join(root,item.directory);if(!inside(await fs.realpath(root),await fs.realpath(source)))throw new Error('El ejemplo apunta fuera de su carpeta.');
 // Verify immutable published files before producing a working copy.
 for(const record of item.files){const file=path.resolve(source,record.file);if(!inside(source,file)||!inside(await fs.realpath(source),await fs.realpath(file)))throw new Error('Ruta de ejemplo inválida.');if(createHash('sha256').update(await fs.readFile(file)).digest('hex')!==record.sha256)throw new Error('El ejemplo distribuido cambió; utiliza una copia de trabajo.');}
 const folder=path.join(dataRoot,'example-workspaces');await fs.mkdir(folder,{recursive:true});const destination=await fs.mkdtemp(path.join(folder,item.id+'-'));
 try{const rules=JSON.parse(await fs.readFile(path.join(configRoot,'distribution-files.json'),'utf8'));await copyExampleFiles(source,destination,rules);await validateExample(destination,item.kind);return destination;}
 catch(e){await fs.rm(destination,{recursive:true,force:true});throw e;}
}
