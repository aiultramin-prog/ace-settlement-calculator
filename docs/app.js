import {createLocalApi} from './local-store.mjs';
import {parseAI,readConnection,TOKEN_KEY,validToken} from './ai-client.mjs';

const localApi = createLocalApi(window.localStorage);
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => value == null ? '미확정' : `${Number(value).toLocaleString('ko-KR')}원`;
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
const settlementLabel = value => value > 0 ? '선수에게 줄 돈' : value < 0 ? '선수에게 받을 돈' : '주고받을 돈 없음';
let draft = null;
let catalog = {rates: [], aliases: {}};
let revision = 0, timer = null, currentRecord = null, saving = false, toastTimer = null, errorTimer = null;
const openedRows = new Set();
const openedMetadata = new Set();
let aiToken='';
try{aiToken=readConnection(window.localStorage,window.location,window.history);}catch{}
let aiCache=null;
function updateAI(){
  $('calculate').textContent=aiToken?'AI로 읽고 계산':'기본 계산';
  $('ai-connect').textContent=aiToken?'AI 연결 설정':'AI 연결하기';
  $('local-calculate').hidden=!aiToken;
  $('ai-state').textContent=aiToken?'AI 해석 사용 · 수정·재계산은 추가 요금 없음':'AI 미연결 · 현재는 기본 규칙으로 해석합니다';
  $('ai-disconnect').hidden=!aiToken;
  $('input-privacy').textContent=aiToken?'AI 계산을 누르면 원문과 가게 이름·별칭이 OpenAI로 전송됩니다. 기록은 이 브라우저에 저장됩니다.':'기본 계산은 이 기기에서 처리하며 원문을 전송하지 않습니다.';
}
$('ai-connect').addEventListener('click',()=>{document.querySelector('[data-tab="connect"]').click();$('ai-settings').scrollIntoView({block:'start',behavior:smoothBehavior()});$('ai-token').focus();});
$('ai-form').addEventListener('submit',run(async event=>{
  event.preventDefault();let value=$('ai-token').value.trim();
  try{if(value.startsWith('https://'))value=new URLSearchParams(new URL(value).hash.slice(1)).get('ace_ai')||'';}catch{}
  if(!validToken(value))throw Error('전용 연결 코드 또는 전용 연결 주소를 넣어 주세요. OpenAI API 키를 넣는 곳이 아닙니다.');
  window.localStorage.setItem(TOKEN_KEY,value);aiToken=value;aiCache=null;$('ai-token').value='';updateAI();toast('AI 사용을 설정했어요. 정산하기에서 AI로 읽고 계산을 눌러 주세요.');
}));
$('ai-disconnect').addEventListener('click',()=>{window.localStorage.removeItem(TOKEN_KEY);aiToken='';aiCache=null;updateAI();toast('이 기기의 AI 연결을 해제했어요.');});

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
function error(message) {
  clearTimeout(errorTimer); $('error').textContent = message; $('error').hidden = false;
  errorTimer = setTimeout(() => $('error').hidden = true, 9000);
}
const api = (path, payload) => localApi(path, payload);
function run(action) {
  return async event => { try { await action(event); } catch (e) { error(e.message || '처리하지 못했습니다. 입력 내용을 확인해 주세요.'); } };
}
const sourceDirty = () => Boolean(draft && $('raw').value !== draft.raw);
const smoothBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', run(async () => {
  document.querySelectorAll('.tab-content').forEach(panel => panel.hidden = panel.id !== button.dataset.tab);
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.classList.toggle('active', tab === button);
    if (tab === button) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  });
  if (button.dataset.tab === 'rates') await loadCatalog();
  if (button.dataset.tab === 'history') await loadHistory();
  if (button.dataset.tab === 'connect') loadNetwork();
})));

