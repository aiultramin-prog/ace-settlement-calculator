import {parseText,calculate} from './engine.mjs';
import {Repository} from './repository.mjs';
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handle(request,user,db){
  if(!user?.userId)return response({error:'로그인 후 이용하세요.'},401);
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,'');
  if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))return response({error:'올바르지 않은 요청입니다.'},403);
  try{
    const owner=url.searchParams.get('owner')||user.userId;
    const viewer=owner!==user.userId;
    if(viewer&&!await db.prepare('SELECT viewer_id FROM viewers WHERE owner_id=? AND viewer_id=?').bind(owner,user.userId).first())return response({error:'이 정산을 볼 권한이 없습니다.'},403);
    if(viewer&&request.method!=='GET')return response({error:'조회 전용입니다. 계산·저장·수정은 소유자만 할 수 있습니다.'},403);
    const repo=new Repository(db,owner);
    if(request.method==='GET'){
      if(path==='status')return response({authenticated:true,csrf:'same-origin',email:user.email,user_id:user.userId,owner_id:owner,role:viewer?'viewer':'owner'});
      if(path==='sharing'&&!viewer)return response((await db.prepare('SELECT viewer_id,label FROM viewers WHERE owner_id=?').bind(owner).all()).results);
      if(path==='shared-with-me')return response((await db.prepare('SELECT owner_id,label FROM viewers WHERE viewer_id=?').bind(user.userId).all()).results);
      if(path==='catalog')return response(await repo.catalog());
      if(path==='records')return response(await repo.list());
      if(/^records\/[\w-]+$/.test(path)){const r=await repo.get(path.split('/')[1]);return response(r||{error:'기록을 찾지 못했습니다.'},r?200:404);}
    }else if(request.method==='POST'){
      if(Number(request.headers.get('content-length')||0)>1e6)return response({error:'입력이 너무 큽니다.'},413);
      const raw=await request.text();if(raw.length>1e6)return response({error:'입력이 너무 큽니다.'},413);const data=JSON.parse(raw);
      if(path==='sharing'||path==='sharing/remove'){
        const id=String(data.viewer_id||'').trim(),label=String(data.label||'조회 사용자').trim();
        if(!id||id.length>200||/\s/.test(id)||id===owner||label.length>40)throw Error('상대방의 계정 코드와 이름을 확인하세요.');
        if(path==='sharing/remove')await db.prepare('DELETE FROM viewers WHERE owner_id=? AND viewer_id=?').bind(owner,id).run();
        else await db.prepare('INSERT INTO viewers(owner_id,viewer_id,label) VALUES(?,?,?) ON CONFLICT(owner_id,viewer_id) DO UPDATE SET label=excluded.label').bind(owner,id,label).run();
        return response({ok:true});
      }
      if(path==='rates')return response(await repo.setRate(data));
      if(path==='aliases'||path==='aliases/delete')return response(await repo.setAlias(data,path.endsWith('/delete')));
      if(['parse','calculate','records'].includes(path)){
        const catalog=await repo.catalog(),rates=Object.fromEntries(catalog.rates.map(r=>[r.name,r.amount]));
        const draft=path==='parse'?parseText(data.raw,rates,catalog.aliases):data;
        const result=calculate(draft,rates,catalog.aliases);result.saved_duplicates=await repo.duplicates(result.raw||'');
        return response(path==='records'?await repo.save(result):result);
      }
    }
    return response({error:'찾을 수 없는 요청입니다.'},404);
  }catch(e){return response({error:e instanceof Error?e.message:'요청을 처리하지 못했습니다.'},400);}
}
