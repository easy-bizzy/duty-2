const LOCATIONS = [
  { id: 1, name: 'Автозавод' },
  { id: 2, name: 'Холодильник' },
  { id: 3, name: 'Пятая' },
  { id: 4, name: 'Дополнительно' }
];
// Порядок по номерам: 1-Торопов, 2-Печерских, 3-Репин, 4-Осинкин, 5-Сабуров, 6-Сурнин
const DEFAULT_PEOPLE = ['Торопов', 'Печерских', 'Репин', 'Осинкин', 'Сабуров', 'Сурнин'];
const WINDOW_DAYS = 30;
const K_LOCATION = 3;
const K_LOADING = 5;
const CATCHUP_RATE = 0.7;
const CATCHUP_MIN_COEF = 0.5;
const FRESH_PENALTY = 200;
const DEVIATION_SCALE = 200;
const DEFAULT_PIN = '1234';
const PIN_SESSION_MIN = 5;
const ACTION_LOG_LIMIT = 500;

let state = loadState();
let currentTab = 'plan';
let pinSession = false;
let pinSessionTimer = null;
let pinAttempts = 0;
let pinBlockedUntil = 0;
let pinCallback = null;

// ============= ХРАНИЛИЩЕ =============
function loadState() {
  try {
    const raw = localStorage.getItem('dutyApp');
    if (raw) {
      const p = JSON.parse(raw);
      ['locCounts','loadCounts','vacations','dayOffs','catchUp','counts'].forEach(k => {
        if (!p[k]) p[k] = {};
      });
      if (!p.loadingJournal) p.loadingJournal = [];
      if (!p.journal) p.journal = [];
      if (!p.manualLoc) p.manualLoc = [];
      if (!p.manualLoad) p.manualLoad = [];
      if (!p.actionLog) p.actionLog = [];
      if (!p.pin) p.pin = DEFAULT_PIN;
      if (!p.wantLoadingToday) p.wantLoadingToday = {};
      if (!p.onlyLoadToday) p.onlyLoadToday = {};

      // МИГРАЦИЯ: пересортировать людей по новому порядку
      if (!p.people) {
        p.people = DEFAULT_PEOPLE.map((name, i) => ({ id: i+1, name, noLoading: false, onlyLoading: false }));
      } else {
        const sorted = [];
        for (let i = 0; i < DEFAULT_PEOPLE.length; i++) {
          const name = DEFAULT_PEOPLE[i];
          const existing = p.people.find(x => x.name === name);
          if (existing) {
            existing.id = i + 1;
            if (existing.noLoading === undefined) existing.noLoading = false;
            if (existing.onlyLoading === undefined) existing.onlyLoading = false;
            sorted.push(existing);
          } else {
            sorted.push({ id: i + 1, name, noLoading: false, onlyLoading: false });
          }
        }
        p.people = sorted;
      }
      return p;
    }
  } catch(e) {}
  return {
    people: DEFAULT_PEOPLE.map((name, i) => ({ id: i+1, name, noLoading: false, onlyLoading: false })),
    journal: [], loadingJournal: [],
    counts: {}, locCounts: {}, loadCounts: {},
    vacations: {}, dayOffs: {},
    catchUp: {},
    manualLoc: [], manualLoad: [],
    wantLoadingToday: {},
    onlyLoadToday: {},
    actionLog: [],
    pin: DEFAULT_PIN,
    lastCatchUpUpdate: ''
  };
}
function saveState() {
  try { localStorage.setItem('dutyApp', JSON.stringify(state)); } catch(e) {}
}

window.addEventListener('beforeunload', saveState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveState();
    if (pinSession) resetPinSession();
  }
});
setInterval(saveState, 15000);

// ============= ЛОГИРОВАНИЕ =============
function logAction(type, details) {
  if (!state.actionLog) state.actionLog = [];
  state.actionLog.unshift({ ts: new Date().toISOString(), type, details });
  if (state.actionLog.length > ACTION_LOG_LIMIT) {
    state.actionLog = state.actionLog.slice(0, ACTION_LOG_LIMIT);
  }
  saveState();
}

