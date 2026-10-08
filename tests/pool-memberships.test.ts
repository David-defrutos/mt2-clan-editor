import test from 'node:test';
import assert from 'node:assert/strict';
import {cardPoolMemberships,localPoolRef} from '../src/web/pool-memberships.ts';
import type {ClanSnapshot,Entry} from '../src/web/types.ts';
test('filtros y desbloqueos reconocen ambas fuentes de pertenencias, cantidades y referencias externas',()=>{
 const rules={itemField:'item',countField:'count',minimumCount:1,maximumEditableCount:2147483647};
 const card={id:'Card',section:'cards',data:{pools:[{item:'MegaPool',count:3},{item:{id:'@Local',keep:1},count:2},{item:{id:'@MegaPool',mod_reference:'Other'},count:4},{item:'Broken',count:0}]}} as Entry;
 const clan={entries:[card,{id:'Direct',section:'card_pools',data:{cards:[{item:{id:'@Card',keep:7},count:5}]}},{id:'External',section:'card_pools',data:{cards:[{item:{id:'@Card',mod_reference:'Other'},count:2}]}}]} as ClanSnapshot;
 const original=JSON.stringify(clan);assert.deepEqual(cardPoolMemberships(clan,card,rules),['MegaPool','@Local','@Direct']);assert.equal(JSON.stringify(clan),original);
 assert.equal(localPoolRef({item:'MegaPool',count:1.5},rules),undefined);
 assert.equal(localPoolRef({entry:'MegaPool',amount:2},{...rules,itemField:'entry',countField:'amount'}),'MegaPool');
});