const EXAMPLE = '킹스맨 1개\n쿨노래방 1개 직수\n도파민505 반개';
$('example').addEventListener('click', () => {
  $('raw').value = EXAMPLE; markRawChanged(); $('raw').focus();
});
function markRawChanged() {
  if (!draft) return;
  const dirty = sourceDirty();
  $('source-dirty').hidden = !dirty;
  $('copy').disabled = dirty;
  $('save').disabled = dirty || saving;
  $('result-status').textContent = dirty ? '원문 변경 · 다시 계산' : draft.complete ? '계산 완료' : `확인 ${draft.unresolved}건`;
  $('result-status').className = `badge ${dirty || !draft.complete ? 'warning' : ''}`;
}
$('raw').addEventListener('input', markRawChanged);
async function calculateInput(useAI){
  $('calculate').disabled = true; $('local-calculate').disabled=true; $('error').hidden = true;
  const raw = $('raw').value;
  try {
    clearTimeout(timer); const version = ++revision;
    $('parse-method').textContent=useAI?'AI가 내역을 읽는 중…':'기본 규칙으로 읽는 중…';
    const cacheKey=JSON.stringify([raw,catalog.rates.map(r=>r.name),catalog.aliases]);
    let result;
    if(useAI){
      const extracted=aiCache?.key===cacheKey?structuredClone(aiCache.draft):await parseAI(raw,catalog,aiToken);
      aiCache={key:cacheKey,draft:structuredClone(extracted)};
      result=await api('/api/calculate',extracted);
    }else{result=await api('/api/parse',{raw});result.parser='local';}
    if (version !== revision || raw !== $('raw').value) { $('parse-method').textContent='원문이 바뀌었어요. 다시 계산해 주세요.'; return; }
    draft = result; openedRows.clear(); openedMetadata.clear(); $('rows').replaceChildren(); render();
    $('parse-method').textContent=useAI?'AI 해석 완료 · 금액은 가게 단가로 계산':'기본 규칙으로 해석 · 내역을 확인해 주세요';
    if (window.matchMedia('(max-width: 760px)').matches) $('result-panel').scrollIntoView({block: 'start', behavior: smoothBehavior()});
  } catch(e){$('parse-method').textContent=useAI?'AI 해석 실패 · 원문을 유지했어요':'입력을 확인해 주세요';throw e;}
  finally { $('calculate').disabled = false; $('local-calculate').disabled=false; }
}
$('calculate').addEventListener('click',run(()=>calculateInput(Boolean(aiToken))));
$('local-calculate').addEventListener('click',run(()=>calculateInput(false)));

