export const DEFAULT_RATES = {'도파민':30000,'스카이':30000,'아이엠':30000,'모짜':30000,'마운틴':38000,'달토':40000,'임팩트':40000,'세이렌':40000,'구구단':40000,'아우라':40000,'도깨비':40000,'엘리트':40000,'역삼제우스':40000,'S팡':40000,'샤이니':40000,'라베바':40000,'유앤미':40000,'킹스맨':40000,'쿨노래방':40000};
// Only confirmed whole-job receipts belong here. Unknown prices are never guessed.
export const DEFAULT_RECEIPTS = {'킹스맨':60000,'쿨노래방':50000,'역삼제우스':55000};
export const DEFAULT_ALIASES = {'도파':'도파민','도':'도파민','논 s팡':'S팡','논 S팡':'S팡','s팡':'S팡','역제':'역삼제우스'};
export const RATE_NOTES = {'S팡':'기존 “2개 8만 원” 내역을 근거로 등록한 선수 지급 단가','역삼제우스':'가게 금액 55,000원 / 선수 몫 40,000원','킹스맨':'가게 금액 60,000원 / 선수 몫 40,000원','쿨노래방':'가게 금액 50,000원 / 선수 몫 40,000원'};
const NATIVE = {'한':1,'하나':1,'두':2,'둘':2,'세':3,'셋':3,'네':4,'넷':4,'다섯':5,'여섯':6,'일곱':7,'여덟':8,'아홉':9,'열':10};
const NATIVE_PATTERN = Object.keys(NATIVE).sort((a,b)=>b.length-a.length).join('|');
const QTY = new RegExp('(?<![\\d.,])(-?\\d+(?:\\.\\d+)?)\\s*개(?:\\s*반)?|('+NATIVE_PATTERN+')\\s*개(?:\\s*반)?|반\\s*개','g');
const MONEY = '(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*(만\\s*원|만원|만|원)?';
const ROOM = /(?<!\S)(?:\d+\s*층(?:\s*[a-zA-Z0-9가-힣]+\s*룸)?|[a-zA-Z0-9]+\s*룸|\d+(?:호|티)?)(?!\S)/g;
const SENSITIVE = /계좌|예금주|전화|연락처|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b|\d{2,6}-\d{2,6}-\d{2,8}/;
const DIRECT = '직수|직접\\s*(?:받음|받았습니다|받았어요|수령)';
const hasDirect = s => new RegExp(DIRECT).test(s);
const POLITE = /^(?:했습니다|했어요|하였습니다|입니다|입니당|입니댱|인댕|이에요|이요|완료|체크|수금내역|직수|받았습니다|받았어요|받음|원|[.!~\s])+$/;
const hasQty = s => [...s.matchAll(QTY)].length > 0;
const own = (o,k) => o && Object.hasOwn(o,k) ? o[k] : undefined;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const canonical = (s,a=DEFAULT_ALIASES) => own(a,String(s).trim()) ?? String(s).trim();
const fmt = n => n.toLocaleString('ko-KR');

// Decimal string arithmetic keeps all amounts in exact integer won.
function scaled(value,scale,max) {
  const s=String(value); if(!/^\d+(?:\.\d+)?$/.test(s)||s.length>40)return null;
  const [whole,fraction='']=s.split('.'),denominator=10n**BigInt(fraction.length);
  const numerator=(BigInt(whole)*denominator+BigInt(fraction||'0'))*BigInt(scale);
  if(numerator%denominator)return null;const n=numerator/denominator;
  return n<=BigInt(max)?Number(n):null;
}
export function moneyValue(number,unit) {
  if(typeof number!=='string')return null;
  if(/\.\d{3}$/.test(number))return null; // “65.000” could mean 65,000, not 65.
  if(number.includes(',')&&!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(number))return null;
  const digits=number.replaceAll(',','');
  // Existing shorthand “4”, “11.4” means 만원; unlabelled 55000 means 원.
  return scaled(digits,unit==='원'||(!unit&&Number(digits)>=1000)?1:10000,1e10);
}
export function quantityUnits(value) {const n=scaled(value,2,20000);return n>0?n:null;}
function quantity(match) {
  if(/^반\s*개$/.test(match[0]))return '0.5';
  const base=match[1]??String(NATIVE[match[2]]);
  if(!/반$/.test(match[0]))return base;
  const units=scaled(base,2,20000);return units===null?base+' 반':String((units+1)/2);
}