// ============= PIN =============
function askPin(title, callback) {
  const now = Date.now();
  if (now < pinBlockedUntil) {
    const sec = Math.ceil((pinBlockedUntil - now) / 1000);
    alert(`⛔ Подождите ${sec} сек.`);
    return;
  }
  pinCallback = callback;
  document.getElementById('pinTitle').textContent = title || '🔐 Введите PIN';
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').style.display = 'none';
  document.getElementById('pinModal').style.display = 'flex';
  setTimeout(() => document.getElementById('pinInput').focus(), 100);
}
function submitPin() {
  const now = Date.now();
  if (now < pinBlockedUntil) {
    const sec = Math.ceil((pinBlockedUntil - now) / 1000);
    document.getElementById('pinError').textContent = `Подождите ${sec} сек.`;
    document.getElementById('pinError').style.display = 'block';
    return;
  }
  const val = document.getElementById('pinInput').value;
  if (val === (state.pin || DEFAULT_PIN)) {
    pinAttempts = 0;
    document.getElementById('pinModal').style.display = 'none';
    if (pinCallback) { const fn = pinCallback; pinCallback = null; fn(); }
  } else {
    pinAttempts++;
    if (pinAttempts >= 3) {
      pinBlockedUntil = now + 60000;
      pinAttempts = 0;
      document.getElementById('pinError').textContent = '⛔ Блокировка на 1 минуту';
    } else {
      document.getElementById('pinError').textContent = `❌ Неверный PIN. Осталось: ${3 - pinAttempts}`;
    }
    document.getElementById('pinError').style.display = 'block';
    document.getElementById('pinInput').value = '';
  }
}
function closePin() {
  document.getElementById('pinModal').style.display = 'none';
  pinCallback = null;
  pinAttempts = 0;
}
function extendPinSession() {
  if (pinSessionTimer) clearTimeout(pinSessionTimer);
  pinSessionTimer = setTimeout(() => {
    pinSession = false;
    if (currentTab === 'settings' || currentTab === 'actionlog') {
      switchTab('plan', document.querySelectorAll('nav button')[0]);
    }
  }, PIN_SESSION_MIN * 60 * 1000);
}
function resetPinSession() {
  pinSession = false;
  if (pinSessionTimer) clearTimeout(pinSessionTimer);
  pinSessionTimer = null;
}

// ============= ВКЛАДКИ =============
function switchTab(name, btn) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  const isModal = (name === 'person' || name === 'settings' || name === 'actionlog');
  document.getElementById('mainNav').style.display = isModal ? 'none' : 'flex';
  document.getElementById('backBtn').style.display = isModal ? 'block' : 'none';
  document.getElementById('settingsBtn').style.display = isModal ? 'none' : 'block';
  document.getElementById('headerTitle').textContent =
    name === 'person' ? '👤 Карточка' :
    name === 'settings' ? '⚙️ Настройки' :
    name === 'actionlog' ? '🔒 Журнал действий' : '📋 Дежурства';
  if (name === 'journal') renderJournal();
  if (name === 'stats') renderStats();
  if (name === 'people') renderPeople();
  if (name === 'plan') renderPlanTab();
  if (name === 'settings') renderSettings();
  if (name === 'actionlog') renderActionLog();
}
function goBack() {
  if (currentTab === 'person') switchTab('stats', document.querySelectorAll('nav button')[2]);
  else if (currentTab === 'actionlog') switchTab('settings', null);
  else if (currentTab === 'settings') { resetPinSession(); switchTab('plan', document.querySelectorAll('nav button')[0]); }
}
function openSettings() {
  if (pinSession) { switchTab('settings', null); extendPinSession(); return; }
  askPin('🔐 Введите PIN для входа в настройки', () => {
    pinSession = true;
    switchTab('settings', null);
    extendPinSession();
  });
}

