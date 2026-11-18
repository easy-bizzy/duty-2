async function setupDutyUpdates() {
  const status=document.createElement('div');
  status.style.cssText='padding:12px;background:#e8f0fe;color:#174ea6';
  document.querySelector('header').after(status);
  status.textContent='Версия '+DutyStorage.VERSION;
  let registration, installing=false, downloadedRaw=null;
  function offer() {
    if(!registration.waiting || installing) return;
    status.replaceChildren();
    const label=document.createElement('p'); label.textContent='Обновление скачано. История останется на телефоне. Сначала сохраните резервный файл.';
    const download=document.createElement('button'); download.textContent='1. Скачать резервную копию';
    const apply=document.createElement('button'); apply.textContent='2. Копия сохранена — установить'; apply.disabled=true;
    download.onclick=()=>{
      try {
        if(!saveState()) return;
        const raw=DutyStorage.backup('before-update');
        downloadedRaw=raw || JSON.stringify(state);
        DutyStorage.download(downloadedRaw,'duty-backup-before-update.json');
        apply.disabled=false;
      } catch(e) { DutyStorage.fail(e); }
    };
    apply.onclick=()=>{
      try {
        if(!saveState()) return;
        const currentRaw=DutyStorage.backup('before-update');
        if(currentRaw!==downloadedRaw) { apply.disabled=true; label.textContent='Данные изменились. Скачайте свежую резервную копию.'; return; }
        if(!registration.waiting) { label.textContent='Закройте программу и откройте снова, чтобы проверить версию.'; return; }
        installing=true; apply.disabled=true; download.disabled=true;
        label.textContent='Установка обновления…';
        const channel=new MessageChannel();
        channel.port1.onmessage=e=>{
          if(e.data!=='OK') { installing=false; apply.disabled=false; download.disabled=false; label.textContent='Закройте другие окна программы и повторите установку.'; }
          channel.port1.close();
        };
        registration.waiting.postMessage({type:'APPLY_UPDATE'},[channel.port2]);
      } catch(e) { installing=false; DutyStorage.fail(e); }
    };
    status.append(label,download,apply);
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(installing) location.reload();
    else status.textContent='Версия обновилась. Закройте программу и откройте снова.';
  });
  try {
    registration=await navigator.serviceWorker.register('service-worker.js',{updateViaCache:'none'});
    const watch=worker=>{if(worker) worker.addEventListener('statechange',()=>{if(worker.state==='installed') offer();});};
    offer(); watch(registration.installing);
    registration.addEventListener('updatefound',()=>watch(registration.installing));
    const check=()=>{if(navigator.onLine) registration.update().catch(()=>{});};
    window.addEventListener('online',check);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') check();});
    check();
  } catch(e) {status.textContent='Версия '+DutyStorage.VERSION+'. Проверить обновления сейчас не удалось.';}
}
