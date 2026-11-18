(() => {
  const indicator=document.getElementById('networkStatus');
  function update(){indicator.textContent=navigator.onLine?'Онлайн':'Офлайн';indicator.classList.toggle('offline',!navigator.onLine);indicator.title='Состояние подключения устройства. История хранится на этом устройстве.';}
  window.addEventListener('online',update);window.addEventListener('offline',update);update();
})();
