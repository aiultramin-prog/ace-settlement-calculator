import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import Script from 'next/script';
import markup from '../lib/app-markup.json';
export const dynamic='force-dynamic';
export default async function Page(){
  const user=await getChatGPTUser();
  if(!user)return <main className="landing panel"><p className="eyebrow">에이스 정산 계산기</p><h1>카톡 내역을 붙여 넣고,<br/>지급액을 바로 확인하세요.</h1><p>가게별 선수 지급 단가로 정확하게 계산합니다.<br/>모르는 단가와 애매한 내역은 확인할 수 있도록 남겨 둡니다.</p><a className="primary" href={chatGPTSignInPath('/')} target="_top">ChatGPT로 로그인하고 시작</a><p className="muted small">PC와 휴대폰에서 같은 계정으로 로그인하세요.<br/>내 자료는 비공개이며, 지정한 사람에게 조회만 허용할 수 있습니다.</p><div className="landing-features"><div><b>모든 가게의 0.5개는 15,000원</b><p>서로 다른 작업의 반개는 합쳐 계산하지 않습니다.</p></div><div><b>미등록 단가는 확인 필요</b><p>소계와 최종 지급액을 구분합니다. 단가를 입력하면 바로 다시 계산합니다.</p></div><div><b>어디서나 같은 기록</b><p>집 PC가 꺼져 있어도 저장한 단가와 정산 기록을 확인합니다.</p></div></div></main>;
  return <><div dangerouslySetInnerHTML={{__html:markup}}/><Script src="/ace.js" strategy="afterInteractive"/></>;
}
