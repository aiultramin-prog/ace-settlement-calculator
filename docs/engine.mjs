export const DEFAULT_RATES={'도파민':30000,'스카이':30000,'아이엠':30000,'모짜':30000,'마운틴':38000,'달토':40000,'임팩트':40000,'세이렌':40000,'구구단':40000,'아우라':40000,'도깨비':40000,'엘리트':40000,'역삼제우스':40000,'S팡':40000};
export const DEFAULT_ALIASES={'도파':'도파민','도':'도파민','논 s팡':'S팡','논 S팡':'S팡','s팡':'S팡','역제':'역삼제우스'};
export const RATE_NOTES={'S팡':'기존 “2개 8만 원” 내역을 근거로 등록한 선수 지급 단가','역삼제우스':'가게 청구액 55,000원 / 선수 지급액 40,000원. 정산에는 선수 지급액을 적용합니다.'};
const QTY=/(?<![\d.,])(-?\d+(?:\.\d+)?)\s*개/g;
const MONEY='(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*(만\\s*원|만원|만|원)?';
const ROOM=/(?<!\S)(?:\d+\s*층(?:\s*[a-zA-Z0-9가-힣]+\s*룸)?|[a-zA-Z0-9]+\s*룸|\d+(?:호|티)?)(?!\S)/g;
const SENSITIVE=/계좌|예금주|전화|연락처|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b|\d{2,6}-\d{2,6}-\d{2,8}/;
const hasQty=s=>[...s.matchAll(QTY)].length>0;
const own=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;
export const canonical=(s,a)=>own(a,String(s).trim())??String(s).trim();
// Decimal string arithmetic keeps all amounts in exact integer won.
function scaled(value,scale,max){
  const s=String(value); if(!/^\d+(?:\.\d+)?$/.test(s)||s.length>40)return null;
  const [whole,fraction='']=s.split('.');const denominator=10n**BigInt(fraction.length);
  const numerator=(BigInt(whole)*denominator+BigInt(fraction||'0'))*BigInt(scale);
  if(numerator%denominator)return null;const n=numerator/denominator;
  return n<=BigInt(max)?Number(n):null;
}
export function moneyValue(number,unit){if(number.includes(',')&&!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(number))return null;return scaled(number.replaceAll(',',''),unit==='원'?1:10000,1e10);}
export function quantityUnits(value){const n=scaled(value,2,20000);return n>0?n:null;}
export function parseText(raw,rates,aliases){
  if(typeof raw!=='string'||!raw.trim())throw Error('카톡 작업 내역을 붙여 넣어 주세요.');
  if(raw.length>50000)throw Error('원문은 50,000자 이하로 나누어 계산해 주세요.');
  const rows=[],totals=[],notes=[];let date='',player='',previous=0;
  const names=[...new Set([...Object.keys(rates),...Object.keys(aliases)])].sort((a,b)=>b.length-a.length);
  const pattern=names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+(n==='도'?'(?=$|\\s)':'(?=$|\\s|\\d)')).join('|');
  const known=pattern?new RegExp('^('+pattern+')'):null,boundary=pattern?new RegExp('(?<!\\S)(?:'+pattern+')','g'):null;
  function add(segment){
    segment=segment.replace(/^[ ,;+]+|[ ,;+]+$/g,'').trim();if(!segment)return;
    const row={id:String(rows.length+1),date,player,store:'',room:'',staff:'',quantity:'',stated_amount:null,source:segment,issues:[],confirmed:false,ignored:false,override_rate:null};
    const qs=[...segment.matchAll(QTY)];if(qs.length!==1){row.issues.push('해석 확인 필요: 작업 한 건의 가게와 개수를 입력해 주세요.');rows.push(row);return;}
    const qty=qs[0];row.quantity=qty[1];const prefix=segment.slice(0,qty.index).trim(),found=known?.exec(prefix);let detail;
    if(found){row.store=canonical(found[1],aliases);detail=prefix.slice(found[0].length).trim();}
    else {const roomStart=/\s+(?=\d+(?:\s|층|호|티)|[a-zA-Z]\s*룸)/.exec(prefix);const rawStore=roomStart?prefix.slice(0,roomStart.index):prefix;row.store=rawStore.trim();detail=prefix.slice(rawStore.length).trim();}
    if(!row.store)row.issues.push('가게 이름을 확인해 주세요.');
    row.room=[...detail.matchAll(ROOM)].map(m=>m[0]).join(' ');row.staff=detail.replace(ROOM,'').trim();
    let tail=segment.slice(qty.index+qty[0].length).trim();const amount=new RegExp('^'+MONEY+'(?=$|\\s|입니다|이에요|이요)').exec(tail);
    if(amount){row.stated_amount=moneyValue(amount[1],amount[2]);if(row.stated_amount===null)row.issues.push('기재 금액의 단위나 값을 확인해 주세요.');tail=tail.slice(amount[0].length).trim();}
    if(tail&&!/^(?:했습니다|했어요|입니다|이에요|이요|완료|체크|수금내역|직수|[.!\s])+$/.test(tail))row.issues.push('개수 뒤에 해석하지 못한 내용이 있습니다.');
    if(SENSITIVE.test(segment)){row.issues.push('연락처·계좌 등이 섞여 있습니다. 작업 값을 직접 확인해 주세요.');row.stated_amount=null;}
    rows.push(row);
  }
  for(let line of raw.split(/\r?\n/)){
    line=line.trim();if(!line)continue;
    const header=/^((?:\d{4}[./-])?\d{1,2}[./-]\d{1,2})(?:\s+|$)(.*)$/.exec(line);
    if(header&&!hasQty(line)){date=header[1];const candidate=header[2].trim();if(candidate&&/^(?:선수\s*[:：]\s*)?[^\s:：]{1,30}$/.test(candidate)&&!/담당|예금주|계좌|실장|부장|총|합계|체크|수금|직수|입니다/.test(candidate)&&/[가-힣a-zA-Z]/.test(candidate))player=candidate.replace(/^선수\s*[:：]\s*/,'');else if(candidate){player='';add(candidate);}continue;}
    const explicit=/^선수\s*[:：]\s*([^\s]{1,30})$/.exec(line);if(explicit){player=explicit[1];continue;}
    if(!hasQty(line)&&(SENSITIVE.test(line)||/^(체크|수금내역|직수)$/.test(line))){notes.push(line);continue;}
    const matches=[...line.matchAll(new RegExp('(?:전체\\s*)?총(?:합계|합|액)?\\s*'+MONEY,'g')),null];let cursor=0;
    for(const match of matches){
      const end=match?match.index:line.length,body=line.slice(cursor,end).trim();
      if(body&&!/^(입니다|이에요|이요|합니다|[.!\s])+$/.test(body))for(const chunk of body.split(/(?<!\d),(?!\d)|(?<=개),|\s*[+;]\s*/)){
        const starts=[0];if(boundary)for(const m of chunk.matchAll(boundary))if(m.index>0&&hasQty(chunk.slice(starts.at(-1),m.index)))starts.push(m.index);
        starts.forEach((start,i)=>add(chunk.slice(start,starts[i+1]??chunk.length)));
      }
      if(match){const all=previous===rows.length||match[0].includes('전체')||match[0].includes('총합');totals.push({amount:moneyValue(match[1],match[2]),source:match[0],row_ids:(all?rows:rows.slice(previous)).map(r=>r.id)});previous=rows.length;cursor=match.index+match[0].length;}
    }
  }
  const players=[...new Set(rows.map(r=>r.player).filter(Boolean))];return{raw,player:players.length===1?players[0]:'',rows,stated_totals:totals,notes};
}
const fmt=n=>n.toLocaleString('en-US');
export function calculate(draft,rates,aliases){
  if(!draft||!Array.isArray(draft.rows)||draft.rows.length>500)throw Error('작업은 한 번에 500건 이하로 계산해 주세요.');
  const rows=[],dates=Object.create(null),stores=Object.create(null),duplicates=[],seen=new Map(),ids=new Set();let subtotal=0,unresolved=0;
  for(const original of draft.rows){
    const row={...original},id=String(row.id||'');if(!id||ids.has(id))throw Error('작업 번호가 중복되었습니다. 다시 계산해 주세요.');ids.add(id);row.id=id;
    const store=canonical(row.store||'',aliases);row.store=store;
    const issues=row.confirmed?[]:[...(row.issues||[])],units=quantityUnits(row.quantity),override=row.override_rate??null;
    if(override!==null&&(!Number.isInteger(override)||override<=0||override>1e7))throw Error('단가는 1~10,000,000원의 정수로 입력해 주세요.');
    const base=own(rates,store)??null,rate=override??base;
    if(!store)issues.push('가게 확인 필요');if(units===null)issues.push('개수는 양수인 0.5 단위로 확인해 주세요. 자동 반올림하지 않습니다.');if(units!==null&&units>=2&&rate===null)issues.push('선수 지급 단가 미등록');
    Object.assign(row,{rate,base_rate_missing:base===null,rate_source:override!==null?'이번 건':'기본 단가',amount:null,formula:'',review:[...new Set(issues)],difference:null});
    if(row.ignored)row.status='excluded';else if(issues.length){row.status='unresolved';unresolved++;}else{
      const whole=Math.floor(units/2),half=units%2,amount=whole*(rate||0)+half*15000;
      Object.assign(row,{amount,status:'calculated',formula:(whole?`${whole}개 × ${fmt(rate)}원`:'')+(whole&&half?' + ':'')+(half?'0.5개 15,000원':'')});
      if(Number.isInteger(row.stated_amount))row.difference=amount-row.stated_amount;subtotal+=amount;
    }
    if(row.status!=='excluded'){
      for(const [mapping,key]of [[dates,row.date||'날짜 미입력'],[stores,store||'가게 미확인']]){mapping[key]??={subtotal:0,unresolved:0};mapping[key].subtotal+=row.amount||0;mapping[key].unresolved+=Number(row.status==='unresolved');}
      const parts=[row.player||draft.player,row.date,store,row.room,String(row.quantity)],key=JSON.stringify(parts);
      if(parts.slice(0,4).every(Boolean)&&seen.has(key))duplicates.push(`작업 ${seen.get(key)}·${id}: 선수·날짜·가게·방·개수가 같습니다. 반복 제출 여부를 확인하세요. 금액은 공제하지 않았습니다.`);seen.set(key,id);
    }rows.push(row);
  }
  const byId=new Map(rows.map(r=>[r.id,r]));const comparisons=(draft.stated_totals||[]).map(t=>{const selected=(t.row_ids||[]).map(id=>byId.get(id)).filter(r=>r&&r.status!=='excluded'),complete=selected.length>0&&selected.every(r=>r.amount!==null),calculated=selected.reduce((s,r)=>s+(r.amount||0),0);return {...t,calculated,difference:complete&&Number.isInteger(t.amount)?calculated-t.amount:null};});
  const complete=rows.some(r=>r.status!=='excluded')&&unresolved===0;
  const result={...draft,rows,subtotal,unresolved,complete,total:complete?subtotal:null,dates,stores,comparisons,duplicate_warnings:duplicates,payment_status:'지급 여부 미확인'};result.copy_text=copyText(result);return result;
}
export function copyText(result){
  const lines=['에이스 정산',`선수: ${result.player||'이름 미입력'}`];
  for(const r of result.rows){const label=[r.date,r.player,r.store,r.room].filter(Boolean).join(' / ');lines.push(r.status==='excluded'?`${label||r.source}: 사용자 확인으로 계산 제외`:r.amount===null?`${label||r.source} ${r.quantity||'?'}개: 확인 필요 (${r.review.join('; ')})`:`${label} ${r.quantity}개 = ${fmt(r.amount)}원 (${r.formula})`);}
  for(const [date,g]of Object.entries(result.dates))lines.push(`${date} 계산된 소계 ${fmt(g.subtotal)}원`+(g.unresolved?` / 확인 필요 ${g.unresolved}건`:''));
  lines.push(result.complete?`총 지급액 ${fmt(result.total)}원`:`최종 지급액 미확정 / 계산된 소계 ${fmt(result.subtotal)}원 / 확인 필요 ${result.unresolved}건`);
  for(const c of result.comparisons)lines.push(`원문 ${c.source} (${c.amount===null?'해석 확인 필요':fmt(c.amount)+'원'}) / 계산액−기재액 ${c.difference===null?'비교 미확정':(c.difference>=0?'+':'')+fmt(c.difference)+'원'}`);
  lines.push('기록 저장은 지급 완료를 의미하지 않습니다.');return lines.join('\n');
}
