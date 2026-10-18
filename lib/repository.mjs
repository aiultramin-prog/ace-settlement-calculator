import {DEFAULT_RATES,DEFAULT_ALIASES,RATE_NOTES} from './engine.mjs';
export class Repository {
  constructor(db,userId){if(!userId)throw Error('로그인이 필요합니다.');this.db=db;this.userId=userId;}
  query(sql,...args){return this.db.prepare(sql).bind(this.userId,...args);}
  async catalog(){
    const custom=(await this.query('SELECT name,amount,note FROM rates WHERE user_id=?').all()).results;
    const rates=new Map(Object.entries(DEFAULT_RATES).map(([name,amount])=>[name,{name,amount,note:RATE_NOTES[name]||''}]));
    for(const r of custom)rates.set(r.name,r);
    const aliases={...DEFAULT_ALIASES};for(const r of (await this.query('SELECT alias,store FROM aliases WHERE user_id=?').all()).results){if(r.store)Object.defineProperty(aliases,r.alias,{value:r.store,enumerable:true,configurable:true,writable:true});else delete aliases[r.alias];}
    return {rates:[...rates.values()],aliases};
  }
  async setRate({name,amount,note}){
    name=String(name||'').trim();if(!name||name.length>40||/[\r\n]/.test(name)||!Number.isInteger(amount)||amount<=0||amount>1e7)throw Error('가게 이름과 1~10,000,000원의 정수 단가를 입력하세요.');
    if(note===undefined){const c=await this.catalog();note=c.rates.find(r=>r.name===name)?.note||'';}
    note=String(note);if(note.length>500)throw Error('메모는 500자 이하로 입력하세요.');
    const catalog=await this.catalog();if(Object.hasOwn(catalog.aliases,name)&&catalog.aliases[name]!==name)throw Error('이미 별칭으로 등록된 이름입니다. 연결된 가게 이름으로 단가를 저장하세요.');
    await this.query('INSERT INTO rates(user_id,name,amount,note) VALUES(?,?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET amount=excluded.amount,note=excluded.note',name,amount,note).run();return {ok:true};
  }
  async setAlias({alias,store},remove=false){
    alias=String(alias||'').trim();store=String(store||'').trim();const c=await this.catalog();
    if(!alias||alias.length>40||/[\r\n]/.test(alias)||c.rates.some(r=>r.name===alias))throw Error('가게 이름과 겹치지 않는 별칭을 40자 이하로 입력하세요.');
    if(!remove&&!c.rates.some(r=>r.name===store))throw Error('등록된 가게를 선택하세요.');
    await this.query('INSERT INTO aliases(user_id,alias,store) VALUES(?,?,?) ON CONFLICT(user_id,alias) DO UPDATE SET store=excluded.store',alias,remove?'':store).run();return {ok:true};
  }
  async duplicates(raw){const fingerprint=await hash(raw);return (await this.query('SELECT id,created_at FROM records WHERE user_id=? AND fingerprint=? ORDER BY created_at DESC LIMIT 20',fingerprint).all()).results;}
  async save(snapshot){const id=crypto.randomUUID(),created_at=new Date().toISOString(),fingerprint=await hash(snapshot.raw||'');await this.query('INSERT INTO records(user_id,id,created_at,fingerprint,snapshot) VALUES(?,?,?,?,?)',id,created_at,fingerprint,JSON.stringify(snapshot)).run();return {id,created_at,snapshot};}
  async list(){return (await this.query('SELECT id,created_at,snapshot FROM records WHERE user_id=? ORDER BY created_at DESC LIMIT 200').all()).results.map(r=>{const s=JSON.parse(r.snapshot);return {id:r.id,created_at:r.created_at,player:s.player,dates:Object.keys(s.dates),total:s.total,subtotal:s.subtotal,unresolved:s.unresolved};});}
  async get(id){const r=await this.query('SELECT id,created_at,snapshot FROM records WHERE user_id=? AND id=?',id).first();return r?{...r,snapshot:JSON.parse(r.snapshot)}:null;}
}
async function hash(raw){const bytes=new TextEncoder().encode(String(raw).replace(/\r\n/g,'\n').trim());return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
