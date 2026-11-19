/* Keep original dutyApp data; never recover by silently creating an empty state. */
const DutyStorage = (() => {
  const KEY='dutyApp', VERSION='18-ORACLE';
  let expected, blocked=false, restoring=false;
  function validate(data) {
    if (!data || !Array.isArray(data.people) || !Array.isArray(data.journal)) throw Error('Неверный формат сохранения');
    for(const key of ['journal','loadingJournal']) if(data[key]!==undefined && (!Array.isArray(data[key]) || data[key].some(j=>!j || typeof j.date!=='string' || !Array.isArray(j.who)))) throw Error('Повреждён журнал '+key);
    if(data.people.some(p=>!p || typeof p.name!=='string')) throw Error('Повреждён список сотрудников');
    for(const key of ['counts','locCounts','loadCounts','vacations','dayOffs','catchUp','onlyLoadToday','rotation']) if(data[key]!==undefined && (!data[key] || typeof data[key]!=='object' || Array.isArray(data[key]))) throw Error('Повреждены настройки '+key);
    for(const key of ['manualLoc','manualLoad','actionLog']) if(data[key]!==undefined && !Array.isArray(data[key])) throw Error('Повреждены настройки '+key);
    return data;
  }
  function rawBackup(raw,name) {
    if(raw===null) return;
    const key=KEY+':backup:'+name;
    localStorage.setItem(key,raw);
    if(localStorage.getItem(key)!==raw) throw Error('Не удалось проверить резервную копию');
  }
  function read() {
    expected=localStorage.getItem(KEY);
    if(expected!==null) {
      if(localStorage.getItem(KEY+':backup:before-'+VERSION)===null) rawBackup(expected,'before-'+VERSION);
      validate(JSON.parse(expected));
    }
    return expected;
  }
  function check() {
    if(blocked) throw Error('Сохранение остановлено для защиты истории');
    if(localStorage.getItem(KEY)!==expected) throw Error('Данные изменены в другом окне. Закройте это окно и откройте программу снова');
  }
  function write(data) {
    if(restoring) return; // beforeunload must not write the old in-memory state over a restored copy.
    check(); validate(data);
    const next=JSON.stringify(data);
    if(next===expected) return;
    rawBackup(expected,'previous');
    localStorage.setItem(KEY,next);
    if(localStorage.getItem(KEY)!==next) throw Error('Не удалось проверить сохранение');
    expected=next;
  }
  let backupSequence=0;
  function backup(name) {
    check();
    rawBackup(expected,name+'-'+Date.now()+'-'+(++backupSequence));
    return expected;
  }
  function copies() {
    const list=[];
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(key && key.startsWith(KEY+':backup:')) list.push(key);
    }
    return list.sort().reverse();
  }
  function restore(key) {
    if(!copies().includes(key)) throw Error('Копия не найдена');
    const raw=localStorage.getItem(key);
    validate(JSON.parse(raw));
    const current=localStorage.getItem(KEY);
    // Keep the exact current bytes before replacing them, including a damaged state.
    if(current!==null) rawBackup(current,'before-restore-'+Date.now());
    localStorage.setItem(KEY,raw);
    if(localStorage.getItem(KEY)!==raw) throw Error('Не удалось проверить восстановление');
    expected=raw; blocked=false; restoring=true;
    location.reload();
  }
  function remove() { check(); localStorage.removeItem(KEY); expected=null; }
  function download(raw,name) {
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function fail(error) {
    blocked=true;
    if(document.getElementById('storageFailure')) return;
    const box=document.createElement('div'); box.id='storageFailure';
    box.style.cssText='position:fixed;inset:0;z-index:10000;background:white;color:#900;padding:30px;overflow:auto';
    const label=document.createElement('p'); label.textContent='Сохранение остановлено. Не очищайте данные браузера. '+error.message;
    const button=document.createElement('button'); button.textContent='Скачать данные для восстановления';
    button.onclick=()=>{
      const copies={};
      for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k===KEY || k.startsWith(KEY+':backup:')) copies[k]=localStorage.getItem(k);}
      download(JSON.stringify(copies,null,2),'duty-recovery.json');
    };
    box.append(label,button); document.body.appendChild(box);
    const recover=document.createElement('button'); recover.textContent='Выбрать сохранённую копию';
    recover.onclick=()=>showCopies(box);
    box.append(recover);
  }
  function showCopies(container) {
    let list=container.querySelector('#storageCopies');
    if(list) list.remove();
    list=document.createElement('div'); list.id='storageCopies';
    const keys=copies();
    if(!keys.length) { list.textContent='Сохранённых копий нет'; container.append(list); return; }
    const title=document.createElement('p'); title.textContent='Выберите копию. Текущее состояние будет сохранено отдельно перед восстановлением.'; list.append(title);
    for(const key of keys) {
      const button=document.createElement('button');
      button.textContent=key.slice((KEY+':backup:').length);
      button.onclick=()=>{
        if(!confirm('Восстановить '+button.textContent+'? Сначала сохраните резервный файл, если он ещё не скачан.')) return;
        try { restore(key); } catch(error) { alert('Восстановление не выполнено: '+error.message); }
      };
      list.append(button);
    }
    container.append(list);
  }
  return {read,write,backup,remove,validate,fail,download,copies,restore,showCopies,VERSION};
})();