async function recalculate() {
  if (!draft) return;
  clearTimeout(timer);
  const version = revision;
  const result = await api('/api/calculate', draft);
  if (version !== revision) return recalculate();
  draft = result; render();
}
function changed() {
  revision++; $('copy').disabled = true; $('save').disabled = true;
  $('result-status').textContent = '다시 계산 중';
  clearTimeout(timer); timer = setTimeout(run(recalculate), 400);
}
function field(row, name, label, options = {}) {
  const value = options.value ?? row[name] ?? '';
  const number = options.number;
  return `<label>${label}<input data-row="${esc(row.id)}" data-field="${name}" value="${esc(value)}" ${number ? `type="number" inputmode="numeric" min="${options.min ?? 1}" max="${options.max ?? 10000000}" step="1"` : `type="text" maxlength="100"${name === 'quantity' ? ' inputmode="decimal"' : ''}`} ${name === 'store' ? 'list="store-options" autocomplete="off"' : ''} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ''}>${options.help ? `<span class="field-help">${options.help}</span>` : ''}</label>`;
}
function groupRows(mapping) {
  return Object.entries(mapping || {}).map(([name, group]) => `<div class="summary-item"><span>${esc(name)}${group.unresolved ? ` · 확인 ${group.unresolved}건` : ''}</span><strong>${group.unresolved && !group.subtotal ? '확인 필요' : signed(group.subtotal)}${group.unresolved && group.subtotal ? ' (부분)' : ''}</strong></div>`).join('');
}
function renderRow(row) {
  const excluded = row.status === 'excluded', unresolved = row.amount == null && !excluded;
  const review = row.review || [];
  const subtitle = unresolved ? review[0] || '가게와 개수를 확인해 주세요.' : excluded ? '합계에서 제외한 내역' : [row.room, row.date, row.is_direct ? '직수 반영' : '일반 지급'].filter(Boolean).join(' · ');
  const amount = excluded ? '제외' : unresolved ? '확인 필요' : signed(row.amount);
  const amountHint = row.amount < 0 ? '징대 차감' : row.is_direct && row.amount > 0 ? '추가 지급' : '';
  const formula = row.amount == null ? '필요한 항목을 확인하면 자동으로 계산합니다.' : row.is_direct
    ? `선수 몫 ${money(row.player_amount)} − 이미 받은 돈 ${money(row.receipt_amount)} = <b>${signed(row.amount)}</b>`
    : `<b>${esc(row.formula || money(row.amount))}</b>`;
  return `<details class="job ${unresolved ? 'needs-review' : ''} ${excluded ? 'is-excluded' : ''}" data-job="${esc(row.id)}" ${openedRows.has(row.id) ? 'open' : ''}>
    <summary><span><span class="job-title">${esc(row.store || '가게 확인 필요')} <span class="muted">${esc(row.quantity || '?')}개</span>${row.is_direct ? '<span class="direct-tag">직수</span>' : ''}</span><span class="job-subtitle ${unresolved ? 'review-preview' : ''}">${esc(subtitle)}</span></span><span class="job-amount ${unresolved || excluded ? 'unresolved' : row.amount < 0 ? 'collect' : ''}">${amount}${amountHint ? `<small>${amountHint}</small>` : ''}</span></summary>
    <div class="job-body">
      ${review.length && !excluded ? `<p class="notice">${review.map(esc).join('<br>')}</p>` : ''}
      <div class="job-fields">${field(row, 'store', '가게')}${field(row, 'quantity', '개수', {placeholder: '예: 1.5'})}</div>
      <label class="direct-switch"><input data-row="${esc(row.id)}" data-field="is_direct" type="checkbox" ${row.is_direct ? 'checked' : ''}><span>직수 <small>선수가 직접 받은 건</small></span></label>
      <div class="money-fields">
        ${field(row, 'override_rate', '1개 선수 몫 (원)', {number: true, value: row.override_rate ?? row.rate ?? '', placeholder: '가게 단가 입력', help: '반개는 15,000원 고정 · 변경 시 이번 건에 적용'})}
        ${row.is_direct ? field(row, 'override_received_amount', '선수가 이미 받은 총액 (원)', {number: true, min: 0, max: 10000000000, value: row.override_received_amount ?? row.receipt_amount ?? '', placeholder: '실제로 받은 금액', help: `이 작업 전체 금액 · ${esc(row.receipt_source || '가게 금액 또는 원문 기준')}`}) : ''}
      </div>
      <div class="formula-box ${row.amount < 0 ? 'collect' : ''}">${formula}${row.is_direct && row.amount < 0 ? `<p>선수에게 받을 ${money(-row.amount)}을 총지급액에서 뺍니다.</p>` : ''}</div>
      <div class="source"><span>원문</span><p>${esc(row.source || '직접 추가한 내역')}</p></div>
      <details class="optional-fields" data-metadata="${esc(row.id)}" ${openedMetadata.has(row.id) ? 'open' : ''}><summary>날짜·이름·방 정보 (선택)</summary><div class="job-fields">${field(row, 'date', '영업일')}${field(row, 'room', '층 · 방')}${field(row, 'player', '선수')}${field(row, 'staff', '담당자 · 기타 이름')}</div></details>
      <div class="job-actions">
        ${row.issues?.length && !row.confirmed && !excluded ? `<button class="secondary" data-action="confirm" data-row="${esc(row.id)}">해석 확인 완료</button>` : ''}
        <button class="text-button" data-action="save-rate" data-row="${esc(row.id)}">선수 단가를 기본값으로 저장</button>
        ${row.override_rate != null || row.override_received_amount != null ? `<button class="text-button" data-action="reset-rate" data-row="${esc(row.id)}">금액 수정 취소</button>` : ''}
        <button class="text-button" data-action="ignore" data-row="${esc(row.id)}">${excluded ? '계산에 다시 포함' : '이 내역 제외'}</button>
      </div>
    </div>
  </details>`;
}
function render() {
  const focus = document.activeElement;
  const active = focus?.dataset.field ? {id: focus.dataset.row, field: focus.dataset.field, start: focus.selectionStart, end: focus.selectionEnd} : focus?.id === 'player' ? {player: true, start: focus.selectionStart, end: focus.selectionEnd} : null;
  const extraOpen = $('summary-extra')?.open || Boolean(active?.player);
  // Snapshot only live details; detached toggle events must not overwrite user state.
  document.querySelectorAll('#rows [data-job]').forEach(el => el.open ? openedRows.add(el.dataset.job) : openedRows.delete(el.dataset.job));
  document.querySelectorAll('#rows [data-metadata]').forEach(el => el.open ? openedMetadata.add(el.dataset.metadata) : openedMetadata.delete(el.dataset.metadata));
  $('result').hidden = false; $('detail-area').hidden = false; $('empty-result').hidden = true;
  $('row-count').textContent = `${draft.rows.filter(row => row.status !== 'excluded').length}건`;
  const calculated = draft.rows.filter(row => row.status === 'calculated');
  const normal = calculated.filter(row => !row.is_direct).reduce((sum, row) => sum + row.amount, 0);
  const direct = calculated.filter(row => row.is_direct).reduce((sum, row) => sum + row.amount, 0);
  const totalBox = draft.complete
    ? `<div class="total-box ${draft.total < 0 ? 'collect' : draft.total === 0 ? 'zero' : ''}"><span class="total-label">${draft.total === 0 ? '정산 완료' : settlementLabel(draft.total)}</span><strong class="amount">${draft.total === 0 ? '주고받을 돈 없음' : money(Math.abs(draft.total))}</strong><p>${draft.total < 0 ? '지급할 돈보다 직수 징대가 더 많아요.' : draft.total > 0 ? '직수 금액까지 반영한 최종 지급액이에요.' : '일반 지급액과 직수 정산액이 일치해요.'}</p></div>`
    : `<div class="pending-box"><h3>${draft.unresolved ? `${draft.unresolved}건만 확인해 주세요` : '계산할 내역이 없어요'}</h3><p>최종 금액은 아직 확정되지 않았어요.</p>${calculated.length ? `<p class="subtotal">확인된 ${calculated.length}건 소계 ${signed(draft.subtotal)}</p><p>미확정 내역은 포함하지 않은 부분 합계입니다.</p>` : '<p>아래 내역에서 가게·개수·금액을 확인해 주세요.</p>'}${draft.unresolved ? '<button class="text-button" id="review-first">확인할 내역으로 이동 ↓</button>' : ''}</div>`;
  $('summary').innerHTML = `${totalBox}${calculated.length ? `<div class="summary-math"><div><span>일반 지급${!draft.complete ? ' (확인된 건)' : ''}</span><strong>${signed(normal)}</strong></div><div><span>직수 정산${!draft.complete ? ' (확인된 건)' : ''}</span><strong class="${direct < 0 ? 'collect-text' : ''}">${signed(direct)}</strong></div></div>` : ''}<details class="summary-extra" id="summary-extra" ${extraOpen ? 'open' : ''}><summary>선수 이름 입력 · 가게별 소계</summary><label>선수 이름 (선택)<input id="player" value="${esc(draft.player)}" placeholder="이름 없이도 계산됩니다" maxlength="100"></label>${groupRows(draft.stores)}${Object.keys(draft.dates || {}).some(name => name !== '날짜 미입력') ? `<p class="summary-label">날짜별 소계</p>${groupRows(draft.dates)}` : ''}</details>`;
  $('player').addEventListener('input', () => { draft.player = $('player').value.trim(); draft.rows.forEach(row => row.player = draft.player); changed(); });
  const warnings = [...(draft.duplicate_warnings || [])];
  if (draft.saved_duplicates?.length) warnings.push(`같은 원문으로 저장한 기록이 ${draft.saved_duplicates.length}건 있어요. 중복 여부를 확인해 주세요. 자동 차감하지 않았습니다.`);
  $('duplicate-alert').innerHTML = warnings.map(warning => `<p class="notice">${esc(warning)}</p>`).join('');
  $('rows').innerHTML = draft.rows.map(renderRow).join('');
  $('review-first')?.addEventListener('click', () => {
    const row = document.querySelector('.job.needs-review');
    if (row) { row.open = true; openedRows.add(row.dataset.job); row.scrollIntoView({block: 'start', behavior: smoothBehavior()}); row.querySelector('summary').focus({preventScroll: true}); }
  });
  $('comparisons').hidden = !draft.comparisons?.length;
  $('comparison-items').innerHTML = `<p class="muted small">원문에 적힌 참고 금액입니다. 지급액은 가게 단가와 직수 규칙으로 계산합니다.</p>${(draft.comparisons || []).map(item => `<div class="comparison-line">${esc(item.source)}${item.amount == null ? ' · 금액 확인 필요' : ` · ${money(item.amount)}`}</div>`).join('')}`;
  $('notes-panel').hidden = !draft.notes?.length;
  $('notes').textContent = (draft.notes || []).join('\n');
  markRawChanged();
  if (active) {
    const next = active.player ? $('player') : [...document.querySelectorAll('[data-field]')].find(el => el.dataset.row === active.id && el.dataset.field === active.field);
    if (next) { next.focus({preventScroll: true}); if (next.type === 'text' && active.start != null) next.setSelectionRange(active.start, active.end); }
  }
}

