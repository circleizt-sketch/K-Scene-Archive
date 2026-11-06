import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function fixture(){
 let now=Date.now();const store=new Map(),sheets=new Map();let locked=false;
 class Sheet{
  constructor(){this.data=[];}
  getLastRow(){return this.data.length;}
  setFrozenRows(){}
  deleteRow(row){this.data.splice(row-1,1);}
  getRange(row,col,n,m){return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>this.data[row+i-1]?.[col+j-1]??'')),setValues:values=>{for(let i=0;i<n;i++){this.data[row+i-1]??=[];for(let j=0;j<m;j++)this.data[row+i-1][col+j-1]=values[i][j];}}};}
 }
 const properties={getProperty:k=>store.get(k)??null,setProperty:(k,v)=>store.set(k,String(v)),deleteProperty:k=>store.delete(k),getProperties:()=>Object.fromEntries(store),setProperties:obj=>Object.entries(obj).forEach(([k,v])=>store.set(k,String(v)))};
 const db={getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{const s=new Sheet();sheets.set(name,s);return s;}};
 const context=vm.createContext({console,Session:{getActiveUser:()=>({getEmail:()=>context.activeEmail}),getEffectiveUser:()=>({getEmail:()=>context.effectiveEmail})},PropertiesService:{getScriptProperties:()=>properties},SpreadsheetApp:{openById:id=>{if(id!=='sheet-test')throw new Error('not found');return db;},flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()]}});
 vm.runInContext('class Clock extends Date { static now(){ return globalThis.testNow; } }; globalThis.Date=Clock;',context);context.testNow=now;context.activeEmail='teacher@example.test';context.effectiveEmail='teacher@example.test';
 for(const f of ['Sheets.gs','Auth.gs','Code.gs','Setup.gs','Samples.gs'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});
 properties.setProperties({SPREADSHEET_ID:'sheet-test',ADMIN_SETUP_CODE:'teacher-test-19',TEAM_SETUP_JSON:JSON.stringify([{teamId:'team1',teamName:'말의 온도',editCode:'team-one-test'},{teamId:'team2',teamName:'장면 수집가',editCode:'team-two-test'}])});context.setupEnvironment();
 const call=(name,...args)=>JSON.parse(JSON.stringify(context[name](...args)));
 const login=(kind,id,code)=>{const r=call('login',kind,id,code);assert.equal(r.ok,true,JSON.stringify(r));return r.data.token;};
 return {c:context,call,store,sheets,properties,login,advance:ms=>context.testNow+=ms};
}
