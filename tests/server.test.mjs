/** Apps Script API를 모의한 회귀 테스트: 실제 Google 계정 접속 테스트가 아닙니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {fixture} from './gas-mock.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function sample(c,team='team1'){const s=JSON.parse(JSON.stringify(c.sampleCards_()[0]));delete s.cardId;s.teamId=team;return s;}
function good(r){assert.equal(r.ok,true,JSON.stringify(r));return r.data;}
function bad(r,code){assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.error.code,code);}

test('초기화는 해시만 보관하며 중복 초기화와 중복 코드를 차단한다',()=>{
 const f=fixture();assert.equal(f.store.has('ADMIN_SETUP_CODE'),false);assert.equal(f.store.has('TEAM_SETUP_JSON'),false);
 const rows=f.c.rows_('Teams');assert.notEqual(rows[0].editCodeSalt,rows[1].editCodeSalt);assert.notEqual(rows[0].editCodeHash,'team-one-test');
 assert.throws(()=>f.c.initialize_(),/이미 초기화/);
 const a=f.login('admin',null,'teacher-test-19');bad(f.call('saveTeam',a,{teamId:'team3',teamName:'new',sortOrder:3,active:true,editCode:'team-one-test'}),'CODE');
});
test('로그인 실패 제한, 만료, 로그아웃, 코드 교체 후 세션 폐기',()=>{
 const f=fixture();for(let i=0;i<5;i++)bad(f.call('login','team','team1','wrong-code'),'AUTH');bad(f.call('login','team','team1','team-one-test'),'RATE_LIMIT');
 f.advance(16*60000);const t=f.login('team','team1','team-one-test');good(f.call('getWorkspace',t));
 good(f.call('logout',t));bad(f.call('getWorkspace',t),'AUTH');
 const t2=f.login('team','team2','team-two-test');f.advance(7*3600000);bad(f.call('getWorkspace',t2),'AUTH');
 const t3=f.login('team','team1','team-one-test'),a=f.login('admin',null,'teacher-test-19');
 good(f.call('saveTeam',a,{teamId:'team1',teamName:'바뀐 팀',teamDescription:'새 팀',sortOrder:1,active:true,editCode:'new-team-one'}));bad(f.call('getWorkspace',t3),'AUTH');f.login('team','team1','new-team-one');
 good(f.call('changeAdminCode',a,'new-admin-20'));bad(f.call('getWorkspace',a),'AUTH');f.login('admin',null,'new-admin-20');
});
test('임시저장·직접 공개·팀 전용 코멘트·공개 수정·보관 흐름',()=>{
 const f=fixture(),t=f.login('team','team1','team-one-test'),a=f.login('admin',null,'teacher-test-19'),two=f.login('team','team2','team-two-test');
 let card=good(f.call('saveCard',t,{teamId:'team1',tags:[],quizOptions:[{text:''},{text:''},{text:''}]},'draft'));assert.equal(card.status,'draft');assert.match(card.cardId,/^[a-f0-9-]{36}$/);
 assert.equal(good(f.call('getWorkspace',t)).cards[0].cardId,card.cardId);assert.equal(good(f.call('getGallery')).cards.length,0);
 bad(f.call('saveCard',t,{...card},'publish'),'VALIDATION');bad(f.call('submitQuiz',card.cardId,'B',card.version),'NOT_FOUND');
 card=good(f.call('saveCard',t,{...sample(f.c),cardId:card.cardId,version:card.version},'publish'));assert.equal(card.status,'published');assert.equal(good(f.call('getGallery')).cards.length,1);
 const publishedAt=card.publishedAt;
 card=good(f.call('reviewCard',a,card.cardId,card.version,'comment','관계와 상황을 더 자세히 적어 주세요.'));assert.equal(card.status,'published');
 assert.equal(good(f.call('getWorkspace',t)).cards[0].teacherFeedback,card.teacherFeedback);assert.equal(good(f.call('getWorkspace',two)).cards.length,0);
 const front=good(f.call('getGallery')).cards[0];
 for(const key of ['correctChoiceId','quizExplanation','context','relationship','mainExpression','discourseAnalysis','nonverbalAnalysis','culturalContext','learningPoint','teacherFeedback','editCodeSalt','editCodeHash'])assert.equal(Object.hasOwn(front,key),false,key);
 for(const team of good(f.call('getGallery')).teams)for(const key of ['editCodeSalt','editCodeHash'])assert.equal(Object.hasOwn(team,key),false);
 bad(f.call('submitQuiz',card.cardId,'Z',card.version),'VALIDATION');
 const wrong=good(f.call('submitQuiz',card.cardId,'A',card.version));assert.equal(wrong.correct,false);assert.ok(wrong.card.discourseAnalysis);assert.equal(Object.hasOwn(wrong.card,'teacherFeedback'),false);
 const right=good(f.call('submitQuiz',card.cardId,'B',card.version));assert.equal(right.correct,true);assert.equal(Object.hasOwn(right.card,'teacherFeedback'),false);
 card=good(f.call('saveCard',t,{...card,title:'피드백 반영 카드',teacherFeedback:'학생이 덮어쓰려는 코멘트'},'publish'));assert.equal(card.status,'published');assert.equal(card.publishedAt,publishedAt);assert.equal(card.teacherFeedback,'관계와 상황을 더 자세히 적어 주세요.');assert.equal(good(f.call('getGallery')).cards[0].title,'피드백 반영 카드');
 card=good(f.call('saveCard',t,card,'draft'));assert.equal(card.status,'draft');assert.equal(good(f.call('getGallery')).cards.length,0);
 card=good(f.call('saveCard',t,card,'publish'));card=good(f.call('reviewCard',a,card.cardId,card.version,'archive','ignored'));assert.equal(card.teacherFeedback,'관계와 상황을 더 자세히 적어 주세요.');assert.equal(good(f.call('getGallery')).cards.length,0);bad(f.call('submitQuiz',card.cardId,'B',card.version),'NOT_FOUND');bad(f.call('saveCard',t,card,'publish'),'STATE');
 card=good(f.call('reviewCard',a,card.cardId,card.version,'restore',''));assert.equal(card.status,'draft');
 card=good(f.call('reviewCard',a,card.cardId,card.version,'comment',''));assert.equal(card.teacherFeedback,'');
});
test('다른 팀 및 위조 요청은 읽기·수정·삭제·승인할 수 없다',()=>{
 const f=fixture(),one=f.login('team','team1','team-one-test'),two=f.login('team','team2','team-two-test');
 const card=good(f.call('saveCard',one,sample(f.c),'draft'));
 assert.equal(good(f.call('getWorkspace',two)).cards.length,0);
 bad(f.call('saveCard',two,{...card,teamId:'team2'},'draft'),'FORBIDDEN');bad(f.call('saveCard',one,{...card,teamId:'team2'},'draft'),'FORBIDDEN');
 bad(f.call('deleteCard',two,card.cardId,card.version),'FORBIDDEN');bad(f.call('reviewCard',one,card.cardId,card.version,'publish',''),'FORBIDDEN');
 bad(f.call('saveTeam',one,{teamId:'team1'}),'FORBIDDEN');bad(f.call('getWorkspace','forged-token'),'AUTH');
 good(f.call('deleteCard',one,card.cardId,card.version));assert.equal(good(f.call('getWorkspace',one)).cards.length,0);
});
test('동시 수정의 이전 버전과 퀴즈 화면의 오래된 버전을 감지한다',()=>{
 const f=fixture(),t=f.login('team','team1','team-one-test');let card=good(f.call('saveCard',t,sample(f.c),'draft'));const old={...card};
 card=good(f.call('saveCard',t,{...card,title:'새 제목'},'draft'));assert.equal(card.version,2);bad(f.call('saveCard',t,old,'draft'),'CONFLICT');bad(f.call('deleteCard',t,old.cardId,old.version),'CONFLICT');
 const a=f.login('admin',null,'teacher-test-19');card=good(f.call('saveCard',t,card,'publish'));
 bad(f.call('submitQuiz',card.cardId,'B',card.version-1),'CONFLICT');
});
test('URL과 필수 값 검증, 수식/HTML 원문 저장, 정답 덮어쓰기 제한',()=>{
 const f=fixture(),t=f.login('team','team1','team-one-test');
 for(const url of ['https://youtu.be/M7lc1UVf-VE?t=1m30s','https://www.youtube.com/shorts/M7lc1UVf-VE?start=90','https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90'])assert.match(f.c.youtube_(url),/t=90$/);
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://user@youtube.com/watch?v=M7lc1UVf-VE','http://youtu.be/M7lc1UVf-VE','https://youtube.com/watch?v=bad','https://youtu.be/M7lc1UVf-VE?t=no'])assert.throws(()=>f.c.youtube_(url));
 bad(f.call('saveCard',t,{...sample(f.c),videoUrl:'https://evil.test'},'submit'),'VIDEO');
 bad(f.call('saveCard',t,{...sample(f.c),tags:['a','b','c','d']},'submit'),'VALIDATION');
 for(const title of ['=IMPORTXML("url")',"'=leading",'\u200Bhello','<img src=x onerror=alert(1)>','@title','-title']){const c=good(f.call('saveCard',t,{...sample(f.c),title,status:'published',teacherFeedback:'injected'},'draft'));assert.equal(c.title,title);assert.equal(c.status,'draft');assert.equal(c.teacherFeedback,'');}
 const physical=f.sheets.get('Cards').data[1][2];assert.equal(physical.startsWith('='),false);
});
test('비활성 팀은 로그인·세션·공개 열람에서 제외되고 샘플 제거는 학생 카드를 보존한다',()=>{
 const f=fixture(),t=f.login('team','team1','team-one-test'),a=f.login('admin',null,'teacher-test-19');const own=good(f.call('saveCard',t,sample(f.c),'draft'));
 f.c.seedDemoData_();assert.equal(good(f.call('getGallery')).cards.length,4);assert.throws(()=>f.c.seedDemoData_());
 good(f.call('saveTeam',a,{teamId:'team1',teamName:'말의 온도',sortOrder:1,active:false,editCode:''}));bad(f.call('getWorkspace',t),'AUTH');bad(f.call('login','team','team1','team-one-test'),'TEAM');assert.equal(good(f.call('getGallery')).cards.length,2);
 f.c.removeDemoData_();const remaining=good(f.call('getWorkspace',a)).cards;assert.equal(remaining.length,1);assert.equal(remaining[0].cardId,own.cardId);
});
test('잘못된 시트 연결 및 헤더를 한국어 오류로 반환한다',()=>{
 const f=fixture();f.properties.setProperty('SPREADSHEET_ID','invalid');bad(f.call('getGallery'),'SHEETS');f.properties.setProperty('SPREADSHEET_ID','sheet-test');f.sheets.get('Cards').data[0][0]='wrong';bad(f.call('getGallery'),'SCHEMA');
});
test('운영 템플릿은 샘플 해설·미리보기 어댑터를 포함하지 않으며 JS 문법이 유효하다',()=>{
 const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');assert.equal(index.includes('Samples'),false);assert.equal(index.includes('KSC_PREVIEW'),false);
 const script=fs.readFileSync(path.join(root,'Scripts.html'),'utf8').replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,'');new vm.Script(script);
});

test('설치 실행 함수는 실제 실행 계정이 없는 웹 호출과 다른 사용자를 차단한다',()=>{
 const f=fixture();
 for(const email of ['', 'student@example.test']) {
  f.c.activeEmail=email;
  for(const name of ['setupEnvironment','addSampleCards','removeSampleCards','recoverAdminCode'])assert.throws(()=>f.c[name](),/교수자 계정/);
 }
 assert.equal(f.c.rows_('Cards').length,0);
 f.c.activeEmail='teacher@example.test';f.c.addSampleCards();assert.equal(f.c.rows_('Cards').length,4);f.c.removeSampleCards();assert.equal(f.c.rows_('Cards').length,0);
 f.properties.setProperty('ADMIN_SETUP_CODE','recover-admin26');f.c.recoverAdminCode();f.login('admin',null,'recover-admin26');
});

test('관리자와 팀의 신규·변경 코드는 5~15자 경계를 적용한다',()=>{
 const f=fixture(),a=f.login('admin',null,'teacher-test-19');
 for(const value of ['1234','1234567890123456','     ']) {
  bad(f.call('changeAdminCode',a,value),'CODE');
  bad(f.call('saveTeam',a,{teamId:'team1',teamName:'말의 온도',sortOrder:1,active:true,editCode:value}),'CODE');
 }
 good(f.call('saveTeam',a,{teamId:'team1',teamName:'말의 온도',sortOrder:1,active:true,editCode:'team1'}));f.login('team','team1','team1');
 good(f.call('saveTeam',a,{teamId:'team2',teamName:'장면 수집가',sortOrder:2,active:true,editCode:'123456789012345'}));f.login('team','team2','123456789012345');
 good(f.call('changeAdminCode',a,'admin'));const b=f.login('admin',null,'admin');good(f.call('changeAdminCode',b,'abcdefghijklmno'));f.login('admin',null,'abcdefghijklmno');
 f.c.validateCode_('abcde');f.c.validateCode_('abcdefghijklmno');
 const html=fs.readFileSync(path.join(root,'Scripts.html'),'utf8');assert.ok(html.includes('code.maxLength=15;code.minLength=5;'));assert.ok(html.includes("adminForm.querySelector('input').maxLength=15;adminForm.querySelector('input').minLength=5;"));
});

test('다른 팀의 코멘트 변경 차단과 이전 제출 상태의 직접 공개 호환',()=>{
 const f=fixture(),one=f.login('team','team1','team-one-test'),two=f.login('team','team2','team-two-test'),a=f.login('admin',null,'teacher-test-19');
 let c=good(f.call('saveCard',one,sample(f.c),'submit'));assert.equal(c.status,'published');
 bad(f.call('reviewCard',two,c.cardId,c.version,'comment','변조'),'FORBIDDEN');bad(f.call('reviewCard',one,c.cardId,c.version,'comment','변조'),'FORBIDDEN');
 const stale={...c};c=good(f.call('reviewCard',a,c.cardId,c.version,'comment','팀 전용'));bad(f.call('saveCard',one,stale,'publish'),'CONFLICT');
 for(const status of ['submitted','revision']) {
  const stored=f.c.card_(c.cardId);stored.status=status;f.c.writeRow_('Cards',stored);
  c=good(f.call('saveCard',one,{...c,title:'이전 상태에서 직접 공개'},'publish'));assert.equal(c.status,'published');assert.equal(c.teacherFeedback,'팀 전용');
 }
});
