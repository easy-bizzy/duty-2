const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const storage=fs.readFileSync(__dirname+'/../safe-storage.js','utf8');
const app=fs.readFileSync(__dirname+'/../script.js','utf8').split('(function init()')[0];
function setup(raw){
 const data=new Map(raw===null?[]:[['dutyApp',raw]]);let deny=false;
 const context=vm.createContext({localStorage:{get length(){return data.size;},key:i=>Array.from(data.keys())[i],getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>{if(deny) throw Error('quota');data.set(k,v);},removeItem:k=>data.delete(k)},window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return {}; }},setInterval(){},setTimeout(){},clearTimeout(){}});
 vm.runInContext(storage,context);
 return {data,context,run:s=>vm.runInContext(s,context),deny:()=>{deny=true;}};
}
const original=JSON.stringify({people:[{id:1,name:'Торопов',onlyLoading:false}],journal:[{date:'2026-11-18',who:['Торопов'],location:'Пятая'}],loadingJournal:[{date:'2026-11-18',who:['Репин'],group:1}],counts:{Торопов:8},loadCounts:{Репин:12},pin:'6789',vacations:{Репин:[{from:'2026-11-01',to:'2026-11-10'}]},custom:{preserve:true}});
test('legacy startup preserves journals, settings, counters and exact original backup',()=>{
 const t=setup(original);vm.runInContext(app,t.context);t.run('saveState()');
 const next=JSON.parse(t.data.get('dutyApp')),old=JSON.parse(original);
 for(const key of ['journal','loadingJournal','counts','loadCounts','pin','vacations','custom']) assert.deepEqual(next[key],old[key]);
 assert.equal(t.data.get('dutyApp:backup:before-20-ORACLE'),original);
 t.run("DutyStorage.backup('before-update')");const snapshot=t.data.get('dutyApp');
 const again=setup(snapshot);vm.runInContext(app,again.context);again.run('saveState()');assert.equal(again.data.get('dutyApp'),snapshot);
});
test('corrupt JSON is retained, never overwritten by fresh state',()=>{const t=setup('{broken');assert.throws(()=>vm.runInContext(app,t.context));assert.equal(t.data.get('dutyApp'),'{broken');assert.equal(t.data.get('dutyApp:backup:before-20-ORACLE'),'{broken');});
test('restoring a copy preserves current bytes and leaves source copy intact',()=>{
 const t=setup(original);t.run('DutyStorage.read()');t.run("DutyStorage.backup('before-update')");
 const source=t.run('DutyStorage.copies().find(k=>k.includes("before-update"))');
 t.run('DutyStorage.write({...JSON.parse(DutyStorage.read()),pin:"1111"})');
 t.context.location={reload(){}};
 t.run(`DutyStorage.restore(${JSON.stringify(source)})`);
 t.run('DutyStorage.write({people:[],journal:[]})'); // simulates the old tab saving on beforeunload
 assert.equal(t.data.get('dutyApp'),original);
 assert.equal(t.data.get(source),original);
 assert.ok(Array.from(t.data).some(([k,v])=>k.includes('before-restore-') && JSON.parse(v).pin==='1111'));
});
test('quota error blocks change without losing current data',()=>{const t=setup(original);t.run('DutyStorage.read()');t.deny();assert.throws(()=>t.run("DutyStorage.write({...JSON.parse(DutyStorage.read()),pin:'9999'})"));assert.equal(t.data.get('dutyApp'),original);});
test('stale tab cannot overwrite newer history',()=>{const t=setup(original);t.run('DutyStorage.read()');t.data.set('dutyApp',original+' ');assert.throws(()=>t.run('DutyStorage.write({people:[],journal:[]})'));assert.equal(t.data.get('dutyApp'),original+' ');});
test('invalid import rejected before changing storage',()=>{const t=setup(original);t.run('DutyStorage.read()');assert.throws(()=>t.run('DutyStorage.validate({people:[],journal:{}})'));assert.equal(t.data.get('dutyApp'),original);});
