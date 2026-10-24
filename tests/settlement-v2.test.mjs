import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RATES as R,DEFAULT_RECEIPTS as G,DEFAULT_ALIASES as A,parseText,calculate,quantityUnits,moneyValue} from '../docs/engine.mjs';
import {createLocalApi} from '../docs/local-store.mjs';
const run=raw=>calculate(parseText(raw));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};

test('사용자 실제 입력: 자연어 5건, 방 번호 구분, 산술 합계는 작업으로 만들지 않음',()=>{
  const raw='샤이니 203티 한개반,라베바 한개반,도파민505 한개,도파민 504 반개,유앤미 209 2개 했습니다\n55000+55000+30000+15000+80000=235000원 입니당';
  const r=run(raw);
  assert.equal(r.total,235000);assert.equal(r.unresolved,0);assert.equal(r.rows.length,5);assert.equal(r.direction,'pay');
  assert.deepEqual(r.rows.map(x=>[x.store,x.room,x.quantity,x.amount]),[['샤이니','203티','1.5',55000],['라베바','','1.5',55000],['도파민','505','1',30000],['도파민','504','0.5',15000],['유앤미','209','2',80000]]);
  assert.equal(r.stated_totals.length,1);assert.equal(r.stated_totals[0].amount,235000);assert.equal(r.comparisons[0].difference,0);
  for(const row of r.rows)assert.ok(raw.includes(row.source));
});

test('직수: 받은 전체 금액에서 선수 몫을 뺀 징대만 차감',()=>{
  const r=run('킹스맨 고수부장 직수 1개 6만원');
  assert.equal(r.total,-20000);assert.equal(r.direction,'collect');assert.equal(r.settlement_label,'선수에게 받을 돈');
  assert.equal(r.rows[0].staff,'고수부장');assert.equal(r.rows[0].player_amount,40000);assert.equal(r.rows[0].receipt_amount,60000);assert.equal(r.rows[0].received_amount,60000);assert.equal(r.rows[0].receipt_source,'원문');
  assert.match(r.copy_text,/선수에게 받을 돈 20,000원/);assert.doesNotMatch(r.copy_text,/총 지급액 -/);
  assert.equal(run('킹스맨 직수 6만원 1개').total,-20000);
  assert.equal(run('킹스맨 1개 직수 60000').total,-20000);
});

test('가게별 직수 금액 기본값과 반개는 서로 다른 규칙',()=>{
  for(const [raw,total,share,receipt]of [
    ['킹스맨 1개 직수',-20000,40000,60000],['쿨노래방 1개 직수',-10000,40000,50000],
    ['역삼제우스 1개 직수',-15000,40000,55000],['쿨노래방 한개반 직수',-25000,55000,80000],
    ['킹스맨 반개직수 3만원',-15000,15000,30000],['미등록가게 반개 직수',-15000,15000,30000],
    ['쿨노래방 두개 직수 10만원',-20000,80000,100000]
  ]){const r=run(raw);assert.equal(r.total,total,raw);assert.equal(r.rows[0].player_amount,share);assert.equal(r.rows[0].receipt_amount,receipt);}
  assert.equal(run('쿨노래방 반개 + 쿨노래방 반개').total,30000);
  assert.equal(run('쿨노래방 반개 직수 + 쿨노래방 반개 직수').total,-30000);
});

test('최종 지급·회수·0원 표시 및 미확정 소계',()=>{
  assert.equal(run('샤이니 두개반, 킹스맨 1개 직수').total,75000);
  const zero=run('쿨노래방 1개, 킹스맨 두개 직수');assert.equal(zero.total,0);assert.equal(zero.direction,'none');assert.equal(zero.settlement_label,'주고받을 돈 없음');
  const pending=run('쿨노래방 1개 직수, 달토 1개 직수');assert.equal(pending.total,null);assert.equal(pending.subtotal,-10000);assert.equal(pending.direction,'pending');assert.equal(pending.unresolved,1);
});

test('자연어 개수·붙여 쓴 방·구분자·카카오 헤더와 선택 정보',()=>{
  for(const [q,n]of [['한 개 반',1.5],['한개반',1.5],['반개',.5],['반 개',.5],['두개',2],['세 개 반',3.5],['1.5개',1.5],['1개 반',1.5]]){const r=run('쿨노래방 '+q);assert.equal(r.rows[0].quantity,String(n));assert.equal(r.unresolved,0);}
  assert.equal(run('도파민505 한개; 쿨노래방 두개 / 킹스맨 반개').rows.length,3);
  assert.equal(run('도파민505 한개 쿨노래방 두개 킹스맨 반개').rows.length,3);
  const r=run('[가상선수] [오후 11:30] 10.23 쿨노래방 1개');assert.equal(r.total,40000);assert.equal(r.rows[0].date,'10.23');assert.equal(r.player,'가상선수');
  assert.equal(run('쿨노래방 1개').total,40000);
});