$('rows').addEventListener('toggle', event => {
  if (!event.target.isConnected) return;
  const id = event.target.dataset.job || event.target.dataset.metadata;
  if (!id) return;
  const set = event.target.dataset.job ? openedRows : openedMetadata;
  if (event.target.open) set.add(id); else set.delete(id);
}, true);
$('rows').addEventListener('input', event => {
  const name = event.target.dataset.field;
  const row = draft?.rows.find(item => item.id === event.target.dataset.row);
  if (!row || !name) return;
  if (name === 'is_direct') {
    row.is_direct = event.target.checked;
    if (row.is_direct && row.received_amount == null && Number.isInteger(row.stated_amount)) row.received_amount = row.stated_amount;
  }
  else if (['override_rate', 'override_received_amount'].includes(name)) row[name] = event.target.value === '' ? null : Number(event.target.value);
  else { row[name] = event.target.value; if (name === 'store') row.override_rate = null; }
  changed();
});
$('rows').addEventListener('click', run(async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const row = draft.rows.find(item => item.id === button.dataset.row); if (!row) return;
  if (button.dataset.action === 'confirm') row.confirmed = true;
  if (button.dataset.action === 'ignore') row.ignored = !row.ignored;
  if (button.dataset.action === 'reset-rate') { row.override_rate = null; row.override_received_amount = null; }
  if (button.dataset.action === 'save-rate') {
    const input = button.closest('.job').querySelector('[data-field="override_rate"]');
    if (!input.value || !input.checkValidity()) throw new Error('1개 선수 몫을 원 단위 정수로 입력해 주세요.');
    await api('/api/rates', {name: row.store, amount: Number(input.value)});
    row.override_rate = null; await loadCatalog(); toast('이 가게의 선수 지급 단가를 저장했습니다.');
  }
  revision++; await recalculate();
}));
$('add-row').addEventListener('click', run(async () => {
  const id = String(Math.max(0, ...draft.rows.map(row => Number(row.id) || 0)) + 1);
  draft.rows.push({id, date: '', player: draft.player, store: '', room: '', staff: '', quantity: '1', source: '', issues: [], confirmed: true, ignored: false, is_direct: false, stated_amount: null, received_amount: null, override_rate: null, override_received_amount: null});
  openedRows.add(id); revision++; await recalculate();
  const added = [...document.querySelectorAll('[data-job]')].find(el => el.dataset.job === id);
  added?.scrollIntoView({block: 'start', behavior: smoothBehavior()});
  added?.querySelector('[data-field="store"]')?.focus({preventScroll: true});
}));

