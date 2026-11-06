/** Chromium에서 실제 DOM 상호작용을 확인합니다. 외부 영상 재생은 모의하지 않습니다. */
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {fixture} from './gas-mock.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=http.createServer((req,res)=>{const file=req.url==='/app'?'.preview/production-test.html':req.url==='/'?'.preview/index.html':null;if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,file),'utf8'));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=path.join(root,'.test-results');fs.mkdirSync(results,{recursive:true});
const errors=[];
async function setupPage(context){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>{
  if(route.request().url().startsWith('https://img.youtube.com/vi/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#93bfcf"/><text x="40" y="145" font-size="25" fill="#243540">YouTube thumbnail (test)</text></svg>'});
  return route.abort();
 });return page;
}
try {
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),page=await setupPage(context);
 await page.goto(origin+'/');
 await page.locator('.scene-card').first().waitFor();assert.equal(await page.locator('.team-group').count(),2);assert.equal(await page.locator('.scene-card').count(),4);
 await page.getByRole('button',{name:'2팀 2',exact:true}).click();assert.equal(await page.locator('.team-group').count(),1);assert.equal(await page.locator('.scene-card').count(),2);
 await page.getByRole('button',{name:'전체 4',exact:true}).click();await page.getByLabel('카드 제목 또는 태그 검색').fill('다정한');assert.equal(await page.locator('.scene-card').count(),1);await page.getByLabel('카드 제목 또는 태그 검색').fill('');
 await page.getByRole('button',{name:'#간접 거절',exact:true}).click();assert.equal(await page.locator('.scene-card').count(),1);await page.getByRole('button',{name:'모든 태그',exact:true}).click();
 await page.locator('.thumbnail img').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{const img=document.querySelector('.thumbnail img');return img?.complete&&img.naturalWidth>0;});
 const visibleImage=await page.locator('.thumbnail').first().evaluate(n=>{const img=n.querySelector('img'),r=n.getBoundingClientRect();return {onTop:document.elementFromPoint(r.left+15,r.top+15)===img,fallback:n.querySelector('.thumbnail-fallback').hidden,src:img.src};});assert.equal(visibleImage.onTop,true);assert.equal(visibleImage.fallback,true);assert.ok(visibleImage.src.startsWith('https://img.youtube.com/vi/'));
 await page.evaluate(()=>window.scrollTo(0,0));
 console.log('PASS thumbnails: image visible above fallback; failed first host retries alternate host (mock image response)');
 await page.screenshot({path:path.join(results,'gallery-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'거절에도 다정한 온도가 있어요 카드 살펴보기',exact:true}).click();
 assert.equal(await page.locator('.card-back').textContent(),'');await page.getByLabel('A. 싫어. 안 갈래.',{exact:true}).check();await page.getByRole('button',{name:'정답 확인 및 카드 뒤집기 ↻'}).click();
 await page.getByText('내가 고른 답: A · 정답: B').waitFor();assert.match(await page.locator('.card-back').textContent(),/다른 표현도 가능/);
 await page.getByRole('button',{name:'← 장면 다시 보기'}).click();await page.getByLabel('B. 이번 주말은 약속이 있어서 어려울 것 같아.',{exact:true}).check();await page.getByRole('button',{name:'정답 확인 및 카드 뒤집기 ↻'}).click();await page.getByText('내가 고른 답: B · 정답: B').waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator('#viewer').evaluate(n=>n.open),false);
 console.log('PASS preview: 팀 그룹, 팀/제목/태그 필터, 오답/정답, 뒤집기, Escape');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(results,'gallery-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'거절에도 다정한 온도가 있어요 카드 살펴보기',exact:true}).click();await page.getByLabel('B. 이번 주말은 약속이 있어서 어려울 것 같아.',{exact:true}).check();await page.getByRole('button',{name:'정답 확인 및 카드 뒤집기 ↻'}).click();await page.getByText('내가 고른 답: B · 정답: B').waitFor();assert.ok(await page.locator('#viewer').evaluate(n=>n.scrollHeight>n.clientHeight));await page.screenshot({path:path.join(results,'quiz-mobile.png')});await page.keyboard.press('Escape');console.log('PASS mobile: 390px 가로 넘침 없음, 퀴즈, 긴 분석 스크롤');
 // 운영 프런트엔드와 모의 Apps Script로 즉시 공개·비공개 코멘트 흐름을 확인합니다.
 const f=fixture();
 const html=fs.readFileSync(path.join(root,'Index.html'),'utf8').replace(/<\?!= include_\('([A-Za-z]+)'\); \?>/g,(_,name)=>fs.readFileSync(path.join(root,name+'.html'),'utf8'));
 fs.writeFileSync(path.join(root,'.preview/production-test.html'),html);
 const appContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await appContext.exposeFunction('serverCall',(name,args)=>f.call(name,...args));
 await appContext.addInitScript(()=>{
  Object.defineProperty(window,'google',{value:{script:{get run(){let success,failure;const proxy=new Proxy({}, {get:(_,name)=>name==='withSuccessHandler'?fn=>{success=fn;return proxy;}:name==='withFailureHandler'?fn=>{failure=fn;return proxy;}:(...args)=>window.serverCall(name,args).then(success).catch(failure)});return proxy;}}}});
 });
 const app=await setupPage(appContext);app.on('dialog',d=>d.accept());await app.goto(origin+'/app');
 await app.getByRole('button',{name:'내 팀 작업실',exact:true}).click();await app.getByLabel('팀 편집 코드 *',{exact:true}).fill('team-one-test');await app.getByRole('button',{name:'입장하기 →'}).click();await app.getByRole('button',{name:'+ 새 카드 만들기'}).click();
 const malicious='<img src=x onerror=alert(1)>';
 await app.getByLabel('카드 제목 *',{exact:true}).fill(malicious);await app.getByRole('button',{name:'임시저장',exact:true}).click();await app.getByText('임시저장했습니다.',{exact:true}).waitFor();
 await app.reload();await app.getByRole('button',{name:'내 팀 작업실',exact:true}).click();await app.getByRole('button',{name:'카드 편집',exact:true}).click();assert.equal(await app.getByLabel('카드 제목 *',{exact:true}).inputValue(),malicious);
 await app.getByLabel('카드 제목 *',{exact:true}).fill('거절에도 다정한 온도가 있어요');await app.getByLabel('콘텐츠명 *',{exact:true}).fill('캠퍼스의 하루 · 가상 장면');await app.getByLabel('YouTube 영상 URL *',{exact:true}).fill('https://youtu.be/M7lc1UVf-VE?t=1m30s');await app.getByLabel('장면 소개 및 영상의 상황적 배경 *',{exact:true}).fill('친구의 제안을 거절하는 가상 상황');await app.getByLabel('핵심 태그 (쉼표로 구분 · 최대 3개)',{exact:true}).fill('거절, 공손성');
 await app.getByLabel('③ 담화 및 화용 분석',{exact:true}).fill('상대방의 체면을 존중하는 표현');await app.getByLabel('퀴즈 질문 *',{exact:true}).fill('어떤 표현이 적절한가요?');for(let i=0;i<3;i++)await app.getByLabel(String.fromCharCode(65+i)+' 선택지 *',{exact:true}).fill(['싫어.','일정이 있어서 어려울 것 같아.','안 돼.'][i]);await app.getByLabel('정답 선택',{exact:true}).selectOption('B');await app.getByLabel('정답 해설 *',{exact:true}).fill('이유와 함께 완곡하게 표현합니다.');
 await app.getByRole('button',{name:'미리보기',exact:true}).click();await app.getByLabel('B. 일정이 있어서 어려울 것 같아.',{exact:true}).check();await app.getByRole('button',{name:'정답 확인 및 카드 뒤집기 ↻'}).click();await app.getByText('내가 고른 답: B · 정답: B').waitFor();await app.keyboard.press('Escape');
 await app.getByRole('button',{name:'카드 공개 →',exact:true}).click();await app.getByText('카드를 공개했습니다. 갤러리에 바로 반영됩니다.',{exact:true}).waitFor();assert.equal(f.call('getGallery').data.cards.length,1);await app.getByRole('button',{name:'수정 내용 공개 →',exact:true}).waitFor();
 console.log('PASS publish: partial save, refresh restore, preview, direct student publication without approval');
 await app.getByRole('button',{name:'교수자 관리',exact:true}).click();await app.getByLabel('관리자 코드 *',{exact:true}).fill('teacher-test-19');await app.getByRole('button',{name:'입장하기 →'}).click();await app.getByRole('button',{name:'카드·코멘트 보기',exact:true}).click();assert.equal(await app.getByRole('button',{name:'승인 및 공개',exact:true}).count(),0);
 await app.getByLabel('작성 팀만 보는 교수자 코멘트',{exact:true}).fill('좋은 장면이에요! 화자와 청자의 관계를 더 자세히 설명해 보세요.');await app.locator('.review-actions').screenshot({path:path.join(results,'teacher-private-comment.png')});await app.getByRole('button',{name:'코멘트 저장',exact:true}).click();await app.getByText('팀 전용 코멘트를 저장했습니다.',{exact:true}).waitFor();assert.equal(f.call('getGallery').data.cards.length,1);
 const published=f.call('getGallery').data.cards[0];assert.equal(Object.hasOwn(published,'teacherFeedback'),false);assert.equal(Object.hasOwn(f.call('submitQuiz',published.cardId,'B',published.version).data.card,'teacherFeedback'),false);
 await app.getByRole('button',{name:'전체 카드',exact:true}).click();await app.getByRole('button',{name:'거절에도 다정한 온도가 있어요 카드 살펴보기',exact:true}).click();await app.getByLabel('B. 일정이 있어서 어려울 것 같아.',{exact:true}).check();await app.getByRole('button',{name:'정답 확인 및 카드 뒤집기 ↻'}).click();await app.getByText('상대방의 체면을 존중하는 표현',{exact:true}).waitFor();assert.equal(await app.getByText('좋은 장면이에요! 화자와 청자의 관계를 더 자세히 설명해 보세요.',{exact:true}).count(),0);await app.keyboard.press('Escape');
 await app.getByRole('button',{name:'내 팀 작업실',exact:true}).click();await app.getByLabel('팀 편집 코드 *',{exact:true}).fill('team-two-test');await app.getByLabel('우리 팀',{exact:true}).selectOption('team2');await app.getByRole('button',{name:'입장하기 →'}).click();await app.getByRole('button',{name:'+ 새 카드 만들기',exact:true}).waitFor();assert.equal(await app.locator('#workspace-page .work-item').count(),0);assert.equal(await app.getByText('좋은 장면이에요! 화자와 청자의 관계를 더 자세히 설명해 보세요.',{exact:true}).count(),0);
 await app.getByRole('button',{name:'로그아웃',exact:true}).click();await app.getByRole('button',{name:'내 팀 작업실',exact:true}).click();await app.getByLabel('팀 편집 코드 *',{exact:true}).fill('team-one-test');await app.getByRole('button',{name:'입장하기 →'}).click();await app.getByRole('button',{name:'카드 편집',exact:true}).click();await app.locator('.feedback-box').waitFor();assert.match(await app.locator('.feedback-box').textContent(),/좋은 장면이에요/);await app.locator('.feedback-box').screenshot({path:path.join(results,'team-private-comment.png')});
 await app.getByLabel('① 상황 맥락',{exact:true}).fill('주말 모임을 제안한 친구에게 선약이 있음을 설명하는 상황입니다.');await app.getByRole('button',{name:'수정 내용 공개 →',exact:true}).click();await app.getByText('카드를 공개했습니다. 갤러리에 바로 반영됩니다.',{exact:true}).waitFor();assert.equal(f.call('getGallery').data.cards.length,1);
 await app.getByRole('button',{name:'비공개로 저장',exact:true}).click();await app.getByText('임시저장했습니다.',{exact:true}).waitFor();assert.equal(f.call('getGallery').data.cards.length,0);await app.getByRole('button',{name:'카드 공개 →',exact:true}).click();await app.getByText('카드를 공개했습니다. 갤러리에 바로 반영됩니다.',{exact:true}).waitFor();assert.equal(f.call('getGallery').data.cards.length,1);
 console.log('PASS private comments: professor saves without unpublishing; author team reads/edits; other team and public quiz cannot access comments');
 await app.getByRole('button',{name:'교수자 관리',exact:true}).click();await app.getByLabel('관리자 코드 *',{exact:true}).fill('teacher-test-19');await app.getByRole('button',{name:'입장하기 →'}).click();await app.getByText('+ 새로운 팀 추가',{exact:true}).click();const settings=app.locator('.team-setting').last();await settings.getByLabel('팀 ID (변경 불가) *',{exact:true}).fill('team3');await settings.getByLabel('팀명 *',{exact:true}).fill('새로운 시선');await settings.getByLabel('편집 코드 (5~15자) *',{exact:true}).fill('third-team-code');await settings.getByRole('button',{name:'팀 추가',exact:true}).click();await app.getByText('팀 정보를 저장했습니다.',{exact:true}).waitFor();assert.equal(f.call('getGallery').data.teams.length,3);console.log('PASS team settings');
 await page.evaluate(()=>{window.YT={Player:function(frame,config){this.destroy=()=>{};setTimeout(()=>config.events.onError({data:150}),10);}};});await page.getByRole('button',{name:'거절에도 다정한 온도가 있어요 카드 살펴보기',exact:true}).click();await page.getByText('이 영상은 여기에서 재생할 수 없습니다.',{exact:true}).waitFor();assert.equal(await page.locator('#viewer iframe').count(),0);assert.ok(await page.getByRole('link',{name:'YouTube에서 원본 영상 열기 ↗',exact:true}).isVisible());await page.keyboard.press('Escape');console.log('PASS simulated YouTube embed denial: 오류 안내로 대체, 원본 링크 제공');
 assert.deepEqual(errors,[]);console.log('PASS uncaught browser errors: 0');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
