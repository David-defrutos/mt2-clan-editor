import test from 'node:test';
import assert from 'node:assert/strict';
import {languageCatalogs} from '../src/server/locales.ts';
import {translate,resolveLanguage} from '../src/web/i18n-core.ts';
import {metricLabel,statisticsCsv} from '../src/web/statistics-export.ts';
import type {ClanStats} from '../src/web/types.ts';

test('CSV localizado conserva nombres con comillas, valores decimales y niveles técnicos',async()=>{
  const config=await languageCatalogs();
  const stats=[{name:'Clan, "Original"',cards:12,attack:{median:1.5},unlocks:{'99':2},costs:{'-1':3}}, {name:'Sin lectura',error:'No existe'}] as unknown as ClanStats[];
  const before=structuredClone(stats);
  const metrics=[{id:'cards',label:'Cartas totales'},{id:'attack.median',label:'Ataque mediano'},{id:'unlocks.99',label:'Desbloqueo nivel 99'},{id:'costs.-1',label:'Ember -1'}];
  const expectedLabels={es:['Cartas totales','Ataque mediano','Desbloqueo nivel 99','Ember -1'],en:['Total cards','Median attack','Unlock level 99','Ember -1']};
  for(const id of ['es','en'] as const){
    const language=resolveLanguage(config,id);const t=(source:string,values?:Record<string,string|number>)=>translate(language,source,values);
    const csv=statisticsCsv(stats,metrics,t);
    assert.equal(csv,'\uFEFF'+[
      `"${t('Métrica')}","Clan, ""Original""","Sin lectura"`,
      `"${expectedLabels[id][0]}","12","—"`,
      `"${expectedLabels[id][1]}","1.5","—"`,
      `"${expectedLabels[id][2]}","2","—"`,
      `"${expectedLabels[id][3]}","3","—"`
    ].join('\n'));
    assert.equal(metricLabel(metrics[2],t),expectedLabels[id][2]);
  }
  assert.deepEqual(stats,before);
});
