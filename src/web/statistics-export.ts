import type {ClanStats} from './types';
type Metric={id:string;label:string};
type Translator=(text:string,values?:Record<string,string|number>)=>string;
export function metricLabel(metric:Metric,t:Translator):string {
  if(metric.id.startsWith('unlocks.'))return t('Desbloqueo nivel {level}',{level:metric.id.slice(8)});
  if(metric.id.startsWith('costs.'))return t('Ember {cost}',{cost:metric.id.slice(6)});
  return t(metric.label);
}
export function statisticValue(stats:ClanStats,metric:string):string|number {
  if(stats.error)return '—';
  const value=metric.split('.').reduce<unknown>((object,key)=>object&&typeof object==='object'?(object as Record<string,unknown>)[key]:undefined,stats);
  return typeof value==='number'?value:metric.startsWith('attack.')||metric.startsWith('health.')?'—':0;
}
export function statisticsCsv(stats:ClanStats[],metrics:Metric[],t:Translator):string {
  const quote=(value:string|number)=>`"${String(value).replaceAll('"','""')}"`;
  return '\uFEFF'+[[t('Métrica'),...stats.map(s=>s.name)],...metrics.map(metric=>[metricLabel(metric,t),...stats.map(s=>statisticValue(s,metric.id))])].map(row=>row.map(quote).join(',')).join('\n');
}