export function parseText(raw,rates=DEFAULT_RATES,aliases=DEFAULT_ALIASES) {
  if(typeof raw!=='string'||!raw.trim())throw Error('카톡 작업 내역을 붙여 넣어 주세요.');
  if(raw.length>50000)throw Error('원문은 50,000자 이하로 나누어 계산해 주세요.');
  const rows=[],totals=[],notes=[];let date='',player='',previous=0;
  const names=[...new Set([...Object.keys(rates),...Object.keys(aliases)])].sort((a,b)=>b.length-a.length);
  const suffix='(?=$|\\s|\\d|직수|반\\s*개|(?:'+NATIVE_PATTERN+')\\s*개)';
  const pattern=names.map(n=>escape(n)+(n.length===1?'(?=$|\\s)':suffix)).join('|');
  const known=pattern?new RegExp('^('+pattern+')'):null;
  const boundary=pattern?new RegExp('(?<![가-힣A-Za-z0-9])(?:'+pattern+')','g'):null;

  function add(segment) {
    segment=segment.replace(/^[ ,;+]+|[ ,;+]+$/g,'').trim();if(!segment)return;
    const direct=hasDirect(segment),negated=/직수\s*(?:아님|아니|안함|안\s*받|없음|없어|X|x|취소)/.test(segment);
    const row={id:String(rows.length+1),date,player,store:'',room:'',staff:'',quantity:'',stated_amount:null,source:segment,issues:[],confirmed:false,ignored:false,override_rate:null,is_direct:direct&&!negated,received_amount:null,override_received_amount:null};
    if(negated)row.issues.push('직수 취소·부정 표현이 있습니다. 직수 여부를 확인해 주세요.');
    if(/취소|노쇼|정정|잘못|아니고|제외|수정|(?:직수가?|직접)\s*(?:아니|없|못\s*받|안|예정)/.test(segment))row.issues.push('취소·정정 또는 미수령 표현이 있습니다. 계산에 포함할 작업인지 확인해 주세요.');
    const qs=[...segment.matchAll(QTY)];
    if(qs.length!==1){row.issues.push('해석 확인 필요: 작업 한 건의 가게와 개수를 입력해 주세요.');rows.push(row);return;}
    const qty=qs[0];row.quantity=quantity(qty);
    let prefix=segment.slice(0,qty.index).trim(),tail=segment.slice(qty.index+qty[0].length).trim();
    // A receipt can appear before or after 개수, e.g. “직수 6만원 1개”.
    const amounts=[];
    const explicitMoney=new RegExp('(?<![\\d.,])(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*(만\\s*원|만원|만|원)','g');
    function extract(text) {
      text=text.replace(/(-?\d[\d,]*(?:\.\d+)?)\s*만\s*(-?\d[\d,]*(?:\.\d+)?)\s*천\s*원?/g,(full,man,thousand)=>{
        const a=moneyValue(man,'만'),b=scaled(thousand.replaceAll(',',''),1000,1e10);
        amounts.push(a!==null&&b!==null&&a+b<=1e10?a+b:null);return ' ';
      });
      return text.replace(explicitMoney,(full,n,u)=>{amounts.push(moneyValue(n,u));return ' ';});
    }
    prefix=extract(prefix);tail=extract(tail);
    if(/\d\s*(?:천|백)|[일이삼사오육칠팔구십백천]+만?\s*원/.test(prefix+' '+tail))row.issues.push('금액 표현을 확인해 주세요. 이번 건의 금액을 숫자로 입력할 수 있습니다.');
    prefix=prefix.replace(/직수(?:\s*(?:아님|아니|안함|안\s*받음|X|x|취소))?/g,' ').trim();
    tail=tail.replace(/직수(?:\s*(?:아님|아니|안함|안\s*받음|X|x|취소))?/g,' ').trim();
    prefix=prefix.replace(new RegExp(DIRECT,'g'),' ').trim();tail=tail.replace(new RegExp(DIRECT,'g'),' ').trim();
    const amount=new RegExp('^'+MONEY+'(?=$|\\s|입니다|입니당|이에요|이요|받음|받았)').exec(tail);
    if(amount){amounts.push(moneyValue(amount[1],amount[2]));tail=tail.slice(amount[0].length).trim();}
    if(amounts.length===1){row.stated_amount=amounts[0];if(direct&&!negated)row.received_amount=amounts[0];}
    if(amounts.length>1)row.issues.push('금액이 여러 개 있습니다. 이번 작업 금액을 확인해 주세요.');
    if(amounts.some(n=>n===null))row.issues.push('기재 금액의 단위나 값을 확인해 주세요.');
    const found=known?.exec(prefix);let detail;
    if(found){row.store=canonical(found[1],aliases);detail=prefix.slice(found[0].length).trim();}
    else {
      // Retain an unknown store rather than guessing a similarly spelled one.
      const roomStart=/\s+(?=\d+(?:\s|층|호|티)|[a-zA-Z]\s*룸)|(?<=[가-힣A-Za-z])(?=\d+(?:호|티)?(?:\s|$))/.exec(prefix);
      let rawStore=roomStart?prefix.slice(0,roomStart.index):prefix;
      if(rawStore.length===1&&own(aliases,rawStore)!==undefined)rawStore=prefix;
      row.store=rawStore.trim();detail=prefix.slice(rawStore.length).trim();
    }
    if(!row.store)row.issues.push('가게 이름을 확인해 주세요.');
    row.room=[...detail.matchAll(ROOM)].map(m=>m[0]).join(' ');row.staff=detail.replace(ROOM,'').trim();
    if(tail&&!POLITE.test(tail))row.issues.push('개수 뒤에 해석하지 못한 내용이 있습니다.');
    if(SENSITIVE.test(segment)){row.issues.push('연락처·계좌 등이 섞여 있습니다. 작업 값을 직접 확인해 주세요.');row.stated_amount=null;row.received_amount=null;}
    rows.push(row);
  }

  function addBody(body) {
    if(!body||POLITE.test(body))return;
    // Commas in 40,000 and decimals are not job separators.
    for(const chunk of body.split(/(?<!\d),(?!\d)|(?<=개),(?!\d)|\s*[+;／/]\s*/)) {
      const starts=[0];if(boundary)for(const m of chunk.matchAll(boundary))if(m.index>0&&hasQty(chunk.slice(starts.at(-1),m.index)))starts.push(m.index);
      starts.forEach((start,i)=>add(chunk.slice(start,starts[i+1]??chunk.length)));
    }
  }

  function reconcileTotal(start,firstTotal,line) {
    if(totals.length===firstTotal||!hasDirect(line))return;
    const jobs=rows.slice(start),lastTotal=totals.at(-1);
    // “쿨노래방 1개 총 6만원 직수” is a single explicit receipt.
    // Across multiple jobs the scope of a trailing 직수 cannot be assumed.
    if(jobs.length===1&&hasQty(line)) {
      const row=jobs[0];row.source=line;
      if(/직수\s*(?:아님|아니|안함|안\s*받|없음|없어|X|x|취소)|취소|노쇼|정정|잘못|제외/.test(line)) {
        row.issues.push('직수·취소 표현의 적용 여부를 확인해 주세요.');return;
      }
      row.is_direct=true;
      if(lastTotal.amount===null)row.issues.push('직수 총액을 확인해 주세요.');
      else if(row.received_amount===null){row.received_amount=lastTotal.amount;row.stated_amount=lastTotal.amount;}
      else if(row.received_amount!==lastTotal.amount)row.issues.push('직수 금액과 총액이 다릅니다. 실제 받은 금액을 확인해 주세요.');
    } else if(jobs.length) {
      for(const row of jobs)row.issues.push('총액과 직수의 적용 대상을 확인해 주세요. 각 직수 금액을 확인하면 계산됩니다.');
    } else {
      add(line);rows.at(-1).issues.push('총액의 직수 적용 대상을 확인해 주세요.');
    }
  }

  for(let line of raw.split(/\r?\n/)) {
    line=line.trim();if(!line)continue;
    const kakao=/^\[([^\]]+)\]\s*\[(?:오전|오후)?\s*\d{1,2}:\d{2}\]\s*(.*)$/.exec(line);
    if(kakao){player=kakao[1];line=kakao[2].trim();if(!line)continue;}
    const header=/^((?:\d{4}[./-])?\d{1,2}[./-]\d{1,2})(?:\s+|$)(.*)$/.exec(line);
    if(header&&hasQty(line)){date=header[1];line=header[2].trim();}
    else if(header) {
      date=header[1];const candidate=header[2].trim();
      if(candidate&&/^(?:선수\s*[:：]\s*)?[^\s:：]{1,30}$/.test(candidate)&&!/담당|예금주|계좌|실장|부장|총|합계|체크|수금|직수|입니다/.test(candidate)&&/[가-힣a-zA-Z]/.test(candidate))player=candidate.replace(/^선수\s*[:：]\s*/,'');
      else if(candidate){player='';add(candidate);}continue;
    }
    const explicit=/^선수\s*[:：]\s*([^\s]{1,30})$/.exec(line);if(explicit){player=explicit[1];continue;}
    if(!hasQty(line)&&(SENSITIVE.test(line)||/^(체크|수금내역)$/.test(line))){notes.push(line);continue;}
    if(line==='직수'){add(line);continue;}
    const firstRow=rows.length,firstTotal=totals.length;
    // Sum lines describe preceding jobs; their operands are never extra jobs.
    const sum=new RegExp('(-?\\d[\\d,]*(?:\\.\\d+)?\\s*(?:만\\s*원|만원|만|원)?(?:\\s*\\+\\s*-?\\d[\\d,]*(?:\\.\\d+)?\\s*(?:만\\s*원|만원|만|원)?)+)\\s*=\\s*'+MONEY).exec(line);
    if(sum) {
      addBody(line.slice(0,sum.index).trim());
      const operands=sum[1].split('+').map(p=>{const m=new RegExp('^\\s*'+MONEY+'\\s*$').exec(p);return m?moneyValue(m[1],m[2]):null;});
      const selected=rows.slice(previous),amount=moneyValue(sum[2],sum[3]);
      totals.push({amount,source:sum[0],row_ids:(selected.length?selected:rows).map(r=>r.id),expression_amount:operands.every(n=>n!==null)?operands.reduce((a,b)=>a+b,0):null});
      previous=rows.length;const tail=line.slice(sum.index+sum[0].length).trim();if(tail&&!POLITE.test(tail))addBody(tail);reconcileTotal(firstRow,firstTotal,line);continue;
    }
    const matches=[...line.matchAll(new RegExp('(?:전체\\s*)?(?:총(?:합계|합|액)?|합계)\\s*'+MONEY,'g')),null];let cursor=0;
    for(const match of matches) {
      addBody(line.slice(cursor,match?match.index:line.length).trim());
      if(match){const all=previous===rows.length||match[0].includes('전체')||match[0].includes('총합');totals.push({amount:moneyValue(match[1],match[2]),source:match[0],row_ids:(all?rows:rows.slice(previous)).map(r=>r.id)});previous=rows.length;cursor=match.index+match[0].length;}
    }
    reconcileTotal(firstRow,firstTotal,line);
  }
  const players=[...new Set(rows.map(r=>r.player).filter(Boolean))];return {raw,player:players.length===1?players[0]:'',rows,stated_totals:totals,notes};
}

