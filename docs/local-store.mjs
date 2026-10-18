import {DEFAULT_RATES,DEFAULT_ALIASES,RATE_NOTES,parseText,calculate} from './engine.mjs';
const KEY='ace-settlement-github-v1';
export function createLocalApi(storage){
  function read(){const raw=storage.getItem(KEY);if(!raw)return {rates:{},aliases:{},records:[]};try{const s=JSON.parse(raw);if(!s||typeof s.rates!=='object'||typeof s.aliases!=='object'||!Array.isArray(s.records))throw Error();return s;}catch{throw Error('저장 자료를 읽지 못했습니다. 브라우저 데이터를 지우지 말고 확인해 주세요.');}}
  function write(s){try{storage.setItem(KEY,JSON.stringify(s));}catch{throw Error('이 브라우저에 저장하지 못했습니다. 저장 공간이나 브라우저 설정을 확인하고 결과를 복사해 두세요.');}}
  function catalog(s){const rates=Object.entries(DEFAULT_RATES).map(([name,amount])=>({name,amount,note:RATE_NOTES[name]||''}));for(const [name,value]of Object.entries(s.rates)){const r=rates.find(r=>r.name===name);if(r)Object.assign(r,value);else rates.push({name,...value});}const aliases={...DEFAULT_ALIASES};for(const [name,value]of Object.entries(s.aliases)){if(value===null)delete aliases[name];else Object.defineProperty(aliases,name,{value,enumerable:true,configurable:true,writable:true});}return {rates,aliases};}
  return async function api(path,data){
    const s=read(),c=catalog(s),rates=Object.fromEntries(c.rates.map(r=>[r.name,r.amount]));
    if(path==='/api/catalog')return c;
    if(path==='/api/rates'){
      const name=String(data.name||'').trim(),amount=data.amount,note=String(data.note??c.rates.find(r=>r.name===name)?.note??'');
      if(!name||name.length>40||!Number.isInteger(amount)||amount<1||amount>1e7||note.length>500)throw Error('가게 이름과 올바른 원 단위 단가를 입력하세요.');
      if(Object.hasOwn(c.aliases,name)&&c.aliases[name]!==name)throw Error('별칭 대신 연결된 가게 이름으로 단가를 저장하세요.');
      Object.defineProperty(s.rates,name,{value:{amount,note},enumerable:true,configurable:true,writable:true});write(s);return {ok:true};
    }
    if(path==='/api/aliases'||path==='/api/aliases/delete'){
      const alias=String(data.alias||'').trim(),store=String(data.store||'').trim(),remove=path.endsWith('/delete');
      if(!alias||alias.length>40||c.rates.some(r=>r.name===alias)||(!remove&&!Object.hasOwn(rates,store)))throw Error('가게 이름과 겹치지 않는 별칭과 등록된 가게를 선택하세요.');
      Object.defineProperty(s.aliases,alias,{value:remove?null:store,enumerable:true,configurable:true,writable:true});write(s);return {ok:true};
    }
    if(path==='/api/records'&&data===undefined)return s.records.map(r=>({id:r.id,created_at:r.created_at,player:r.snapshot.player,dates:Object.keys(r.snapshot.dates),total:r.snapshot.total,subtotal:r.snapshot.subtotal,unresolved:r.snapshot.unresolved}));
    if(path.startsWith('/api/records/')){const record=s.records.find(r=>r.id===path.slice('/api/records/'.length));if(!record)throw Error('기록을 찾을 수 없습니다.');return record;}
    if(['/api/parse','/api/calculate','/api/records'].includes(path)){
      const result=calculate(path==='/api/parse'?parseText(data.raw,rates,c.aliases):data,rates,c.aliases);
      result.saved_duplicates=s.records.filter(r=>r.snapshot.raw?.trim()===result.raw?.trim()).map(r=>({id:r.id}));
      if(path==='/api/records'){const record={id:crypto.randomUUID(),created_at:new Date().toISOString(),snapshot:result};s.records.unshift(record);write(s);return record;}
      return result;
    }
    throw Error('지원하지 않는 요청입니다.');
  };
}
