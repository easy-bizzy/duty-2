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
test('three daily slots keep the returnee out of consecutive days and report unattainable 30-day equality',()=>{
 const run=setup();
 const result=run('(()=>{state.vacations.Печерских=[{from:"2026-01-01",to:"2026-01-10",type:"отпуск"}];for(let n=0;n<40;n++){document.getElementById("planDate").value=dateOffset("2026-01-01",n);document.getElementById("loc1").value="3";distribute()}return {counts:state.counts,trips:state.journal.filter(j=>j.who.includes("Печерских")).map(j=>j.date).sort(),message:document.getElementById("planResult").innerHTML}})()');
 assert.ok(result.trips.every((date,i)=>i===0 || Date.parse(date)-Date.parse(result.trips[i-1])>=2*86400000));
 assert.ok(result.counts.Печерских<result.counts.Торопов);
 assert.match(result.message,/правиле очереди догнать коллег/);
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
 assert.ok(result.gap>0);assert.match(result.message,/правиле очереди догнать коллег/);
});
test('catch-up extra priority is capped at 150 percent of peer trip rate',()=>{
 const run=setup();
 const result=run('(()=>{state.catchUp.Репин={start:"2026-11-01",deadline:"2026-11-30",initialGap:6};state.journal=[{date:"2026-11-01",who:["Репин","Торопов","Печерских","Осинкин","Сабуров","Сурнин"]},{date:"2026-11-03",who:["Репин","Торопов","Печерских","Осинкин","Сабуров","Сурнин"]},{date:"2026-11-05",who:["Репин"]}];return {allowThird:getCatchUpRateAllowance("Репин","2026-11-06"),urgency:getCatchUpUrgency("Репин","2026-11-06")}})()');
 assert.equal(result.allowThird,true);
 const blocked=run('(state.journal.unshift({date:"2026-11-06",who:["Репин"]}),getCatchUpRateAllowance("Репин","2026-11-07"))');
 assert.equal(blocked,false);
});
test('specific location counts do not break global queue ties, and saved total counts do',()=>{
 const run=setup();
 const result=run('(state.people.forEach(p=>state.counts[p.name]=2),state.locCounts.Торопов={Автозавод:100},document.getElementById("loc1").value="1",distribute(),{who:state.journal[0].who,reasons:state.journal[0].reasons})');
 assert.deepEqual(result.who,['Торопов']);assert.match(result.reasons[0],/очередь 1\/6/);
 assert.match(run('(renderJournal(),document.getElementById("journalList").innerHTML)'),/Почему этот состав/);
 const next=setup();
 const name=next('(state.counts.Торопов=10,document.getElementById("loc1").value="1",distribute(),state.journal[0].who[0])');
 assert.equal(name,'Печерских');
});
test('late distribution detects a return and replaces an expired earlier plan',()=>{
 const run=setup();const plan=run('(state.people.forEach(p=>state.counts[p.name]=10),state.counts.Репин=0,state.vacations.Репин=[{from:"2026-11-18",to:"2026-11-18"}],state.catchUp.Репин={start:"2026-09-01",deadline:"2026-09-30",initialGap:5},checkVacationReturn("Репин","2026-11-22"),state.catchUp.Репин)');
 assert.equal(plan.start,'2026-11-19');assert.equal(plan.deadline,'2026-12-18');assert.equal(plan.daysAbsent,1);
 const again=run('(delete state.catchUp.Репин,checkVacationReturn("Репин","2026-11-23"),state.catchUp)');assert.deepEqual(again,{});
});
test('one-day vacation registers on the next calendar day',()=>{const run=setup();assert.equal(run('(state.counts.Торопов=10,state.vacations.Репин=[{from:"2026-11-18",to:"2026-11-18"}],checkVacationReturn("Репин","2026-11-19"),state.catchUp.Репин.start)'),'2026-11-19');});
test('old vacation does not start a new thirty-day period',()=>{const run=setup();assert.deepEqual(run('(state.counts.Торопов=10,state.vacations.Репин=[{from:"2026-09-01",to:"2026-09-18"}],checkVacationReturn("Репин","2026-11-19"),state.catchUp)'),{});});
test('catch-up grants no priority outside its calendar period',()=>{
 const run=setup();const result=run('(state.counts.Торопов=50,state.catchUp.Репин={start:"2026-11-19",deadline:"2026-12-18",initialGap:10},["2026-10-20","2026-12-19"].map(date=>({allow:getCatchUpRateAllowance("Репин",date),urgency:getCatchUpUrgency("Репин",date)})))');
 assert.deepEqual(result,[{allow:false,urgency:0},{allow:false,urgency:0}]);
});
test('editing vacation end recalculates the plan in both directions',()=>{
 const run=setup();run('(state.counts.Торопов=50,state.vacations.Репин=[{from:"2026-11-01",to:"2026-11-18"}],checkVacationReturn("Репин","2026-11-19"),true)');
 const earlier=run('(updateVac("Репин",0,"to","2026-11-15"),checkVacationReturn("Репин","2026-11-16"),state.catchUp.Репин)');
 assert.equal(earlier.start,'2026-11-16');assert.equal(earlier.deadline,'2026-12-15');
 const later=run('(updateVac("Репин",0,"to","2026-11-25"),checkVacationReturn("Репин","2026-11-19"),state.catchUp)');assert.deepEqual(later,{});
 assert.equal(run('(checkVacationReturn("Репин","2026-11-26"),state.catchUp.Репин.start)'),'2026-11-26');
});
test('editing an unrelated future vacation leaves the current plan intact',()=>{
 const run=setup();assert.equal(run('(state.counts.Торопов=50,state.vacations.Репин=[{from:"2026-11-01",to:"2026-11-18"},{from:"2027-01-01",to:"2027-01-10"}],checkVacationReturn("Репин","2026-11-19"),updateVac("Репин",1,"to","2027-01-12"),state.catchUp.Репин.start)'),'2026-11-19');
});
