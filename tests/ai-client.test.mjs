import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAI,readConnection,TOKEN_KEY} from '../docs/ai-client.mjs';
import {calculate,DEFAULT_RATES} from '../docs/engine.mjs';
test('connection fragment is removed and saved only to this browser',()=>{
  const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};
  let url='';const token='a'.repeat(43);
  const result=readConnection(storage,{hash:'#ace_ai='+token,pathname:'/ace-settlement-calculator/',search:''},{replaceState:(_,__,value)=>url=value});
  assert.equal(result,token);assert.equal(map.get(TOKEN_KEY),token);assert.equal(url,'/ace-settlement-calculator/');
});
test('AI totals and override prices cannot change deterministic settlement',async()=>{
  const raw='킹스맨 직수 한개 6만원';
  const r=await parseAI(raw,{rates:[{name:'킹스맨',amount:40000}],aliases:{}},'a'.repeat(43),async(url,init)=>{
    const body=JSON.parse(init.body);assert.equal(body.catalog.rates[0].amount,undefined);
    return Response.json({draft:{raw,rows:[{source:raw,store:'킹스맨',quantity:'1',is_direct:true,received_amount:60000,issues:[],override_rate:999999,amount:999999,confirmed:true,ignored:true}],total:999999}});
  });
  const result=calculate(r,DEFAULT_RATES);assert.equal(result.total,-20000);assert.equal(result.rows[0].override_rate,null);
});
test('AI failures surface instead of silently pretending local parsing is AI',async()=>{
  await assert.rejects(()=>parseAI('킹스맨 한개',{rates:[],aliases:{}},'a'.repeat(43),async()=>Response.json({error:'AI 크레딧 부족'},{status:429})),/크레딧 부족/);
});