export function calculate(draft,rates=DEFAULT_RATES,aliases=DEFAULT_ALIASES,receipts=DEFAULT_RECEIPTS) {
  if(!draft||!Array.isArray(draft.rows)||draft.rows.length>500)throw Error('작업은 한 번에 500건 이하로 계산해 주세요.');
  const rows=[],dates=Object.create(null),stores=Object.create(null),duplicates=[],seen=new Map(),ids=new Set();let subtotal=0,unresolved=0,playerSubtotal=0,directReceipts=0;
  for(const original of draft.rows) {
    const row={...original},id=String(row.id||'');if(!id||ids.has(id))throw Error('작업 번호가 중복되었습니다. 다시 계산해 주세요.');ids.add(id);row.id=id;
    const store=canonical(row.store||'',aliases);row.store=store;
    const issues=row.confirmed?[]:[...(Array.isArray(row.issues)?row.issues:[])],units=quantityUnits(row.quantity),override=row.override_rate??null;
    if(override!==null&&(!Number.isInteger(override)||override<=0||override>1e7))throw Error('단가는 1~10,000,000원의 정수로 입력해 주세요.');
    const receiptOverride=row.override_received_amount??null;
    if(receiptOverride!==null&&(!Number.isInteger(receiptOverride)||receiptOverride<0||receiptOverride>1e10))throw Error('직수 받은 금액은 0~10,000,000,000원의 정수로 입력해 주세요.');
    const base=own(rates,store)??null,rate=override??base,receiptRate=own(receipts,store)??null;
    // Old drafts lacked this field. Old saved snapshots are returned unchanged by local-store.
    const direct=typeof row.is_direct==='boolean'?row.is_direct:hasDirect(row.source||'');
    const explicitReceipt=row.received_amount??(direct&&row.is_direct===undefined?row.stated_amount:null)??null;
    if(!store)issues.push('가게 확인 필요');
    if(units===null)issues.push('개수는 양수인 0.5 단위로 확인해 주세요. 자동 반올림하지 않습니다.');
    if(units!==null&&units>=2&&(!Number.isInteger(rate)||rate<=0||rate>1e7))issues.push('선수 지급 단가 미등록');
    const whole=units===null?0:Math.floor(units/2),half=units===null?0:units%2;
    const playerAmount=units!==null&&(!whole||(Number.isInteger(rate)&&rate>0&&rate<=1e7))?whole*(rate||0)+half*15000:null;
    let receiptAmount=null,receiptSource='';
    if(direct) {
      if(receiptOverride!==null){receiptAmount=receiptOverride;receiptSource='이번 건';}
      else if(explicitReceipt!==null){receiptAmount=explicitReceipt;receiptSource='원문';}
      else if(units!==null&&(!whole||(Number.isInteger(receiptRate)&&receiptRate>0&&receiptRate<=1e7))){receiptAmount=whole*(receiptRate||0)+half*30000;receiptSource='가게 금액표';}
      if(receiptAmount===null)issues.push('직수 받은 금액 또는 가게 금액 등록 필요');
      else if(!Number.isInteger(receiptAmount)||receiptAmount<0||receiptAmount>1e10){issues.push('직수 받은 금액을 확인해 주세요.');receiptAmount=null;}
    }
    Object.assign(row,{is_direct:direct,received_amount:explicitReceipt,override_received_amount:receiptOverride,rate,base_rate_missing:base===null,rate_source:override!==null?'이번 건':'기본 단가',receipt_rate:receiptRate,receipt_source:receiptSource,receipt_amount:receiptAmount,player_amount:playerAmount,amount:null,formula:'',review:[...new Set(issues)],difference:null});
    if(row.ignored)row.status='excluded';else if(issues.length){row.status='unresolved';unresolved++;}else {
      const amount=playerAmount-(direct?receiptAmount:0),shareFormula=(whole?`${whole}개 × ${fmt(rate)}원`:'')+(whole&&half?' + ':'')+(half?'반개 15,000원':'');
      Object.assign(row,{amount,status:'calculated',formula:direct?`선수 몫 ${fmt(playerAmount)}원 − 직수 받은 돈 ${fmt(receiptAmount)}원`:shareFormula});
      if(Number.isInteger(row.stated_amount))row.difference=playerAmount-row.stated_amount;
      subtotal+=amount;playerSubtotal+=playerAmount;if(direct)directReceipts+=receiptAmount;
    }
    if(row.status!=='excluded') {
      for(const [mapping,key] of [[dates,row.date||'날짜 미입력'],[stores,store||'가게 미확인']]){mapping[key]??={subtotal:0,unresolved:0};mapping[key].subtotal+=row.amount||0;mapping[key].unresolved+=Number(row.status==='unresolved');}
      const parts=[row.player||draft.player,row.date,store,row.room,String(row.quantity)],key=JSON.stringify(parts);
      if(parts.slice(0,4).every(Boolean)&&seen.has(key))duplicates.push(`작업 ${seen.get(key)}·${id}: 선수·날짜·가게·방·개수가 같습니다. 반복 제출 여부를 확인하세요. 금액은 공제하지 않았습니다.`);seen.set(key,id);
    }rows.push(row);
  }
  const byId=new Map(rows.map(r=>[r.id,r]));
  const comparisons=(draft.stated_totals||[]).map(t=>{const selected=(t.row_ids||[]).map(id=>byId.get(String(id))).filter(r=>r&&r.status!=='excluded'),complete=selected.length>0&&selected.every(r=>r.amount!==null),calculated=selected.reduce((s,r)=>s+(r.amount||0),0);return {...t,calculated,difference:complete&&Number.isInteger(t.amount)?calculated-t.amount:null};});
  const complete=rows.some(r=>r.status!=='excluded')&&unresolved===0,total=complete?subtotal:null;
  const direction=total===null?'pending':total>0?'pay':total<0?'collect':'none';
  const settlementLabel=direction==='pending'?'확인 후 정산 가능':direction==='pay'?'선수에게 줄 돈':direction==='collect'?'선수에게 받을 돈':'주고받을 돈 없음';
  const result={...draft,rows,subtotal,unresolved,complete,total,direction,settlement_label:settlementLabel,player_subtotal:playerSubtotal,direct_receipts:directReceipts,dates,stores,comparisons,duplicate_warnings:duplicates,payment_status:'지급 여부 미확인'};result.copy_text=copyText(result);return result;
}

export function copyText(result) {
  const lines=['에이스 정산'];if(result.player)lines.push(`선수: ${result.player}`);
  lines.push(result.complete?(result.total===0?'주고받을 돈 없음':`${result.total>0?'선수에게 줄 돈':'선수에게 받을 돈'} ${fmt(Math.abs(result.total))}원`):`확인 필요 ${result.unresolved}건 / 계산된 소계 ${fmt(result.subtotal)}원`);
  for(const r of result.rows){const label=[r.store,r.room].filter(Boolean).join(' ');lines.push(r.status==='excluded'?`${label||r.source}: 계산 제외`:r.amount===null?`${label||r.source} ${r.quantity||'?'}개: 확인 필요 (${r.review.join('; ')})`:`${label} ${r.quantity}개${r.is_direct?' · 직수':''} = ${r.amount<0?'−':r.amount>0?'+':''}${fmt(Math.abs(r.amount))}원`);}
  if(!result.complete)lines.push('미확인 작업은 소계에 포함되지 않았습니다.');
  return lines.join('\n');
}
