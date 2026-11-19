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
test('thirty days of three daily slots close a ten-day vacation deficit with occasional consecutive trips',()=>{
 const run=setup();
 const result=run('(()=>{state.vacations.Печерских=[{from:"2026-01-01",to:"2026-01-10",type:"отпуск"}];for(let n=0;n<40;n++){document.getElementById("planDate").value=dateOffset("2026-01-01",n);document.getElementById("loc1").value="3";distribute()}return {counts:state.counts,catchUp:state.catchUp,trips:state.journal.filter(j=>j.who.includes("Печерских")).map(j=>j.date).sort()}})()');
 assert.equal(result.counts.Печерских,20);assert.ok(Object.values(result.counts).every(n=>n===20));
 assert.equal(result.catchUp.Печерских,undefined);
 assert.ok(result.trips.some((date,i)=>i>0 && Date.parse(date)-Date.parse(result.trips[i-1])===86400000));
 assert.ok(result.trips.length<30);
});
test('manual location works despite a no-location preference',()=>{
 const run=setup();
 const who=run('(state.dayOffs={"2026-11-19":{noLoc:["Репин"]}},state.manualLoc=[{name:"Репин",location:"Пятая"}],distribute(),state.journal[0].who)');
 assert.deepEqual(who,['Репин']);
});
test('one mandatory manual location worker fills one of three requested places',()=>{
 const run=setup();
 const result=run('(state.manualLoc=[{name:"Репин",location:"Автозавод"}],document.getElementById("loc1").value="3",distribute(),state.journal.filter(j=>j.date==="2026-11-19"&&j.location==="Автозавод"))');
 assert.equal(result.reduce((n,j)=>n+j.who.length,0),3);
 assert.equal(result.flatMap(j=>j.who).filter(n=>n==='Репин').length,1);
});
test('impossible thirty-day catch-up is shown instead of silently claiming equality',()=>{
 const run=setup();
 const result=run('(()=>{state.vacations.Печерских=[{from:"2026-01-01",to:"2026-01-10",type:"отпуск"}];for(let n=0;n<40;n++){document.getElementById("planDate").value=dateOffset("2026-01-01",n);document.getElementById("loc1").value="5";distribute()}return {gap:getPeerAverageTrips("Печерских")-state.counts.Печерских,message:document.getElementById("planResult").innerHTML}})()');
 assert.ok(result.gap>0);assert.match(result.message,/не хватило подходящих выездов/);
});
