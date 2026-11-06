/** 외부 라이브러리 없이 Apps Script 템플릿을 로컬 정적 미리보기로 조립합니다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'Samples.gs'),'utf8'),context);
const samples=context.sampleCards_();
const teams=[{teamId:'team1',teamName:'말의 온도',teamDescription:'관계 속 표현을 탐색해요',sortOrder:1,active:true},{teamId:'team2',teamName:'장면 수집가',teamDescription:'일상 속 의미를 모아요',sortOrder:2,active:true}];
const preview=`<script>
// 로컬 전용 더미 API입니다. 운영 Index에서는 이 코드를 포함하지 않습니다.
window.KSC_PREVIEW={call:async function(name,...args){
const cards=${JSON.stringify(samples).replaceAll('<','\\u003c')};const teams=${JSON.stringify(teams)};
if(name==='getGallery')return {teams,cards:cards.map(c=>{const front={};['cardId','teamId','title','contentTitle','videoUrl','description','tags','quizQuestion','quizOptions','version','createdAt','updatedAt','publishedAt'].forEach(k=>front[k]=c[k]);return front;})};
if(name==='submitQuiz'){const c=cards.find(c=>c.cardId===args[0]);if(!c||!c.quizOptions.some(o=>o.id===args[1]))throw new Error('답안을 선택해 주세요.');return {correct:args[1]===c.correctChoiceId,chosenChoiceId:args[1],card:c};}
throw new Error('로컬 미리보기에서는 갤러리와 퀴즈만 사용할 수 있습니다. 저장·로그인은 Apps Script 배포 후 사용할 수 있습니다.');
}};
</script>`;
let html=fs.readFileSync(path.join(root,'Index.html'),'utf8').replace(/<\?!= include_\('([A-Za-z]+)'\); \?>/g,(_,name)=>(name==='Scripts'?preview:'')+fs.readFileSync(path.join(root,name+'.html'),'utf8'));
const output=path.join(root,'.preview');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index.html'),html);
if(process.argv.includes('--build')){console.log('미리보기 생성: .preview/index.html');}else{
 const port=Number(process.env.PORT||4173);
 http.createServer((req,res)=>{if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);}).listen(port,'127.0.0.1',()=>console.log('미리보기 서버 실행 완료 · port '+port));
}
