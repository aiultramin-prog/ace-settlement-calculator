export const AI_ENDPOINT='https://ace-settlement-calculator.wittypike128.chatgpt.site/api/ai/parse';
export const TOKEN_KEY='ace-ai-connection-v1';
export const validToken=token=>typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
export function readConnection(storage,location,history){
  const incoming=new URLSearchParams(location.hash.slice(1)).get('ace_ai');
  if(incoming!==null){
    history.replaceState(null,'',location.pathname+location.search);
    if(validToken(incoming))storage.setItem(TOKEN_KEY,incoming);
  }
  return storage.getItem(TOKEN_KEY)||'';
}
export async function parseAI(raw,catalog,token,fetcher=fetch){
  if(!validToken(token))throw Error('사용 안내에서 AI 연결 코드를 등록해 주세요.');
  if(!raw.trim())throw Error('카톡 내역을 붙여 넣어 주세요.');
  if(raw.length>20000)throw Error('AI 해석은 한 번에 20,000자까지 가능합니다. 나누어 입력해 주세요.');
  let response;
  try{response=await fetcher(AI_ENDPOINT,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({raw,catalog:{rates:catalog.rates.map(({name})=>({name})),aliases:catalog.aliases}}),signal:AbortSignal.timeout(65000)});}
  catch{throw Error('AI에 연결하지 못했습니다. 인터넷을 확인하거나 기본 계산을 이용해 주세요.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Error(body?.error||'AI 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  if(!body?.draft||body.draft.raw!==raw||!Array.isArray(body.draft.rows))throw Error('AI 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
  // Ignore any remotely supplied totals, prices, overrides, confirmed/ignored flags.
  const rows=body.draft.rows.map((r,i)=>{
    if(!r||typeof r.source!=='string'||!r.source.trim()||!raw.includes(r.source))throw Error('원문과 AI 해석이 일치하지 않습니다. 다시 해석해 주세요.');
    return {id:String(i+1),source:r.source,store:r.store,quantity:r.quantity,date:r.date||'',room:r.room||'',player:r.player||'',staff:'',
      is_direct:r.is_direct===true,received_amount:r.received_amount??null,stated_amount:r.stated_amount??null,
      issues:Array.isArray(r.issues)?r.issues:['해석을 확인해 주세요.'],confirmed:false,ignored:false,override_rate:null,override_received_amount:null};
  });
  return {raw,rows,player:body.draft.player||'',stated_totals:body.draft.stated_totals||[],notes:body.draft.notes||[],parser:'ai'};
}
