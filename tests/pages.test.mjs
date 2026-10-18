import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalApi} from '../docs/local-store.mjs';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
const fixtures=JSON.parse(readFileSync(new URL('./fixtures.json',import.meta.url)));
test('GitHub 전용 계산기: 기존 318개 원문·계산 일치',async()=>{const api=createLocalApi(memory());for(const {raw,expected}of fixtures){const actual=await api('/api/parse',{raw});delete actual.saved_duplicates;assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);}});
test('기기별 단가·기록 유지, 기록 불변, 미등록 재계산',async()=>{const storage=memory();let api=createLocalApi(storage);const draft=await api('/api/parse',{raw:'가상새가게 2개 + 모짜 1개'});assert.equal(draft.total,null);assert.equal(draft.subtotal,30000);await api('/api/rates',{name:'가상새가게',amount:37000});const fixed=await api('/api/calculate',draft);assert.equal(fixed.total,104000);const saved=await api('/api/records',fixed);await api('/api/rates',{name:'가상새가게',amount:40000});api=createLocalApi(storage);assert.equal((await api('/api/records/'+saved.id)).snapshot.total,104000);assert.equal((await api('/api/catalog')).rates.find(r=>r.name==='가상새가게').amount,40000);assert.equal((await createLocalApi(memory())('/api/records')).length,0);});
test('저장 실패 시 성공으로 알리지 않음',async()=>{const api=createLocalApi({getItem:()=>null,setItem:()=>{throw Error('quota');}});await assert.rejects(api('/api/rates',{name:'가상',amount:40000}),/저장하지 못했습니다/);});
