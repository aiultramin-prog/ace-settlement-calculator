import {createLocalApi} from './local-store.mjs';
const localApi=createLocalApi(window.localStorage);
'use strict';
const $ = id => document.getElementById(id);
const money = value => value == null ? '미확정' : `${Number(value).toLocaleString('ko-KR')}원`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let csrf = '', setupRequired = false, draft = null, catalog = {rates:[], aliases:{}}, revision = 0, timer = null, currentRecord = null, saving = false;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 4500); }
function error(message) { $('error').textContent = message; $('error').hidden = false; setTimeout(() => $('error').hidden = true, 9000); }
async function api(path,payload){ return localApi(path,payload); }
function run(action) { return async event => { try { await action(event); } catch(e) { error(e.message || '연결을 확인해 주세요.'); } }; }
async function initialize(){await loadCatalog();}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', run(async () => {
  document.querySelectorAll('.tab-content').forEach(panel => panel.hidden = panel.id !== button.dataset.tab);
  document.querySelectorAll('[data-tab]').forEach(tab => { tab.classList.toggle('active',tab===button); if(tab===button) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current'); });
  if (button.dataset.tab === 'rates') await loadCatalog();
  if (button.dataset.tab === 'history') await loadHistory();
  if (button.dataset.tab === 'connect') await loadNetwork();
})));
const EXAMPLE = '10.15 선수A\n달토 226 서준 조로 1개 4\n도파민 906 유성 석진 2개 6\n총10\n\n10.16 선수A\n마운틴1 지훈 3개 11.4\n세이렌 26 준우조교 3개 12\nS팡 2개 8\n총31.4\n\n총 41.4만 입니다';
$('example').addEventListener('click', () => { $('raw').value=EXAMPLE; markRawChanged(); $('raw').focus(); });
function markRawChanged() { if(draft) { $('result-status').textContent='원문 변경 · 다시 계산'; $('copy').disabled=true; $('save').disabled=true; } }
$('raw').addEventListener('input', markRawChanged);
$('calculate').addEventListener('click', run(async () => {
  $('calculate').disabled=true;
  try { clearTimeout(timer); revision++; draft=await api('/api/parse',{raw:$('raw').value}); render(); }
  finally { $('calculate').disabled=false; }
}));

