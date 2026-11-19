const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../script.js','utf8').split('(function init()')[0];
function setup(){
  const els={};
  const context=vm.createContext({DutyStorage:{read:()=>null,write(){}},window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>els[id]||(els[id]={value:'0'})},setInterval(){},setTimeout(){},clearTimeout(){}});
  vm.runInContext(source,context);
  vm.runInContext("renderPlanTab=()=>{};document.getElementById('planDate').value='2026-11-19'",context);
  return code=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',context));
}
test('vacation returnee who went yesterday waits while another worker is available',()=>{
 const run=setup();
 const who=run('(state.counts.Печерских=1,state.counts.Репин=30,state.catchUp.Печерских={daysAbsent:20},state.journal=[{date:"2026-11-18",location:"Пятая",who:["Печерских"]}],document.getElementById("loc1").value="1",distribute(),state.journal[0].who)');
 assert.ok(!who.includes('Печерских'));
});
test('returnee gains a small place in the queue without consecutive-day trips',()=>{
 const run=setup();
 const scores=run('(state.counts.Печерских=1,state.counts.Репин=10,state.catchUp.Печерских={daysAbsent:5},state.journal=[{date:"2026-11-17",who:["Печерских"]},{date:"2026-11-16",who:["Репин"]}],{returnee:getLocationSortScore("Печерских","2026-11-19"),peer:getLocationSortScore("Репин","2026-11-19")})');
 assert.ok(scores.returnee<scores.peer);
});
test('when everyone went yesterday, distribution still assigns someone',()=>{
 const run=setup();
 const who=run('(state.journal=[{date:"2026-11-18",location:"Пятая",who:state.people.map(p=>p.name)}],document.getElementById("loc1").value="1",distribute(),state.journal[0].who)');
 assert.equal(who.length,1);
});
test('seven slots across two locations reuse one worker and record both trips',()=>{
 const run=setup();
 const entries=run('(document.getElementById("loc1").value="4",document.getElementById("loc2").value="3",distribute(),state.journal.filter(j=>j.date==="2026-11-19"))');
 assert.equal(entries.length,2);assert.equal(entries.reduce((n,j)=>n+j.who.length,0),7);
 assert.equal(new Set(entries.flatMap(j=>j.who)).size,6);
});
test('repeated same-day clicks and loading keep separate journal records',()=>{
 const run=setup();
 const result=run('(document.getElementById("loc1").value="2",document.getElementById("loadingCount").value="3",distribute(),document.getElementById("loc2").value="2",distribute(),{loc:state.journal.filter(j=>j.date==="2026-11-19"),loads:state.loadingJournal.filter(j=>j.date==="2026-11-19")})');
 assert.equal(result.loc.length,2);assert.equal(result.loads.length,1);
 assert.equal(result.loc[0].who.length,2);assert.equal(result.loc[1].who.length,2);
});
