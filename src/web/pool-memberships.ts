import type {ClanSnapshot,Entry} from './types';
export interface PoolReferenceSettings {itemField:string;countField:string;minimumCount:number;maximumEditableCount:number}
export function localPoolRef(value:unknown,rules:PoolReferenceSettings):string|undefined {
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const object=value as Record<string,unknown>;
  if(Object.hasOwn(object,rules.itemField)||Object.hasOwn(object,rules.countField)){
   const count=object[rules.countField];if(typeof count!=='number'||!Number.isSafeInteger(count)||count<rules.minimumCount||count>rules.maximumEditableCount)return;
   return localPoolRef(object[rules.itemField],rules);
  }
  if(object.mod_reference!==undefined)return;value=object.id;
 }
 return typeof value==='string'&&value.length>0?value:undefined;
}
export function cardPoolMemberships(clan:ClanSnapshot,card:Entry,rules:PoolReferenceSettings):string[]{
 const values=new Set<string>();
 for(const value of Array.isArray(card.data.pools)?card.data.pools:[]){const ref=localPoolRef(value,rules);if(ref)values.add(ref);}
 for(const pool of clan.entries.filter(e=>e.section==='card_pools'))if(Array.isArray(pool.data.cards)&&pool.data.cards.some(v=>localPoolRef(v,rules)==='@'+card.id))values.add('@'+pool.id);
 return [...values];
}