// ============= ПРОВЕРКИ =============
function isOnVacation(name, dateStr) {
  const vacs = state.vacations[name] || [];
  for (const v of vacs) if (dateStr >= v.from && dateStr <= v.to) return v;
  return null;
}
function dayOffType(name, dateStr) {
  const d = state.dayOffs[dateStr];
  if (!d) return null;
  if ((d.full || []).includes(name)) return 'full';
  if ((d.noLoc || []).includes(name)) return 'noLoc';
  if ((d.noLoad || []).includes(name)) return 'noLoad';
  return null;
}
function isNoLoadPermanent(name) {
  const p = state.people.find(x => x.name === name);
  return p ? p.noLoading : false;
}
function isOnlyLoadingPermanent(name) {
  const p = state.people.find(x => x.name === name);
  return p ? p.onlyLoading : false;
}
function isOnlyLoadToday(name, dateStr) {
  return (state.onlyLoadToday[dateStr] || []).includes(name);
}
function wantsLoading(name, dateStr) {
  return (state.wantLoadingToday[dateStr] || []).includes(name);
}
function canGoToLocation(name, dateStr) {
  if (isOnVacation(name, dateStr)) return false;
  const t = dayOffType(name, dateStr);
  if (t === 'full' || t === 'noLoc') return false;
  if (isOnlyLoadingPermanent(name)) return false;
  if (isOnlyLoadToday(name, dateStr)) return false;
  return true;
}
function canGoToLoading(name, dateStr) {
  if (isOnVacation(name, dateStr)) return false;
  const t = dayOffType(name, dateStr);
  if (t === 'full' || t === 'noLoad') return false;
  if (isNoLoadPermanent(name)) return false;
  return true;
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function formatDateTime(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi}`;
}
function getPersonNumber(name) {
  const p = state.people.find(x => x.name === name);
  return p ? p.id : 0;
}

// ============= ДОГОНЯНИЕ =============
function applyDailyCatchUp() {
  const today = todayIso();
  if (state.lastCatchUpUpdate === today) return;
  state.lastCatchUpUpdate = today;
  for (const name in state.catchUp) {
    const c = state.catchUp[name];
    c.coef = Math.min(1.0, c.coef + c.step);
    c.daysLeft -= 1;
    if (c.daysLeft <= 0 || c.coef >= 1.0) delete state.catchUp[name];
  }
  saveState();
}
function registerVacationEnd(name, daysAbsent) {
  const catchUpDays = Math.max(1, Math.round(daysAbsent * CATCHUP_RATE));
  const step = (1.0 - CATCHUP_MIN_COEF) / catchUpDays;
  state.catchUp[name] = { coef: CATCHUP_MIN_COEF, daysLeft: catchUpDays, step, daysAbsent };
}
function getCatchUpCoef(name) {
  const c = state.catchUp[name];
  return c ? c.coef : 1.0;
}

// ============= РАБОЧИЕ ДНИ И НОРМА =============
function getWorkDays(name) {
  let count = 0;
  const today = new Date();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (!isOnVacation(name, iso)) count++;
  }
  return count;
}
function getNormLocation(name) { return getWorkDays(name) / K_LOCATION; }
function getNormLoading(name) { return getWorkDays(name) / K_LOADING; }
function getDeviationLocation(name) {
  return (state.counts[name] || 0) - getNormLocation(name);
}
function getDeviationLoading(name) {
  return (state.loadCounts[name] || 0) - getNormLoading(name);
}

// ============= СВЕЖЕСТЬ =============
function wasOnLocationPrevDay(name, dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - 1);
  for (let i = 0; i < 7; i++) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getDay(); const isWeekend = (dow === 0 || dow === 6);
    if (state.journal.some(j => j.date === iso && j.who.includes(name))) return true;
    if (!isWeekend) return false;
    d.setDate(d.getDate() - 1);
  }
  return false;
}
function wasOnLoadingPrevDay(name, dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - 1);
  for (let i = 0; i < 7; i++) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getDay(); const isWeekend = (dow === 0 || dow === 6);
    if (state.loadingJournal.some(j => j.date === iso && j.who.includes(name))) return true;
    if (!isWeekend) return false;
    d.setDate(d.getDate() - 1);
  }
  return false;
}

// ============= ВЫХОД ИЗ ОТПУСКА =============
function checkVacationReturn(name, dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - 1
