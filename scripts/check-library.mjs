import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'config/acceptance.json'), 'utf8'));
const base = new URL(process.argv[2] || config.baseUrl);
// This check reads local editor endpoints; it never calls mutation or publishing routes.
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw Error('Usa la URL HTTP del editor local.');
async function read(route) {
  const response = await fetch(new URL('/api/' + route, base), {signal: AbortSignal.timeout(config.timeoutMs)});
  const value = await response.json();
  if (!response.ok) throw Error(value.error || `HTTP ${response.status}`);
  return value;
}
const library = await read('library');
if (!Array.isArray(library)) throw Error('La biblioteca no devuelve una lista.');
const report = {date: new Date().toISOString(), baseUrl: base.origin, scope: 'Lectura HTTP; no acredita guardado, aspecto visual ni ejecución en el juego.', clans: []};
for (const item of library) {
  const row = {key: item.key, name: path.basename(item.root), checks: [], validationErrors: null};
  for (const route of config.routes) {
    try {
      const value = await read(`clans/${item.key}${route.path}`);
      if (route.response === 'array' && !Array.isArray(value)) throw Error('Respuesta sin lista de personajes.');
      for (const field of route.requiredArrays) if (!Array.isArray(value[field])) throw Error(`Respuesta sin lista ${field}.`);
      if (!route.path) {
        row.name = value.name;
        const errors = value.issues.filter(issue => issue.severity === 'error');
        row.validationErrors = errors.length;
        row.errorCodes = errors.reduce((counts, issue) => ({...counts, [issue.code]: (counts[issue.code] || 0) + 1}), {});
        row.examples = errors.slice(0, 3);
      }
      row.checks.push({path: route.path || '/', status: 'ok', counts: route.response === 'array' ? {entries: value.length} : Object.fromEntries(route.requiredArrays.map(field => [field, value[field].length]))});
    } catch (error) {row.checks.push({path: route.path || '/', status: 'error', error: error.message});}
  }
  report.clans.push(row);
  console.log(`${row.checks.every(check => check.status === 'ok') ? 'OK' : 'ERROR'} · ${row.name} · errores de validación: ${row.validationErrors ?? 'sin leer'}`);
}
const output = path.join(root, 'data/acceptance/library-http.json');
await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Informe: ${output}`);
if (report.clans.some(row => row.checks.some(check => check.status !== 'ok'))) process.exitCode = 1;