$('save').addEventListener('click', run(async () => {
  if (saving || !draft) return;
  saving = true; $('save').disabled = true;
  try {
    await recalculate();
    if (sourceDirty()) throw new Error('원문이 바뀌었습니다. 지급액 계산을 다시 눌러 주세요.');
    const record = await api('/api/records', draft);
    draft = record.snapshot; draft.saved_duplicates = [{id: record.id}]; render();
    toast('정산 기록을 저장했습니다. 지급 완료 표시는 아닙니다.');
  } finally { saving = false; $('save').disabled = sourceDirty(); }
}));
async function copyResult(text) {
  $('copy-text').value = text;
  try {
    if (!navigator.clipboard?.writeText || !window.isSecureContext) throw new Error();
    await navigator.clipboard.writeText(text); toast('복사했습니다. 카톡에 붙여 넣으세요.');
  } catch {
    $('copy-help').textContent = '전체 선택 후 길게 눌러 복사하세요. PC에서는 Ctrl+C를 누르세요.';
    $('copy-dialog').showModal(); $('copy-text').focus(); $('copy-text').select();
  }
}
$('copy').addEventListener('click', run(async () => {
  await recalculate();
  if (sourceDirty()) throw new Error('원문이 바뀌었습니다. 지급액 계산을 다시 눌러 주세요.');
  await copyResult(draft.copy_text);
}));
$('select-copy').addEventListener('click', () => { $('copy-text').focus(); $('copy-text').select(); $('copy-text').setSelectionRange(0, $('copy-text').value.length); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));