async function recalculate() {
  if(!draft) return;
  clearTimeout(timer);
  const version=revision;
  const result=await api('/api/calculate',draft);
  if(version!==revision) return recalculate();
  draft=result; render();
}
function changed() { revision++; $('copy').disabled=true; $('save').disabled=true; $('result-status').textContent='다시 계산 중'; clearTimeout(timer); timer=setTimeout(run(recalculate),350); }
function input(row,field,label,type='text') { return `<label>${label}<input data-row="${esc(row.id)}" data-field="${field}" value="${esc(row[field])}" ${type==='number'?'type="number" min="0" step="1" inputmode="numeric"':'type="text"'} ${field==='quantity'?'inputmode="decimal"':''} maxlength="100"></label>`; }
function render() {
  const focus=document.activeElement; const active=focus?.dataset.field ? {id:focus.dataset.row,field:focus.dataset.field,start:focus.selectionStart,end:focus.selectionEnd}:null;
  $('result').hidden=false; $('detail-area').hidden=false; $('empty-result').hidden=true;
  const sourceDirty=$('raw').value!==draft.raw;
  $('copy').disabled=sourceDirty; $('save').disabled=sourceDirty||saving;
  $('result-status').textContent=draft.complete?'계산 완료':`확인 필요 ${draft.unresolved}건`;
  $('result-status').className=`badge ${draft.complete?'':'warning'}`;
  if(sourceDirty) { $('result-status').textContent='원문 변경 · 다시 계산'; $('result-status').className='badge warning'; }
  const groups=(mapping)=>Object.entries(mapping).map(([name,g])=>`<div class="summary-item"><span>${esc(name)}${g.unresolved?` · 확인 ${g.unresolved}건`:''}</span><strong>${money(g.subtotal)}${g.unresolved?' (소계)':''}</strong></div>`).join('');
  $('summary').innerHTML=`<label>선수 이름<input id="player" value="${esc(draft.player)}" placeholder="확실하지 않으면 직접 입력" maxlength="100"></label>${draft.complete?`<div class="total-box"><span>총 지급액</span><strong class="amount">${money(draft.total)}</strong><p>각 작업의 반개 금액을 따로 적용했습니다.</p></div>`:`<div class="pending-box"><h3>최종 지급액 미확정</h3><p>확인 필요 ${draft.unresolved}건${draft.rows.length?'':' · 계산할 작업 없음'}</p><p class="subtotal">계산된 소계 ${money(draft.subtotal)}</p><p>미확정 작업은 위 소계에 포함되지 않았습니다.</p></div>`}<p class="summary-label">가게별 계산 내역</p>${groups(draft.stores)}<p class="summary-label">영업일별 소계</p>${groups(draft.dates)}`;
  $('player').addEventListener('change',()=>{ draft.player=$('player').value.trim(); draft.rows.forEach(r=>r.player=draft.player); changed(); });
  const warnings=[...draft.duplicate_warnings];
  if(draft.saved_duplicates?.length) warnings.push(`같은 원문으로 저장된 기록 ${draft.saved_duplicates.length}건이 있습니다. 반복 제출 여부를 확인하세요. 자동 공제하지 않았습니다.`);
  $('duplicate-alert').innerHTML=warnings.map(w=>`<p class="notice">${esc(w)}</p>`).join('');
  $('rows').innerHTML=draft.rows.map(row=>`<article class="job ${row.status==='unresolved'?'needs-review':''}" data-job="${esc(row.id)}"><div class="job-head"><span class="job-number">작업 ${esc(row.id)} · ${esc(row.date||'날짜 미입력')}</span><strong class="${row.amount==null?'unresolved-amount':''}">${row.status==='excluded'?'계산 제외':row.amount==null?'확인 필요':money(row.amount)}</strong></div><div class="job-body"><div class="job-fields">${input(row,'store','가게')}${input(row,'quantity','개수')}${input(row,'date','영업일 (원문 표기)')}${input(row,'room','층 · 방')}${input(row,'player','선수')}${input(row,'staff','담당자 · 기타 이름')}</div>${row.review.length&&row.status!=='excluded'?`<p class="notice">${row.review.map(esc).join('<br>')}</p>`:''}<div class="rate-edit"><label>1개 지급 단가 (원)${row.base_rate_missing?' · 기본 단가 미등록':''}<input data-row="${esc(row.id)}" data-field="override_rate" type="number" inputmode="numeric" min="1" max="10000000" step="1" value="${row.rate??''}" placeholder="단가 입력 즉시 재계산"></label><button class="secondary" data-action="once" data-row="${esc(row.id)}">이번 건에만 적용</button><button class="secondary" data-action="save-rate" data-row="${esc(row.id)}">기본 단가로 저장</button></div><div class="job-footer"><span class="formula">${esc(row.formula||'계산식 확인 대기')}${row.amount!=null?` · ${esc(row.rate_source)}`:''}</span><p class="muted">기재액 ${row.stated_amount==null?'없음':money(row.stated_amount)}${row.difference!=null?` / 차이 ${row.difference>0?'+':''}${money(row.difference)}`:''}</p></div>${row.base_rate_missing&&row.amount!=null?'<p class="muted small">기본 단가는 미등록 상태입니다. 반개 공통 규칙 또는 이번 건 단가로 계산했습니다.</p>':''}<div class="source"><span>해당 원문</span><p>${esc(row.source||'직접 추가한 작업')}</p></div><div class="job-actions">${row.issues?.length&&!row.confirmed?`<button class="secondary" data-action="confirm" data-row="${esc(row.id)}">수정한 해석 확인 완료</button>`:''}<button class="text-button" data-action="ignore" data-row="${esc(row.id)}">${row.ignored?'계산에 다시 포함':'작업이 아닌 메모로 제외'}</button>${row.override_rate!=null?`<button class="text-button" data-action="reset-rate" data-row="${esc(row.id)}">기본 단가 사용</button>`:''}</div></div></article>`).join('');
  $('comparisons').innerHTML='<h2>원문 기재액과 비교</h2><p class="muted small">차이 = 앱 계산액 − 원문 기재액. 총액에 맞춰 단가를 추정하지 않습니다.</p>'+ (draft.comparisons.length?draft.comparisons.map(c=>`<div class="comparison-line"><b>${esc(c.source)}</b> · ${money(c.amount)}<br>해당 작업 계산액 ${money(c.calculated)} / 차이 <b>${c.difference==null?'미확정':(c.difference>0?'+':'')+money(c.difference)}</b></div>`).join(''):'<p class="muted">원문에 총액이 없거나 명확히 해석되지 않았습니다.</p>');
  $('notes-panel').hidden=!draft.notes?.length; $('notes').textContent=(draft.notes||[]).join('\n');
  if(active){ const field=[...document.querySelectorAll('[data-field]')].find(x=>x.dataset.row===active.id&&x.dataset.field===active.field); if(field){field.focus({preventScroll:true}); if(field.type!=='number'&&active.start!=null)field.setSelectionRange(active.start,active.end);} }
}
$('rows').addEventListener('input',event=>{ const field=event.target.dataset.field; const row=draft?.rows.find(r=>r.id===event.target.dataset.row); if(!row||!field)return; if(field==='override_rate'){ const value=event.target.value; row.override_rate=value===''?null:Number(value); } else {row[field]=event.target.value; if(field==='store')row.override_rate=null;} changed(); });
$('rows').addEventListener('click',run(async event=>{
  const button=event.target.closest('[data-action]'); if(!button)return; const row=draft.rows.find(r=>r.id===button.dataset.row);
  if(button.dataset.action==='confirm') row.confirmed=true;
  if(button.dataset.action==='ignore') row.ignored=!row.ignored;
  if(button.dataset.action==='reset-rate') row.override_rate=null;
  if(['once','save-rate'].includes(button.dataset.action)) {
    const field=button.closest('.job').querySelector('[data-field="override_rate"]');
    if(!field.value||!field.checkValidity())throw new Error('1개 지급 단가를 원 단위 정수로 입력해 주세요.');
    row.override_rate=Number(field.value);
    if(button.dataset.action==='save-rate'){await api('/api/rates',{name:row.store,amount:row.override_rate}); row.override_rate=null; await loadCatalog(); toast('가게 기본 단가를 저장했습니다.');}
  }
  revision++; await recalculate();
}));
$('add-row').addEventListener('click',run(async()=>{draft.rows.push({id:String(Math.max(0,...draft.rows.map(r=>Number(r.id)))+1),date:'',player:draft.player,store:'',room:'',staff:'',quantity:'',source:'',issues:[],confirmed:true,ignored:false,stated_amount:null,override_rate:null}); revision++;await recalculate();}));
$('save').addEventListener('click',run(async()=>{ if(saving)return; saving=true; $('save').disabled=true; try{await recalculate(); if($('raw').value!==draft.raw)throw new Error('원문이 바뀌었습니다. 계산하기를 다시 눌러 주세요.'); const record=await api('/api/records',draft); draft=record.snapshot; draft.saved_duplicates=[{id:record.id}]; render(); toast('정산 기록을 저장했습니다. 지급 여부는 미확인 상태입니다.');}finally{saving=false;$('save').disabled=$('raw').value!==draft.raw;} }));
async function copyResult(text) {
  $('copy-text').value=text;
  try { if(!navigator.clipboard?.writeText||!window.isSecureContext) throw new Error(); await navigator.clipboard.writeText(text); toast('결과를 복사했습니다. 카톡에 붙여 넣으세요.'); }
  catch { $('copy-help').textContent='자동 복사가 제한된 환경입니다. 전체 선택 후 길게 눌러 복사하세요. PC에서는 Ctrl+C를 누르세요.'; $('copy-dialog').showModal(); $('copy-text').focus(); $('copy-text').select(); }
}
$('copy').addEventListener('click',run(async()=>{await recalculate(); if($('raw').value!==draft.raw)throw new Error('원문이 바뀌었습니다. 계산하기를 다시 눌러 주세요.'); await copyResult(draft.copy_text);}));
$('select-copy').addEventListener('click',()=>{$('copy-text').focus();$('copy-text').select();$('copy-text').setSelectionRange(0,$('copy-text').value.length);});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));

