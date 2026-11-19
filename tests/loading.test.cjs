const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../script.js','utf8').split('(function init()')[0];
function setup(){const els={};const c=vm.createContext({DutyStorage:{read:()=>null,write(){}},window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>els[id]||(els[id]={value:'0'})},setInterval(){},setTimeout(){},clearTimeout(){}});vm.runInContext(source,c);vm.runInContext("renderPlanTab=()=>{};document.getElementById('planDate').value='2026-11-18';",c);return s=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',c));}
test('correct teams alternate',()=>{const run=setup();assert.deepEqual(run('distributeLoadingByRotation("2026-11-18",3).selected'),['Печерских','Репин','Осинкин']);assert.deepEqual(run('(state.loadingJournal=[{date:"2026-11-18",group:1}],distributeLoadingByRotation("2026-11-19",3).selected)'),['Сурнин','Торопов','Сабуров']);});
test('mandatory person is included once and two other people fill three places',()=>{const run=setup();assert.deepEqual(run('(state.manualLoad=["Печерских"],document.getElementById("loadingCount").value="3",distribute(),state.loadingJournal[0].who)'),['Печерских','Репин','Осинкин']);});
test('absence gets replacement without changing historical entries',()=>{const run=setup();const result=run('(state.dayOffs={"2026-11-18":{full:["Репин"]}},distributeLoadingByRotation("2026-11-18",3).selected)');assert.equal(result.length,3);assert.ok(!result.includes('Репин'));});
test('manual-only loading records a team for next day rotation',()=>{const run=setup();assert.equal(run('(state.manualLoad=["Печерских","Репин","Осинкин"],distribute(),getTodayLoadingGroup("2026-11-19"))'),2);});
test('unavailable manual person stops distribution and preserves pending assignment',()=>{
 const run=setup();
 const result=run('(state.manualLoad=["Репин"],state.dayOffs={"2026-11-18":{full:["Репин"]}},document.getElementById("loadingCount").value="3",distribute(),{pending:state.manualLoad,journal:state.loadingJournal,result:document.getElementById("planResult").textContent})');
 assert.deepEqual(result.pending,['Репин']);assert.deepEqual(result.journal,[]);assert.match(result.result,/Репин/);
});