async function loadCatalog() {
  catalog = await api('/api/catalog');
  $('store-count').textContent = `${catalog.rates.length}곳`;
  $('rate-list').innerHTML = catalog.rates.map(rate => `<article class="rate-card"><div class="rate-card-head"><h3>${esc(rate.name)}</h3><button class="text-button" data-rate="${esc(rate.name)}" aria-label="${esc(rate.name)} 단가 수정">수정</button></div><div class="rate-values"><div><span>가게에서 받는 돈 / 1개</span><strong class="${rate.receipt_amount == null ? 'missing' : ''}">${rate.receipt_amount == null ? '미등록' : money(rate.receipt_amount)}</strong></div><div><span>선수 몫 / 1개</span><strong>${money(rate.amount)}</strong></div></div><p class="rate-cut">직수 1개 징대 <b>${rate.receipt_amount == null ? '받는 금액 등록 필요' : money(rate.receipt_amount - rate.amount)}</b></p>${rate.note ? `<p class="rate-note">${esc(rate.note)}</p>` : ''}</article>`).join('');
  $('alias-store').innerHTML = catalog.rates.map(rate => `<option value="${esc(rate.name)}">${esc(rate.name)}</option>`).join('');
  $('store-options').innerHTML = catalog.rates.map(rate => `<option value="${esc(rate.name)}"></option>`).join('');
  $('alias-list').innerHTML = Object.entries(catalog.aliases).map(([alias, name]) => `<div class="alias-item"><span>${esc(alias)} → ${esc(name)}</span><button class="text-button" data-remove-alias="${esc(alias)}" aria-label="${esc(alias)} 별칭 삭제">삭제</button></div>`).join('');
}
$('rate-form').addEventListener('submit', run(async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target)); data.amount = Number(data.amount); data.receipt_amount = data.receipt_amount === '' ? null : Number(data.receipt_amount);
  await api('/api/rates', data); event.target.reset(); await loadCatalog();
  if (draft) { revision++; await recalculate(); }
  toast('가게 단가를 저장했습니다. 과거 정산 기록은 유지됩니다.');
}));
$('rate-list').addEventListener('click', event => {
  const button = event.target.closest('[data-rate]'); if (!button) return;
  const rate = catalog.rates.find(item => item.name === button.dataset.rate), form = $('rate-form');
  form.elements.name.value = rate.name; form.elements.amount.value = rate.amount;
  form.elements.receipt_amount.value = rate.receipt_amount ?? ''; form.elements.note.value = rate.note || '';
  form.scrollIntoView({block: 'start', behavior: smoothBehavior()}); form.elements.amount.focus({preventScroll: true});
});
$('alias-form').addEventListener('submit', run(async event => {
  event.preventDefault(); await api('/api/aliases', Object.fromEntries(new FormData(event.target))); event.target.reset(); await loadCatalog();
  if (draft) { revision++; await recalculate(); }
  toast('별칭을 저장했습니다. 새 원문 해석에도 적용됩니다.');
}));
$('alias-list').addEventListener('click', run(async event => {
  const button = event.target.closest('[data-remove-alias]'); if (!button) return;
  await api('/api/aliases/delete', {alias: button.dataset.removeAlias}); await loadCatalog(); toast('별칭을 삭제했습니다.');
}));
async function loadHistory() {
  const records = await api('/api/records');
  $('history-list').innerHTML = records.length ? records.map(record => `<article class="history-item"><div><b>${esc(record.player || '이름 미입력')}</b>${record.dates?.filter(date => date !== '날짜 미입력').length ? `<p>${esc(record.dates.filter(date => date !== '날짜 미입력').join(' · '))}</p>` : ''}<p class="history-direction ${record.total < 0 ? 'collect' : ''}">${record.total == null ? '미확정 정산' : settlementLabel(record.total)}</p><strong>${record.total == null ? `확인 필요 ${record.unresolved}건` : money(Math.abs(record.total))}</strong>${record.total == null ? `<p>부분 합계 ${signed(record.subtotal || 0)} · 최종 금액 아님</p>` : ''}<p>${esc(new Date(record.created_at).toLocaleString('ko-KR'))}</p></div><button class="secondary" data-record="${esc(record.id)}">보기</button></article>`).join('') : '<div class="panel"><p class="muted">저장한 정산이 아직 없어요.<br>계산 후 기록 저장을 눌러 주세요.</p></div>';
}
$('refresh-history').addEventListener('click', run(loadHistory));
$('history-list').addEventListener('click', run(async event => {
  const button = event.target.closest('[data-record]'); if (!button) return;
  currentRecord = await api(`/api/records/${button.dataset.record}`);
  $('record-text').textContent = currentRecord.snapshot.copy_text; $('record-raw').textContent = currentRecord.snapshot.raw; $('record-dialog').showModal();
}));
$('copy-record').addEventListener('click', run(async () => { const text = currentRecord.snapshot.copy_text; $('record-dialog').close(); await copyResult(text); }));
function loadNetwork() {
  const address = location.href.split('?')[0].split('#')[0];
  $('networks').innerHTML = `<h2>계산기 주소</h2><p><a href="${esc(address)}">${esc(address)}</a></p><p>주소를 공유해도 내 원문과 저장 기록은 함께 전송되지 않습니다.</p>`;
}

loadCatalog().catch(e => error(e.message));
updateAI();