async function loadCatalog(){
  catalog=await api('/api/catalog');
  $('rate-list').innerHTML=catalog.rates.map(r=>`<article class="rate-card"><h3>${esc(r.name)}</h3><strong>${money(r.amount)}</strong><span class="muted small"> / 1개</span>${r.note?`<p>${esc(r.note)}</p>`:''}<button class="text-button" data-rate="${esc(r.name)}">단가 수정</button></article>`).join('');
  $('alias-store').innerHTML=catalog.rates.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
  $('alias-list').innerHTML=Object.entries(catalog.aliases).map(([alias,name])=>`<div class="alias-item"><span>${esc(alias)} → ${esc(name)}</span><button class="text-button" data-remove-alias="${esc(alias)}" aria-label="${esc(alias)} 별칭 삭제">삭제</button></div>`).join('');
}
$('rate-form').addEventListener('submit',run(async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));data.amount=Number(data.amount);await api('/api/rates',data);event.target.reset();await loadCatalog();if(draft){revision++;await recalculate();}toast('기본 단가를 저장했습니다. 과거 기록은 유지됩니다.');}));
$('rate-list').addEventListener('click',event=>{const button=event.target.closest('[data-rate]');if(!button)return;const rate=catalog.rates.find(r=>r.name===button.dataset.rate);const form=$('rate-form');form.elements.name.value=rate.name;form.elements.amount.value=rate.amount;form.elements.note.value=rate.note;form.elements.amount.focus();form.scrollIntoView({block:'center',behavior:'smooth'});});
$('alias-form').addEventListener('submit',run(async event=>{event.preventDefault();await api('/api/aliases',Object.fromEntries(new FormData(event.target)));event.target.reset();await loadCatalog();if(draft){revision++;await recalculate();}toast('별칭을 저장했습니다. 새 원문 해석에도 적용됩니다.');}));
$('alias-list').addEventListener('click',run(async event=>{const button=event.target.closest('[data-remove-alias]');if(!button)return;await api('/api/aliases/delete',{alias:button.dataset.removeAlias});await loadCatalog();toast('별칭을 삭제했습니다.');}));
async function loadHistory(){const records=await api('/api/records');$('history-list').innerHTML=records.length?records.map(r=>`<article class="history-item"><div><b>${esc(r.player||'이름 미입력')}</b><p>${esc(r.dates.join(' · '))}</p><strong>${r.total==null?'최종 지급액 미확정':money(r.total)}</strong>${r.total==null?`<p>계산된 소계 ${money(r.subtotal)} / 확인 필요 ${r.unresolved}건</p>`:''}<p>${esc(new Date(r.created_at).toLocaleString('ko-KR'))} 저장 · 지급 여부 미확인</p></div><button class="secondary" data-record="${r.id}">기록 보기</button></article>`).join(''):'<div class="panel"><p>아직 저장한 정산이 없습니다. 계산 후 기록 저장을 눌러 주세요.</p></div>';}
$('refresh-history').addEventListener('click',run(loadHistory));
$('history-list').addEventListener('click',run(async event=>{const button=event.target.closest('[data-record]');if(!button)return;currentRecord=await api(`/api/records/${button.dataset.record}`);$('record-text').textContent=currentRecord.snapshot.copy_text;$('record-raw').textContent=currentRecord.snapshot.raw;$('record-dialog').showModal();}));
$('copy-record').addEventListener('click',run(async()=>{const text=currentRecord.snapshot.copy_text;$('record-dialog').close();await copyResult(text);}));
async function loadNetwork(){$('networks').innerHTML=`<h2>계산기 주소</h2><p style="overflow-wrap:anywhere"><a href="${esc(location.href.split('?')[0].split('#')[0])}">${esc(location.href.split('?')[0].split('#')[0])}</a></p><p>이 주소를 카톡으로 보내면 계산기를 열 수 있습니다. 저장한 내 기록은 함께 전송되지 않습니다.</p>`;}
initialize().catch(e=>error(e.message));
