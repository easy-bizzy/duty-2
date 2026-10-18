const LOCATIONS = [
  { id: 1, name: 'Автозавод' },
  { id: 2, name: 'Холодильник' },
  { id: 3, name: 'Пятая' },
  { id: 4, name: 'Дополнительно' }
];
const DEFAULT_PEOPLE = ['Торопов', 'Печерских', 'Репин', 'Осинкин', 'Сабуров', 'Сурнин'];
const WINDOW_DAYS = 30;
const CATCHUP_RATE = 1.5; 
const CATCHUP_MIN_COEF = 0.4; 
// Штраф за недавний выезд уменьшен до 150, чтобы люди не застревали внизу
const FRESH_PENALTY = 150; 
const DEVIATION_SCALE = 100;
const DEFAULT_PIN = '1234';
const PIN_SESSION_MIN = 5;
const ACTION_LOG_LIMIT = 500;

const LOADING_GROUPS = {
  1: ['Печерских', 'Репин', 'Сабуров'],
  2: ['Торопов', 'Сурнин', 'Осинкин']
};

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
      if (!p.onlyLoadToday) p.onlyLoadToday = {};
      if (!p.rotation) p.rotation = { counter1: 0, counter2: 0 };

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
  return createFreshState();
}

function createFreshState() {
  return {
    people: DEFAULT_PEOPLE.map((name, i) => ({ id: i+1, name, noLoading: false, onlyLoading: false })),
    journal: [], loadingJournal: [],
    counts: {}, locCounts: {}, loadCounts: {},
    vacations: {}, dayOffs: {},
    catchUp: {},
    manualLoc: [], manualLoad: [],
    onlyLoadToday: {},
    actionLog: [],
    rotation: { counter1: 0, counter2: 0 },
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

// ============= РАБОЧИЕ ДНИ =============
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

// ============= СРЕДНЕЕ ПО КОМАНДЕ =============
function getAverageLocationTrips() {
  const today = todayIso();
  const available = state.people.filter(p => !isOnVacation(p.name, today));
  if (available.length === 0) return 0;
  const total = available.reduce((sum, p) => sum + (state.counts[p.name] || 0), 0);
  return total / available.length;
}
function getDeviationLocation(name) {
  const avg = getAverageLocationTrips();
  return (state.counts[name] || 0) - avg;
}

// ============= СВЕЖЕСТЬ =============
function wasOnLocationPrevDay(name, dateStr) {
  const pastRecords = state.journal
    .filter(j => j.date < dateStr && j.who.includes(name))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (pastRecords.length === 0) return false;
  const lastDate = pastRecords[0].date;
  const d1 = new Date(lastDate + 'T00:00:00');
  const d2 = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return diffDays <= 2; // Штраф даем, только если ездил 1 или 2 дня назад
}

// ============= ВЫХОД ИЗ ОТПУСКА =============
function checkVacationReturn(name, dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  const wasOnVac = isOnVacation(name, yesterday);
  const isFree = !isOnVacation(name, dateStr);
  if (wasOnVac && isFree && !state.catchUp[name]) {
    const vacs = state.vacations[name] || [];
    const vac = vacs.find(v => yesterday >= v.from && yesterday <= v.to);
    if (vac) {
      const from = new Date(vac.from + 'T00:00:00');
      const to = new Date(vac.to + 'T00:00:00');
      const days = Math.round((to - from) / 86400000) + 1;
      registerVacationEnd(name, days);
      saveState();
    }
  }
}

// ============= БАЛЛЫ ПО ЛОКАЦИИ =============
function getLocationLocPoints(name, locName) {
  return (state.locCounts[name] && state.locCounts[name][locName]) || 0;
}

// ============= СОРТИРОВКА ЛОКАЦИЙ =============
function getLocationSortScore(name, dateStr) {
  const dev = getDeviationLocation(name);
  const fresh = wasOnLocationPrevDay(name, dateStr) ? FRESH_PENALTY : 0;
  // Бонус догоняния теперь -300. Он помогает, но не ломает очередь
  const catchUpBonus = state.catchUp[name] ? -300 : 0; 
  return dev * DEVIATION_SCALE + fresh + catchUpBonus;
}

// ============= ОТГРУЗКА: РОТАЦИЯ ПО ТРОЙКАМ =============
function getTodayLoadingGroup(dateStr) {
  const prev = state.loadingJournal.find(j => j.date < dateStr);
  if (!prev) return 1;
  return prev.group === 1 ? 2 : 1;
}

function distributeLoadingByRotation(dateStr, need) {
  const groupNum = getTodayLoadingGroup(dateStr);
  const thisGroup = LOADING_GROUPS[groupNum];
  const otherGroup = LOADING_GROUPS[groupNum === 1 ? 2 : 1];
  const counterKey = groupNum === 1 ? 'counter1' : 'counter2';

  const selected = [];
  const usedNames = new Set();

  for (const name of thisGroup) {
    if (selected.length >= need) break;
    if (canGoToLoading(name, dateStr)) {
      selected.push(name);
      usedNames.add(name);
    }
  }

  let safeGuard = 0;
  while (selected.length < need && safeGuard < 100) {
    safeGuard++;
    const idx = state.rotation[counterKey] % otherGroup.length;
    const candidate = otherGroup[idx];
    state.rotation[counterKey] = (state.rotation[counterKey] + 1) % otherGroup.length;

    if (canGoToLoading(candidate, dateStr) && !usedNames.has(candidate)) {
      selected.push(candidate);
      usedNames.add(candidate);
    }
  }
  return { selected, groupNum };
}

// ============= ПЛАН =============
function renderPlanTab() {
  renderManualSelectors();
  renderDayOffLists();
  renderOnlyLoadToday();
  renderManualPending();
}
function renderManualSelectors() {
  const date = document.getElementById('planDate').value;
  const pEl = document.getElementById('manualPerson');
  const lEl = document.getElementById('manualLocation');
  const lpEl = document.getElementById('manualLoadPerson');
  if (!pEl) return;
  const locAvail = state.people.filter(p => canGoToLocation(p.name, date));
  const loadAvail = state.people.filter(p => canGoToLoading(p.name, date));
  pEl.innerHTML = locAvail.map(p => `<option value="${p.name}">${p.id}. ${p.name}</option>`).join('');
  lpEl.innerHTML = loadAvail.map(p => `<option value="${p.name}">${p.id}. ${p.name}</option>`).join('');
  lEl.innerHTML = LOCATIONS.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
}
function renderDayOffLists() {
  const date = document.getElementById('planDate').value;
  if (!date) return;
  const d = state.dayOffs[date] || { full: [], noLoc: [], noLoad: [] };
  const full = d.full || [], noLoc = d.noLoc || [], noLoad = d.noLoad || [];
  const build = (p, list, field) => {
    const checked = list.includes(p.name);
    const vac = isOnVacation(p.name, date);
    return `<div class="check-row">
      <input type="checkbox" id="${field}_${p.id}" ${checked ? 'checked' : ''} ${vac ? 'disabled' : ''}
        onchange="toggleDayOff('${date}', '${p.name}', '${field}', this.checked)">
      <label for="${field}_${p.id}"><span class="num">${p.id}</span>${p.name}</label>
    </div>`;
  };
  document.getElementById('dayoffList').innerHTML =
    `<div class="title red">🚫 Отсутствует весь день (меня нет):</div>` +
    state.people.map(p => build(p, full, 'full')).join('') +
    `<div class="title" style="margin-top:14px;">🏭 Сегодня без локаций (только на отгрузку):</div>` +
    state.people.map(p => build(p, noLoc, 'noLoc')).join('') +
    `<div class="title" style="margin-top:14px;">📦 Сегодня без отгрузки (только на локации):</div>` +
    state.people.map(p => build(p, noLoad, 'noLoad')).join('');
}
function toggleDayOff(date, name, field, checked) {
  if (!state.dayOffs[date]) state.dayOffs[date] = { full: [], noLoc: [], noLoad: [] };
  const d = state.dayOffs[date];
  ['full','noLoc','noLoad'].forEach(f => { if (!d[f]) d[f] = []; });
  const list = d[field];
  if (checked) {
    ['full','noLoc','noLoad'].forEach(f => {
      if (f !== field) { const i = d[f].indexOf(name); if (i >= 0) d[f].splice(i, 1); }
    });
    if (!list.includes(name)) list.push(name);
    logAction('dayoff', { name, field, value: true, date });
  } else {
    const i = list.indexOf(name);
    if (i >= 0) list.splice(i, 1);
    logAction('dayoff', { name, field, value: false, date });
  }
  if (d.full.length === 0 && d.noLoc.length === 0 && d.noLoad.length === 0) delete state.dayOffs[date];
  saveState();
  renderDayOffLists();
  renderManualSelectors();
}
function renderOnlyLoadToday() {
  const date = document.getElementById('planDate').value;
  const el = document.getElementById('onlyLoadTodayList');
  if (!el) return;
  const list = state.onlyLoadToday[date] || [];
  el.innerHTML = state.people.filter(p => !isOnVacation(p.name, date)).map(p => {
    const checked = list.includes(p.name);
    return `<div class="check-row">
      <input type="checkbox" id="onlyld_${p.id}" ${checked ? 'checked' : ''}
        onchange="toggleOnlyLoadToday('${date}', '${p.name}', this.checked)">
      <label for="onlyld_${p.id}"><span class="num">${p.id}</span>${p.name}</label>
    </div>`;
  }).join('');
}
function toggleOnlyLoadToday(date, name, checked) {
  if (!state.onlyLoadToday[date]) state.onlyLoadToday[date] = [];
  const list = state.onlyLoadToday[date];
  if (checked) { if (!list.includes(name)) list.push(name); }
  else { const i = list.indexOf(name); if (i >= 0) list.splice(i, 1); }
  if (list.length === 0) delete state.onlyLoadToday[date];
  saveState();
  logAction('only_load_today', { name, value: checked, date });
  renderManualSelectors();
}
function addManualLocation() {
  const name = document.getElementById('manualPerson').value;
  const loc = document.getElementById('manualLocation').value;
  if (!name || !loc) return;
  state.manualLoc.push({ name, location: loc });
  saveState(); renderManualPending();
}
function addManualLoading() {
  const name = document.getElementById('manualLoadPerson').value;
  if (!name) return;
  if (state.manualLoad.includes(name)) return;
  state.manualLoad.push(name);
  saveState(); renderManualPending();
}
function renderManualPending() {
  const locEl = document.getElementById('manualLocList');
  const loadEl = document.getElementById('manualLoadList');
  if (locEl) {
    locEl.innerHTML = state.manualLoc.length === 0 ? '' :
      state.manualLoc.map((m, i) => `
        <div class="pending-item"><span>${getPersonNumber(m.name)}. ${m.name} → ${m.location}</span>
          <button class="mini" onclick="removeManualLoc(${i})">✕</button>
        </div>`).join('');
  }
  if (loadEl) {
    loadEl.innerHTML = state.manualLoad.length === 0 ? '' :
      state.manualLoad.map((n, i) => `
        <div class="pending-item"><span>${getPersonNumber(n)}. ${n}</span>
          <button class="mini" onclick="removeManualLoad(${i})">✕</button>
        </div>`).join('');
  }
}
function removeManualLoc(i) { state.manualLoc.splice(i, 1); saveState(); renderManualPending(); }
function removeManualLoad(i) { state.manualLoad.splice(i, 1); saveState(); renderManualPending(); }

// ============= РАСПРЕДЕЛЕНИЕ =============
function distribute() {
  const date = document.getElementById('planDate').value;
  if (!date) { showResult('⚠️ Укажите дату', true); return; }
  for (const p of state.people) checkVacationReturn(p.name, date);

  const requests = LOCATIONS.map(loc => ({
    location: loc, need: parseInt(document.getElementById('loc' + loc.id).value) || 0
  })).filter(r => r.need > 0);
  const loadingNeed = parseInt(document.getElementById('loadingCount').value) || 0;

  if (requests.length === 0 && loadingNeed === 0 &&
      state.manualLoc.length === 0 && state.manualLoad.length === 0) {
    showResult('⚠️ Укажите хотя бы одно действие', true); return;
  }

  const usedLoc = new Set();
  const assignments = [];

  const manualLocData = [];
  for (const m of state.manualLoc) {
    if (!canGoToLocation(m.name, date)) continue;
    usedLoc.add(m.name);
    manualLocData.push(m);
    state.journal.unshift({ date, location: m.location, who: [m.name], note: 'Ручное', manual: true });
    state.counts[m.name] = (state.counts[m.name] || 0) + 1;
    if (!state.locCounts[m.name]) state.locCounts[m.name] = {};
    state.locCounts[m.name][m.location] = (state.locCounts[m.name][m.location] || 0) + 1;
  }

  for (const req of requests) {
    const locName = req.location.name;
    const candidates = state.people.filter(p => !usedLoc.has(p.name) && canGoToLocation(p.name, date));
    candidates.sort((a, b) => {
      const sa = getLocationSortScore(a.name, date), sb = getLocationSortScore(b.name, date);
      if (sa !== sb) return sa - sb;
      const la = getLocationLocPoints(a.name, locName), lb = getLocationLocPoints(b.name, locName);
      if (la !== lb) return la - lb;
      return a.id - b.id;
    });
    const selected = candidates.slice(0, req.need);
    selected.forEach(p => {
      usedLoc.add(p.name);
    });
    assignments.push({
      location: req.location,
      who: selected.map(p => ({ name: p.name, num: p.id }))
    });
  }

  const manualLoadData = [];
  const usedLoad = new Set();
  for (const n of state.manualLoad) {
    if (!canGoToLoading(n, date)) continue;
    manualLoadData.push({ name: n, num: getPersonNumber(n) });
    usedLoad.add(n);
  }

  let loadingWho = [...manualLoadData];
  let groupNum = null;
  if (loadingNeed > 0) {
    const remaining = Math.max(0, loadingNeed - loadingWho.length);
    if (remaining > 0) {
      const result = distributeLoadingByRotation(date, remaining);
      groupNum = result.groupNum;
      for (const name of result.selected) {
        if (!usedLoad.has(name)) {
          loadingWho.push({ name, num: getPersonNumber(name) });
          usedLoad.add(name);
        }
      }
    }
  }

  const d = state.dayOffs[date] || { full: [], noLoc: [], noLoad: [] };
  const absentInfo = [];
  for (const p of state.people) {
    const vac = isOnVacation(p.name, date);
    if (vac) absentInfo.push(`${p.id}. ${p.name} (${vac.type})`);
    else if ((d.full || []).includes(p.name)) absentInfo.push(`${p.id}. ${p.name} (отсутствует)`);
    else if ((d.noLoc || []).includes(p.name)) absentInfo.push(`${p.id}. ${p.name} (без локаций)`);
    else if ((d.noLoad || []).includes(p.name)) absentInfo.push(`${p.id}. ${p.name} (без отгрузки)`);
  }
  const note = absentInfo.length ? 'Отсутствовали: ' + absentInfo.join(', ') : '';

  for (const a of assignments) {
    state.journal.unshift({ date, location: a.location.name, who: a.who.map(w => w.name), note });
    for (const w of a.who) {
      state.counts[w.name] = (state.counts[w.name] || 0) + 1;
      if (!state.locCounts[w.name]) state.locCounts[w.name] = {};
      state.locCounts[w.name][a.location.name] = (state.locCounts[w.name][a.location.name] || 0) + 1;
    }
  }
  if (loadingWho.length) {
    state.loadingJournal.unshift({
      date,
      who: loadingWho.map(w => w.name),
      note,
      group: groupNum
    });
    for (const w of loadingWho) state.loadCounts[w.name] = (state.loadCounts[w.name] || 0) + 1;
  }

  state.manualLoc = [];
  state.manualLoad = [];
  saveState();

  logAction('distribute', {
    date,
    locations: assignments.map(a => ({ name: a.location.name, who: a.who.map(w => w.name) })),
    loading: loadingWho.map(w => w.name),
    loadingGroup: groupNum
  });

  let html = '';
  if (manualLocData.length) {
    html += '<div style="font-weight:600;color:#5f6368;">👤 Ручное:</div><ul>';
    for (const m of manualLocData) html += `<li>${getPersonNumber(m.name)}. ${m.name} → ${m.location}</li>`;
    html += '</ul>';
  }
  if (assignments.length) {
    html += '<div style="font-weight:600;color:#1a73e8;">✅ Локации:</div>';
    for (const a of assignments) {
      html += `<div class="loc-name">${a.location.name}:</div><ul>`;
      for (const w of a.who) html += `<li><span class="num">${w.num}</span>${w.name}</li>`;
      html += '</ul>';
    }
  }
  if (loadingWho.length) {
    const groupLabel = groupNum ? ` (тройка ${groupNum})` : '';
    html += `<div style="font-weight:600;color:#e8710a;margin-top:12px;">📦 Отгрузка${groupLabel}:</div><ul>`;
    for (const w of loadingWho) html += `<li><span class="num">${w.num}</span>${w.name}</li>`;
    html += '</ul>';
  }
  if (absentInfo.length) html += `<div style="margin-top:10px;font-size:13px;color:#666;">Отсутствуют: ${absentInfo.join(', ')}</div>`;
  showResult(html, false);

  document.getElementById('loc1').value = 0;
  document.getElementById('loc2').value = 0;
  document.getElementById('loc3').value = 0;
  document.getElementById('loc4').value = 0;
  document.getElementById('loadingCount').value = 0;
  if (state.dayOffs[date]) delete state.dayOffs[date];
  if (state.onlyLoadToday[date]) delete state.onlyLoadToday[date];
  saveState();
  renderPlanTab();
}
function showResult(html, isWarn) {
  const el = document.getElementById('planResult');
  el.className = 'result' + (isWarn ? ' warn' : '');
  el.innerHTML = html;
}

// ============= ЖУРНАЛ =============
function renderJournal() {
  const el = document.getElementById('journalList');
  if (state.journal.length === 0) el.innerHTML = '<div class="empty">Пока пусто</div>';
  else {
    const byDate = {};
    for (const j of state.journal) { if (!byDate[j.date]) byDate[j.date] = []; byDate[j.date].push(j); }
    el.innerHTML = Object.keys(byDate).sort().reverse().map(date => {
      const items = byDate[date];
      const rows = items.map(j => `<div class="who"><b>${j.location}:</b> ${j.who.map(n => getPersonNumber(n) + '. ' + n).join(', ')}${j.manual ? ' <i>(ручное)</i>' : ''}</div>`).join('');
      const note = items[0].note ? `<div class="note">${items[0].note}</div>` : '';
      const canEdit = date === todayIso() || date > todayIso();
      return `<div class="journal-item"><div class="date">${formatDate(date)}</div>${rows}${note}
        ${canEdit ? `<div class="journal-actions"><button class="mini" onclick="cancelDay('${date}')">↩️ Отменить день</button></div>` : ''}</div>`;
    }).join('');
  }
  const el2 = document.getElementById('loadingJournalList');
  if (state.loadingJournal.length === 0) el2.innerHTML = '<div class="empty">Пока пусто</div>';
  else {
    const byDate = {};
    for (const j of state.loadingJournal) { if (!byDate[j.date]) byDate[j.date] = []; byDate[j.date].push(j); }
    el2.innerHTML = Object.keys(byDate).sort().reverse().map(date => {
      const items = byDate[date];
      const rows = items.map(j => {
        const groupLabel = j.group ? ` (тройка ${j.group})` : '';
        return `<div class="who">Отгрузка${groupLabel} (${j.who.length}): ${j.who.map(n => getPersonNumber(n) + '. ' + n).join(', ')}</div>`;
      }).join('');
      const canEdit = date === todayIso() || date > todayIso();
      return `<div class="journal-item"><div class="date orange">${formatDate(date)}</div>${rows}
        ${canEdit ? `<div class="journal-actions"><button class="mini" onclick="cancelLoadingDay('${date}')">↩️ Отменить</button></div>` : ''}</div>`;
    }).join('');
  }
}
function cancelDay(date) {
  if (!confirm(`Отменить выезды на ${formatDate(date)}?`)) return;
  const remaining = [];
  for (const j of state.journal) {
    if (j.date === date) {
      for (const name of j.who) {
        state.counts[name] = Math.max(0, (state.counts[name] || 0) - 1);
        if (state.locCounts[name] && state.locCounts[name][j.location])
          state.locCounts[name][j.location] = Math.max(0, state.locCounts[name][j.location] - 1);
      }
    } else remaining.push(j);
  }
  state.journal = remaining;
  saveState(); renderJournal();
  logAction('cancel', { date, type: 'locations' });
}
function cancelLoadingDay(date) {
  if (!confirm(`Отменить отгрузки на ${formatDate(date)}?`)) return;
  const remaining = [];
  for (const j of state.loadingJournal) {
    if (j.date === date) {
      for (const name of j.who) state.loadCounts[name] = Math.max(0, (state.loadCounts[name] || 0) - 1);
    } else remaining.push(j);
  }
  state.loadingJournal = remaining;
  saveState(); renderJournal();
  logAction('cancel', { date, type: 'loading' });
}

// ============= СТАТИСТИКА =============
function renderProgressBar(fact, norm, color) {
  const percent = norm > 0 ? Math.min(100, (fact / norm) * 100) : 0;
  const cls = color === 'orange' ? 'progress-fill orange' : 'progress-fill';
  return `<div class="progress-bar"><div class="${cls}" style="width:${percent}%"></div></div>`;
}

function renderStats() {
  const avg = getAverageLocationTrips();
  const el = document.getElementById('statsList');
  const rows = state.people.map(p => {
    const fact = state.counts[p.name] || 0;
    const dev = fact - avg;
    return { name: p.name, num: p.id, fact, avg, dev, breakdown: state.locCounts[p.name] || {} };
  }).sort((a, b) => a.dev - b.dev);
  
  let html = `<div style="font-size:13px; color:#666; margin-bottom:10px;">Среднее по команде: <b>${avg.toFixed(1)}</b> выездов</div>`;
  
  html += rows.map(r => {
    const parts = LOCATIONS.map(loc => `<span>${loc.name}: ${r.breakdown[loc.name] || 0}</span>`).join('');
    const diff = r.dev;
    let status, color;
    if (diff < -0.5) { status = `отстаёт на ${Math.abs(diff).toFixed(1)}`; color = '#137333'; }
    else if (diff > 0.5) { status = `опережает на ${diff.toFixed(1)}`; color = '#d93025'; }
    else { status = 'в среднем'; color = '#777'; }
    return `<div class="stat-row" data-name="${r.name}">
      <div class="stat-top"><span><span class="num">${r.num}</span>${r.name}</span>
        <span><b>${r.fact}</b> <span style="color:${color};font-size:12px">(${status})</span></span>
      </div>
      ${renderProgressBar(r.fact, Math.max(1, avg), 'blue')}
      <div class="stat-breakdown">${parts}</div>
    </div>`;
  }).join('');
  el.innerHTML = html;

  const el2 = document.getElementById('statsLoading');
  const rows2 = state.people.map(p => {
    const fact = state.loadCounts[p.name] || 0;
    return { name: p.name, num: p.id, fact };
  }).sort((a, b) => a.fact - b.fact);
  el2.innerHTML = rows2.map(r => {
    return `<div class="stat-row" data-name="${r.name}">
      <div class="stat-top"><span><span class="num">${r.num}</span>${r.name}</span>
        <span><b>${r.fact}</b> отгрузок</span>
      </div>
    </div>`;
  }).join('');
}
function resetStats() {
  if (!confirm('Обнулить все счётчики?')) return;
  state.counts = {}; state.locCounts = {}; state.loadCounts = {};
  saveState(); renderStats();
  logAction('reset_stats', {});
}

// ============= КАРТОЧКА ЧЕЛОВЕКА =============
function openPersonCard(name) {
  const el = document.getElementById('personCardContent');
  const num = getPersonNumber(name);
  const totalLoc = state.counts[name] || 0;
  const totalLoad = state.loadCounts[name] || 0;
  const workDays = getWorkDays(name);
  const avgLoc = getAverageLocationTrips();
  const devLoc = totalLoc - avgLoc;
  const cu = state.catchUp[name];
  const locBreakdown = LOCATIONS.map(loc => ({
    name: loc.name,
    count: (state.locCounts[name] && state.locCounts[name][loc.name]) || 0
  }));
  const history = state.journal.filter(j => j.who.includes(name)).slice(0, 15);
  const loadHistory = state.loadingJournal.filter(j => j.who.includes(name)).slice(0, 15);
  const vacs = state.vacations[name] || [];

  const locPercent = avgLoc > 0 ? Math.min(100, (totalLoc / avgLoc) * 100) : 0;

  const locStatus = devLoc < -0.5 ? `Отстаёт на ${Math.abs(devLoc).toFixed(1)}` :
                    devLoc > 0.5 ? `Опережает на ${devLoc.toFixed(1)}` : 'В среднем';

  el.innerHTML = `
    <div class="card">
      <h2>👤 ${num}. ${name}</h2>
      ${cu ? `<div class="card-row"><span class="lbl">🔄 Догоняет после отпуска</span><span class="val">${Math.round(cu.coef*100)}%</span></div>` : ''}
      <div class="card-row"><span class="lbl">Рабочих дней за 30 дн.</span><span class="val">${workDays}</span></div>
    </div>
    <div class="card">
      <h2>🏭 Локации</h2>
      <div class="card-big">
        <div><div class="big-num ${devLoc < -0.5 ? 'green' : (devLoc > 0.5 ? 'red' : '')}">${totalLoc}</div><div class="big-sub">выездов</div></div>
        <div style="text-align:right"><div class="big-num ${devLoc < -0.5 ? 'green' : (devLoc > 0.5 ? 'red' : '')}">${devLoc > 0 ? '+' : ''}${devLoc.toFixed(1)}</div><div class="big-sub">к среднему</div></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${locPercent}%"></div></div>
      <div class="info">Среднее по команде: ${avgLoc.toFixed(1)} (${locStatus})</div>
      ${locBreakdown.map(l => `<div class="card-row"><span class="lbl">${l.name}</span><span class="val">${l.count}</span></div>`).join('')}
    </div>
    <div class="card">
      <h2 class="orange">📦 Отгрузки</h2>
      <div class="card-big">
        <div><div class="big-num orange">${totalLoad}</div><div class="big-sub">отгрузок</div></div>
      </div>
    </div>
    <div class="card">
      <h2>📅 Последние выезды</h2>
      ${history.length === 0 ? '<div class="hist-empty">Ещё не выезжал</div>'
        : history.map(h => `<div class="hist-item"><div class="hist-date">${formatDate(h.date)}</div><div class="hist-info">${h.location}</div></div>`).join('')}
    </div>
    <div class="card">
      <h2 class="orange">📦 Последние отгрузки</h2>
      ${loadHistory.length === 0 ? '<div class="hist-empty">Ещё не оставался</div>'
        : loadHistory.map(h => `<div class="hist-item"><div class="hist-date orange">${formatDate(h.date)}</div><div class="hist-info">Отгрузка</div></div>`).join('')}
    </div>
    <div class="card">
      <h2>🏖 Отпуска и больничные</h2>
      ${vacs.length === 0 ? '<div class="hist-empty">Не было</div>'
        : vacs.map(v => `<div class="hist-item"><div class="hist-date">${v.type}</div><div class="hist-info">${formatDate(v.from)} — ${formatDate(v.to)}</div></div>`).join('')}
    </div>
  `;
  switchTab('person', null);
}
function closePersonCard() {
  switchTab('stats', document.querySelectorAll('nav button')[2]);
}

// ============= ЛЮДИ =============
function renderPeople() {
  const el = document.getElementById('peopleList');
  el.innerHTML = state.people.map(p => {
    const vacs = state.vacations[p.name] || [];
    const activeVacs = vacs.filter(v => v.to >= todayIso());
    const badges = activeVacs.map(v =>
      `<span class="badge ${v.type === 'Отпуск' ? 'vacation' : 'sick'}">${v.type}</span>`).join('');
    return `
      <div class="person-card">
        <div class="person-name"><span class="num">${p.id}</span>${p.name}${badges}</div>
        <div style="margin-top:6px;">
          <label style="display:flex;gap:8px;align-items:center;font-size:14px;">
            <input type="checkbox" ${p.noLoading ? 'checked' : ''}
              onchange="toggleNoLoading('${p.name}', this.checked)" style="width:18px;height:18px;">
            🚫 Постоянно не на отгрузке
          </label>
          <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-top:4px;">
            <input type="checkbox" ${p.onlyLoading ? 'checked' : ''}
              onchange="toggleOnlyLoading('${p.name}', this.checked)" style="width:18px;height:18px;">
            🚫 Только отгрузка (без локаций)
          </label>
        </div>
        <div style="margin-top:8px;">
          <select onchange="addVacation('${p.name}', this)">
            <option value="">+ Добавить отсутствие...</option>
            <option value="Отпуск">Отпуск</option>
            <option value="Больничный">Больничный</option>
          </select>
        </div>
        ${activeVacs.length ? `<div style="margin-top:8px;">${activeVacs.map((v) => {
          const idx = state.vacations[p.name].indexOf(v);
          return `<div style="display:flex;gap:6px;align-items:center;font-size:13px;margin-top:4px;flex-wrap:wrap;">
            <span>${v.type}:</span>
            <input type="date" value="${v.from}" onchange="updateVac('${p.name}', ${idx}, 'from', this.value)" style="width:auto;padding:4px;font-size:13px;">
            <span>—</span>
            <input type="date" value="${v.to}" onchange="updateVac('${p.name}', ${idx}, 'to', this.value)" style="width:auto;padding:4px;font-size:13px;">
            <button onclick="removeVac('${p.name}', ${idx})" style="width:auto;padding:4px 8px;font-size:13px;background:#fce8e6;color:#d93025;margin:0;">✕</button>
          </div>`;
        }).join('')}</div>` : ''}
      </div>`;
  }).join('');
}
function toggleNoLoading(name, val) {
  const p = state.people.find(x => x.name === name);
  if (p) { p.noLoading = val; saveState(); logAction('toggle', { name, field: 'noLoading', value: val }); }
}
function toggleOnlyLoading(name, val) {
  const p = state.people.find(x => x.name === name);
  if (p) { p.onlyLoading = val; saveState(); logAction('toggle', { name, field: 'onlyLoading', value: val }); }
}
function addVacation(name, selectEl) {
  const type = selectEl.value; if (!type) return;
  selectEl.value = '';
  const today = todayIso();
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (!state.vacations[name]) state.vacations[name] = [];
  state.vacations[name].push({ from: today, to: weekLater, type });
  saveState(); renderPeople();
  logAction('vacation', { name, action: 'add', from: today, to: weekLater, type });
}
function updateVac(name, idx, field, value) {
  if (!state.vacations[name] || !state.vacations[name][idx]) return;
  state.vacations[name][idx][field] = value; saveState();
}
function removeVac(name, idx) {
  if (!state.vacations[name]) return;
  const v = state.vacations[name][idx];
  state.vacations[name].splice(idx, 1); saveState(); renderPeople();
  logAction('vacation', { name, action: 'remove', from: v.from, to: v.to, type: v.type });
}

// ============= НАСТРОЙКИ =============
function renderSettings() {
  const el = document.getElementById('settingsContent');
  el.innerHTML = `
    <div class="card">
      <h2>🔐 Безопасность</h2>
      <div class="settings-row">
        <div class="label">Журнал действий</div>
        <button class="secondary" onclick="openActionLog()">🔒 Открыть журнал</button>
      </div>
      <div class="settings-row">
        <div class="label">PIN-код</div>
        <button class="secondary" onclick="changePin()">Сменить PIN</button>
      </div>
    </div>
    <div class="card">
      <h2>💾 Данные</h2>
      <div class="settings-row">
        <button class="secondary" onclick="exportData()">📤 Экспорт</button>
      </div>
      <div class="settings-row">
        <button class="secondary" onclick="document.getElementById('importFile').click()">📥 Импорт</button>
        <input type="file" id="importFile" style="display:none" accept=".json" onchange="importData(event)">
      </div>
    </div>
    <div class="card danger-card">
      <h2 class="red">⚠️ Опасная зона</h2>
      <div class="settings-row">
        <button class="secondary" onclick="resetStats()">♻️ Сбросить статистику</button>
      </div>
      <div class="settings-row">
        <button class="secondary" onclick="resetRotation()">🔄 Сбросить счётчик ротации</button>
      </div>
      <div class="settings-row">
        <button class="danger" onclick="confirmReset()">🔄 Сбросить всё</button>
      </div>
    </div>
  `;
}
function resetRotation() {
  if (!confirm('Сбросить счётчики замены? Следующая замена начнётся с первого человека.')) return;
  state.rotation = { counter1: 0, counter2: 0 };
  saveState();
  alert('✅ Счётчики сброшены');
}
function openActionLog() {
  extendPinSession();
  switchTab('actionlog', null);
}
function changePin() {
  const current = prompt('Текущий PIN:');
  if (current !== (state.pin || DEFAULT_PIN)) { alert('❌ Неверный PIN'); return; }
  const newPin = prompt('Новый PIN (4–8 цифр):');
  if (!newPin || !/^\d{4,8}$/.test(newPin)) { alert('❌ PIN должен быть 4–8 цифр'); return; }
  const confirm = prompt('Повторите PIN:');
  if (newPin !== confirm) { alert('❌ Не совпадает'); return; }
  state.pin = newPin; saveState();
  logAction('pin_change', {});
  alert('✅ PIN изменён');
}

// ============= ЖУРНАЛ ДЕЙСТВИЙ =============
function renderActionLog() {
  const el = document.getElementById('actionLogContent');
  if (!state.actionLog || state.actionLog.length === 0) {
    el.innerHTML = '<div class="card"><div class="empty">Журнал пуст</div></div>';
    return;
  }
  const byDate = {};
  for (const a of state.actionLog) {
    const day = a.ts.slice(0, 10);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(a);
  }
  const typeLabels = {
    'distribute': 'распределение', 'dayoff': 'отсутствие', 'manual': 'ручное',
    'cancel': 'отмена', 'vacation': 'отпуск', 'reset_stats': 'сброс статы',
    'pin_change': 'PIN', 'toggle': 'галочка', 'import': 'импорт',
    'only_load_today': 'только отгрузка'
  };
  let html = '<div class="card"><h2>🔒 Журнал действий</h2>';
  html += Object.keys(byDate).sort().reverse().map(date => {
    const rows = byDate[date].map(a => {
      let text = '';
      const d = a.details || {};
      if (a.type === 'distribute') {
        text = `Распределено на ${formatDate(d.date)}: `;
        if (d.locations && d.locations.length) text += d.locations.map(l => `${l.name} (${l.who.length}): ${l.who.join(', ')}`).join('; ');
        if (d.loading && d.loading.length) {
          text += ` | Отгрузка`;
          if (d.loadingGroup) text += ` (тройка ${d.loadingGroup})`;
          text += `: ${d.loading.join(', ')}`;
        }
      } else if (a.type === 'dayoff') {
        const labels = { full: 'отсутствует весь день', noLoc: 'без локаций', noLoad: 'без отгрузки' };
        text = `${d.name} → ${d.value ? 'поставлен' : 'снят'} «${labels[d.field]}» на ${formatDate(d.date)}`;
      } else if (a.type === 'manual') text = `Вручную: ${d.name} → ${d.location}`;
      else if (a.type === 'cancel') text = `Отменено (${d.type}) за ${formatDate(d.date)}`;
      else if (a.type === 'vacation') text = d.action === 'add' ? `${d.name}: добавлен ${d.type} ${formatDate(d.from)}—${formatDate(d.to)}` : `${d.name}: удалён ${d.type}`;
      else if (a.type === 'reset_stats') text = `Сброшена вся статистика`;
      else if (a.type === 'pin_change') text = `PIN изменён`;
      else if (a.type === 'toggle') text = `${d.name}: «${d.field}» = ${d.value}`;
      else if (a.type === 'import') text = `Импорт данных`;
      else if (a.type === 'only_load_today') text = `${d.name}: только отгрузка (${formatDate(d.date)}) = ${d.value}`;
      else text = JSON.stringify(d);
      return `<div class="actionlog-item">
        <div><span class="actionlog-time">${formatDateTime(a.ts)}</span><span class="actionlog-type">${typeLabels[a.type] || a.type}</span></div>
        <div class="actionlog-text">${text}</div>
      </div>`;
    }).join('');
    return `<div class="actionlog-date">${formatDate(date)}</div>${rows}`;
  }).join('');
  html += '</div>';
  el.innerHTML = html;
}

// ============= ЭКСПОРТ / ИМПОРТ / СБРОС =============
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'duty-backup-' + todayIso() + '.json';
  a.click(); URL.revokeObjectURL(url);
  logAction('export', {});
}
function importData(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.people || !data.journal) throw new Error('bad');
      state = data;
      ['counts','locCounts','loadCounts','vacations','dayOffs','catchUp','onlyLoadToday'].forEach(k => { if (!state[k]) state[k] = {}; });
      if (!state.loadingJournal) state.loadingJournal = [];
      if (!state.manualLoc) state.manualLoc = [];
      if (!state.manualLoad) state.manualLoad = [];
      if (!state.actionLog) state.actionLog = [];
      if (!state.rotation) state.rotation = { counter1: 0, counter2: 0 };
      if (!state.pin) state.pin = DEFAULT_PIN;
      const sorted = [];
      for (let i = 0; i < DEFAULT_PEOPLE.length; i++) {
        const name = DEFAULT_PEOPLE[i];
        const existing = state.people.find(x => x.name === name);
        if (existing) {
          existing.id = i + 1;
          if (existing.noLoading === undefined) existing.noLoading = false;
          if (existing.onlyLoading === undefined) existing.onlyLoading = false;
          sorted.push(existing);
        } else {
          sorted.push({ id: i + 1, name, noLoading: false, onlyLoading: false });
        }
      }
      state.people = sorted;
      saveState();
      logAction('import', {});
      renderPeople(); renderJournal(); renderStats(); renderPlanTab();
      alert('✅ Восстановлено');
    } catch (err) { alert('❌ Ошибка'); }
  };
  reader.readAsText(file);
}
function confirmReset() {
  if (!confirm('⚠️ СБРОСИТЬ ВСЁ?')) return;
  if (!confirm('🛑 Последнее предупреждение.')) return;
  const word = prompt('Введи УДАЛИТЬ капсом:');
  if (word !== 'УДАЛИТЬ') { alert('Отменено'); return; }
  localStorage.removeItem('dutyApp');
  state = loadState(); saveState();
  renderPeople(); renderJournal(); renderStats(); renderPlanTab();
  showResult('', false);
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
(function init() {
  applyDailyCatchUp();
  document.getElementById('planDate').value = todayIso();
  document.getElementById('planDate').addEventListener('change', renderPlanTab);
  const pinInput = document.getElementById('pinInput');
  if (pinInput) pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
  
  document.getElementById('statsList').addEventListener('click', (e) => {
    const row = e.target.closest('.stat-row');
    if (row && row.dataset.name) openPersonCard(row.dataset.name);
  });
  document.getElementById('statsLoading').addEventListener('click', (e) => {
    const row = e.target.closest('.stat-row');
    if (row && row.dataset.name) openPersonCard(row.dataset.name);
  });

  renderPlanTab(); renderJournal(); renderStats(); renderPeople();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
})();