test('미등록 직수 금액 추측 금지, 원문 금액과 이번 건 수정 우선',()=>{
  assert.deepEqual(Object.keys(G).sort(),['역삼제우스','쿨노래방','킹스맨'].sort());
  assert.equal(run('달토 1개 직수').total,null);
  assert.equal(run('달토 1개 직수 6만원').total,-20000);
  const draft=run('쿨노래방 1개 직수 6만원');assert.equal(draft.total,-20000);
  draft.rows[0].override_received_amount=55000;
  const fixed=calculate(draft);assert.equal(fixed.total,-15000);assert.equal(fixed.rows[0].received_amount,60000);assert.equal(fixed.rows[0].receipt_source,'이번 건');
  fixed.rows[0].override_received_amount=null;assert.equal(calculate(fixed).total,-20000);
  const normal=run('쿨노래방 1개 5만원');assert.equal(normal.total,40000);assert.equal(normal.rows[0].is_direct,false);
});

test('불명확·부정 표현·미등록 가게를 자동으로 확정하거나 버리지 않음',()=>{
  for(const raw of ['도1 1개','도토리 1개','도파미 1개','쿨노래방 1개 직수 아님','쿨노래방 1개 직수 안받음','쿨노래방 1개 직수 5만원 6만원','쿨노래방 1개 4,,0만원'])assert.equal(run(raw).total,null,raw);
  const r=run('쿨노래방 1개\n알수없는 작업\n직수');assert.equal(r.rows.length,3);assert.equal(r.total,null);assert.equal(r.subtotal,40000);
  assert.equal(run('도 1개').total,30000);assert.equal(run('역제 1개 직수').total,-15000);
});

test('금액·개수 값 검증, 총액과 계산 결과는 입력 값으로 위조 불가',()=>{
  for(const v of ['0','-1','1.25','0.1','Infinity','10001'])assert.equal(quantityUnits(v),null);
  assert.equal(moneyValue('55,000','원'),55000);assert.equal(moneyValue('55000'),55000);assert.equal(moneyValue('5.5'),55000);assert.equal(moneyValue('5,50','원'),null);
  const d=run('쿨노래방 1개 직수');d.total=123;d.rows[0].amount=123;d.rows[0].receipt_amount=0;assert.equal(calculate(d).total,-10000);
  d.rows[0].override_received_amount=-1;assert.throws(()=>calculate(d),/직수 받은 금액/);
  d.rows[0].override_received_amount=null;d.rows[0].override_rate=1.5;assert.throws(()=>calculate(d),/단가는/);
  const missing=run('달토 1개 직수');missing.rows[0].confirmed=true;assert.equal(calculate(missing).total,null);
  assert.equal(run('체크').total,null);
});

test('동일 저장 키 이관: 기존 단가·별칭·기록 보존과 가게 금액 수정',async()=>{
  const storage=memory(),snapshot={raw:'예전 원문',player:'가상선수',total:777,subtotal:777,unresolved:0,dates:{'10.01':{subtotal:777,unresolved:0}},rows:[],copy_text:'예전 복사문'};
  storage.setItem('ace-settlement-github-v1',JSON.stringify({rates:{'쿨노래방':{amount:42000,note:'기존 설정'},'새가게':{amount:35000}},aliases:{'쿨':'쿨노래방','도':null},records:[{id:'old-record',created_at:'2026-10-01T00:00:00Z',snapshot}]}));
  let api=createLocalApi(storage),catalog=await api('/api/catalog');
  assert.equal(catalog.rates.find(r=>r.name==='쿨노래방').amount,42000);assert.equal(catalog.rates.find(r=>r.name==='쿨노래방').receipt_amount,50000);assert.equal(catalog.rates.find(r=>r.name==='새가게').receipt_amount,null);assert.equal(Object.hasOwn(catalog.aliases,'도'),false);
  assert.equal((await api('/api/parse',{raw:'쿨 1개 직수'})).total,-8000);
  await api('/api/rates',{name:'쿨노래방',amount:40000,receipt_amount:55000});
  await api('/api/rates',{name:'쿨노래방',amount:41000});
  api=createLocalApi(storage);assert.equal((await api('/api/parse',{raw:'쿨 1개 직수'})).total,-14000);
  assert.deepEqual((await api('/api/records/old-record')).snapshot,snapshot);
  await api('/api/rates',{name:'쿨노래방',amount:40000,receipt_amount:null});assert.equal((await api('/api/parse',{raw:'쿨 1개 직수'})).total,null);
  await assert.rejects(api('/api/rates',{name:'쿨노래방',amount:40000,receipt_amount:-1}),/가게 금액/);
});

test('저장된 음수 정산은 나중 단가 수정에도 불변, 예전 초안 직수는 다시 계산',async()=>{
  const api=createLocalApi(memory()),r=await api('/api/parse',{raw:'쿨노래방 1개 직수'}),saved=await api('/api/records',r);
  await api('/api/rates',{name:'쿨노래방',amount:45000,receipt_amount:55000});
  assert.equal((await api('/api/records/'+saved.id)).snapshot.total,-10000);
  assert.equal((await api('/api/records'))[0].total,-10000);
  const old={raw:'킹스맨 1개 직수 6만원',rows:[{id:'1',store:'킹스맨',quantity:'1',source:'킹스맨 1개 직수 6만원',stated_amount:60000,issues:[]}]};
  assert.equal(calculate(old,R,A,G).total,-20000);
});
