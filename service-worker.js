const CACHE_NAME='duty-v20-oracle';
const FILES=['./','./index.html','./style.css','./script.js','./manifest.json','./safe-storage.js','./updates.js','./branding.js'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'})))));
  // No skipWaiting: installation must not interrupt the running application.
});
self.addEventListener('message',event=>{
  if(!event.data || event.data.type!=='APPLY_UPDATE') return;
  event.waitUntil((async()=>{
    const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(tabs.filter(tab=>tab.url.startsWith(self.registration.scope)).length>1){event.ports[0]?.postMessage('BUSY');return;}
    event.ports[0]?.postMessage('OK'); await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  // Retain old caches so other installed applications and old clients are safe.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME), hit=await cache.match(event.request);
    if(hit) return hit;
    try{return await fetch(event.request);}
    catch(error){return event.request.mode==='navigate' ? (await cache.match('./index.html')) || Response.error() : Response.error();}
  })());
});
