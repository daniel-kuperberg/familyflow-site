import { DAYS, CHILDREN, calendarFor, validateSchedule, validateLocalSchedule, selectActivities, groupByTime } from './schedule-core.mjs?v=11';

const $ = id => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDateFormat = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
let calendar = calendarFor();
let selectedDay = calendar.selectedDay;
let selectedChild = 'all';
let activities = [];
let loadState = 'loading';
let loading = false;
let localSchedule = null;
let scheduleOrigin = 'device';
const hostedScheduleUrl = document.querySelector('meta[name="familyflow-schedule"]')?.content;
const STORAGE_KEY = 'familyflow-local-schedule-v1';
const HOSTED_STORAGE_KEY = 'familyflow-hosted-schedule-v1';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function childAvatar(child) { return element('span', `tab-avatar ${child.id}`, child.initial); }
function activityCount(count) { return count === 1 ? 'פעילות אחת' : `${count} פעילויות`; }
function hasSchedule(child) { return !localSchedule || localSchedule.children.includes(child); }

function renderDataNotice() {
  const notice = $('data-notice');
  if (!localSchedule) return;
  const names = CHILDREN.filter(child => localSchedule.children.includes(child.id)).map(child => child.name).join(', ');
  const originLabel = scheduleOrigin === 'hosted' ? 'המערכת המשפחתית' : scheduleOrigin === 'hosted-cache' ? 'עותק שמור במכשיר' : 'במכשיר הזה';
  const originDescription = scheduleOrigin === 'hosted' ? 'מהאתר' : scheduleOrigin === 'hosted-cache' ? 'מנתונים שנשמרו במכשיר; ייתכן שאינם מעודכנים' : 'מקובץ שנטען מקומית';
  notice.replaceChildren(element('span', 'demo-tag', originLabel), element('span', '', `המערכת של ${names} · ללא נתוני הדגמה`));
  $('about-data').textContent = `מוצגת המערכת של ${names}, ${originDescription}. הילדות שעדיין לא נוספה להן מערכת מסומנות בהתאם.`;
}

function renderDays() {
  $('week-range').textContent = `${shortDateFormat.format(calendar.dates[0])} – ${shortDateFormat.format(calendar.dates[5])}`;
  const days = DAYS.map((name, day) => {
    const button = element('button', 'day-button');
    button.type = 'button';
    button.dataset.day = day;
    button.setAttribute('aria-pressed', String(day === selectedDay));
    button.setAttribute('aria-label', `יום ${name}, ${dateFormat.format(calendar.dates[day])}`);
    if (!calendar.saturday && day === calendar.selectedDay) {
      button.classList.add('is-today');
      button.setAttribute('aria-current', 'date');
    }
    button.append(element('span', 'day-name', name), element('span', 'day-number', calendar.dates[day].getUTCDate()));
    button.addEventListener('click', () => { selectedDay = day; render(); $('week-days').querySelector(`[data-day="${day}"]`).focus(); });
    return button;
  });
  $('week-days').replaceChildren(...days);
  $('today-button').textContent = calendar.saturday ? 'ליום ראשון הקרוב ↶' : 'חזרה להיום ↶';
}

function renderSummary(items) {
  const children = selectedChild === 'all' ? CHILDREN : CHILDREN.filter(child => child.id === selectedChild);
  $('summary-grid').classList.toggle('single', children.length === 1);
  $('summary-grid').replaceChildren(...children.map(child => {
    const count = items.filter(item => item.child === child.id).length;
    const card = element('button', 'summary-card');
    card.type = 'button';
    card.setAttribute('aria-label', `הצגת המערכת של ${child.name} ביום ${DAYS[selectedDay]}`);
    card.addEventListener('click', () => { selectChild(child.id); $(`tab-${child.id}`).focus(); });
    const copy = element('div');
    copy.append(element('p', 'summary-name', child.name), element('p', 'summary-count', loadState !== 'ready' ? '—' : !hasSchedule(child.id) ? 'טרם הוזנה מערכת' : count ? activityCount(count) : $('clubs-only').checked ? 'לא הוזנו חוגים' : localSchedule ? 'לא הוזנו פעילויות' : 'יום פנוי'));
    card.append(childAvatar(child), copy);
    return card;
  }));
}

function eventCard(item) {
  const child = CHILDREN.find(child => child.id === item.child);
  const card = element('article', 'event');
  card.dataset.child = child.id;
  const icon = element('span', 'event-icon', item.type === 'school' ? '▤' : '✦');
  icon.setAttribute('aria-hidden', 'true');
  const main = element('div', 'event-main');
  const top = element('div', 'event-top');
  const childName = element('button', `child-tag ${child.id}`, child.name);
  childName.type = 'button';
  childName.setAttribute('aria-label', `הצגת המערכת של ${child.name} ביום ${DAYS[selectedDay]}`);
  childName.addEventListener('click', () => { selectChild(child.id); $(`tab-${child.id}`).focus(); });
  top.append(element('h4', 'event-title', item.title), childName);
  const details = element('p', 'event-details');
  if (item.start !== undefined) {
    const time = element('span', 'event-time', `${item.start}–${item.end}`);
    time.dir = 'ltr';
    details.append(time);
  }
  if (item.period) details.append(element('span', 'lesson-number', `${item.start === undefined ? '' : '· '}שיעור ${item.period}`));
  main.append(top, details);
  card.append(icon, main, element('span', 'event-type', item.type === 'school' ? 'לימודים' : 'חוג'));
  return card;
}

function render() {
  renderDays();
  const clubsOnly = $('clubs-only').checked;
  $('timeline-title').textContent = clubsOnly ? 'חוגים אחרי הצהריים' : 'לפי סדר היום';
  const isToday = !calendar.saturday && selectedDay === calendar.selectedDay;
  const name = selectedChild === 'all' ? 'כולן' : CHILDREN.find(child => child.id === selectedChild).name;
  $('date-label').textContent = `${isToday ? 'היום · ' : ''}${dateFormat.format(calendar.dates[selectedDay])}`;
  $('day-title').textContent = `יום ${DAYS[selectedDay]} של ${name}`;
  $('saturday-note').hidden = !(calendar.saturday && selectedDay === 0);
  const items = selectActivities(activities, { day: selectedDay, child: selectedChild, afternoonClubsOnly: clubsOnly });
  const notes = clubsOnly ? [] : (localSchedule?.notes ?? []).filter(note => note.day === selectedDay && (selectedChild === 'all' || note.child === selectedChild)).map(note => note.text);
  if (items.some(item => item.start === undefined)) notes.push('השעות של טלי אינן מופיעות בצילום; השיעורים מוצגים לפי סדרם.');
  $('day-note').textContent = notes.join(' ');
  $('day-note').hidden = notes.length === 0;
  $('activity-total').textContent = loadState === 'ready' ? activityCount(items.length) : '—';
  renderSummary(items);
  $('schedule').setAttribute('aria-busy', String(loadState === 'loading'));
  if (loadState === 'loading') { $('schedule').replaceChildren(element('p', 'loading', 'טוענים את התוכניות…')); return; }
  if (loadState === 'error') {
    const box = element('div', 'empty-state error');
    box.append(element('h3', '', 'לא הצלחנו לטעון את התוכניות'), element('p', '', 'בדקו את החיבור ונסו שוב.'));
    const retry = element('button', 'today-button', 'ניסיון נוסף');
    retry.addEventListener('click', loadSchedule);
    box.append(retry);
    $('schedule').replaceChildren(box);
    $('schedule-status').textContent = 'שגיאה בטעינת הפעילויות';
    return;
  }
  $('schedule-status').textContent = `יום ${DAYS[selectedDay]}, ${name}, ${activityCount(items.length)}${clubsOnly ? ', חוגים אחרי הצהריים בלבד' : ''}`;
  if (!items.length) {
    const box = element('div', 'empty-state');
    const missing = selectedChild !== 'all' && !hasSchedule(selectedChild);
    const title = missing ? `המערכת של ${name} עוד לא נוספה` : clubsOnly ? 'אין חוגים אחרי הצהריים שהוזנו' : localSchedule ? 'אין פעילויות להצגה' : 'יש מקום לזמן חופשי';
    const copy = missing ? 'לאחר טעינת המערכת שלה, הפעילויות יופיעו כאן.' : clubsOnly ? 'כשתוסיף חוגים למערכת, הם יופיעו כאן. אפשר לכבות ״חוגים בלבד״ כדי לראות את שיעורי בית הספר.' : localSchedule ? 'בקובץ שנטען אין שיעורים ליום הזה.' : 'אין פעילויות בתוכנית ההדגמה ליום הזה.';
    box.append(element('span', 'empty-icon', '☀'), element('h3', '', title), element('p', '', copy));
    $('schedule').replaceChildren(box);
    return;
  }
  let addedUntimedHeading = false;
  const rows = groupByTime(items).flatMap(group => {
    const output = [];
    if (selectedChild === 'all' && group.items[0].start === undefined && !addedUntimedHeading) {
      output.push(element('p', 'untimed-heading', 'שיעורים ללא שעות מדויקות'));
      addedUntimedHeading = true;
    }
    const row = element('section', 'time-group');
    if (group.items[0].start === undefined) row.classList.add('period-only');
    row.setAttribute('aria-label', group.items[0].start === undefined ? group.time : `פעילויות בשעה ${group.time}`);
    const time = element('p', 'time-label', group.time);
    const cards = element('div', 'time-events');
    cards.append(...group.items.map(eventCard));
    row.append(time, cards);
    output.push(row);
    return output;
  });
  $('schedule').replaceChildren(...rows);
}

function selectChild(id) {
  selectedChild = id;
  for (const tab of $('child-tabs').querySelectorAll('[role="tab"]')) {
    const active = tab.dataset.child === id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $('schedule-panel').setAttribute('aria-labelledby', `tab-${id}`);
  render();
}

$('child-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) selectChild(tab.dataset.child);
});
$('child-tabs').addEventListener('keydown', event => {
  const tabs = [...$('child-tabs').querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  let next;
  if (event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
  if (event.key === 'ArrowRight') next = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  if (next === undefined) return;
  event.preventDefault();
  selectChild(tabs[next].dataset.child);
  tabs[next].focus();
});
$('today-button').addEventListener('click', () => { calendar = calendarFor(); selectedDay = calendar.selectedDay; render(); });
$('clubs-only').addEventListener('change', render);
$('about-button').addEventListener('click', () => $('about-dialog').showModal());
$('close-about').addEventListener('click', () => $('about-dialog').close());
let installPrompt;
const installButton = $('install-button');
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
installButton.hidden = installed();
$('install-link').value = new URL('./', location.href).href;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
  if ($('install-dialog').open) $('install-dialog').close();
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) { $('install-dialog').showModal(); return; }
  const prompt = installPrompt;
  installPrompt = null;
  try {
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') installButton.hidden = true;
  } catch { $('install-dialog').showModal(); }
});
$('close-install').addEventListener('click', () => $('install-dialog').close());
$('copy-install-link').addEventListener('click', async () => {
  const link = $('install-link');
  try {
    await navigator.clipboard.writeText(link.value);
    $('install-status').textContent = 'הקישור הועתק.';
  } catch {
    link.focus();
    link.select();
    $('install-status').textContent = 'הקישור מסומן; אפשר להעתיק אותו.';
  }
});
$('import-button').addEventListener('click', () => $('schedule-file').click());
$('schedule-file').addEventListener('change', async () => {
  const file = $('schedule-file').files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('File is too large');
    const imported = validateLocalSchedule(JSON.parse(await file.text()));
    let saved = !hostedScheduleUrl;
    if (saved) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(imported)); } catch { saved = false; }
    scheduleOrigin = 'device';
    localSchedule = imported;
    activities = imported.activities;
    loadState = 'ready';
    renderDataNotice();
    selectChild(imported.children.length === 1 ? imported.children[0] : 'all');
    $('import-status').textContent = hostedScheduleUrl ? 'הקובץ נטען לביקור הזה. ברענון תחזור המערכת המעודכנת מהאתר.' : saved ? 'המערכת נטענה ונשמרה בדפדפן הזה.' : 'המערכת נטענה לביקור הנוכחי בלבד. הדפדפן לא אפשר לשמור אותה.';
  } catch {
    $('import-status').textContent = 'לא ניתן לטעון את הקובץ. יש לבחור קובץ מערכת תקין; המערכת הקיימת לא שונתה.';
  } finally { $('schedule-file').value = ''; }
});

function refreshDate() {
  const next = calendarFor();
  if (next.key !== calendar.key) { calendar = next; selectedDay = next.selectedDay; render(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshDate(); if (scheduleOrigin === 'hosted-cache') loadSchedule(); } });
window.addEventListener('focus', () => { refreshDate(); if (scheduleOrigin === 'hosted-cache') loadSchedule(); });
setInterval(refreshDate, 60000);

async function loadSchedule() {
  if (loading) return;
  // A file imported during this visit remains selected until the next reload.
  if (localSchedule && scheduleOrigin === 'device') return;
  loading = true;
  loadState = 'loading';
  render();
  try {
    if (hostedScheduleUrl) {
      try {
        const response = await fetch(hostedScheduleUrl, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not load hosted schedule');
        const hosted = validateLocalSchedule(await response.json());
        // A file imported while the request was running takes precedence for this visit.
        if (scheduleOrigin !== 'device' || !localSchedule) {
          scheduleOrigin = 'hosted';
          localSchedule = hosted;
          activities = hosted.activities;
          loadState = 'ready';
          $('import-status').textContent = '';
          renderDataNotice();
        }
        try { localStorage.setItem(HOSTED_STORAGE_KEY, JSON.stringify(hosted)); } catch { /* Offline copy is optional. */ }
        return;
      } catch {
        try {
          const stored = localStorage.getItem(HOSTED_STORAGE_KEY);
          if (stored && (scheduleOrigin !== 'device' || !localSchedule)) {
            const cached = validateLocalSchedule(JSON.parse(stored));
            scheduleOrigin = 'hosted-cache';
            localSchedule = cached;
            activities = cached.activities;
            loadState = 'ready';
            $('import-status').textContent = 'אין חיבור לאתר. מוצג עותק שמור במכשיר; ייתכן שאינו מעודכן.';
            renderDataNotice();
            return;
          }
        } catch { /* No valid offline copy is available. */ }
        loadState = localSchedule ? 'ready' : 'error';
        return;
      }
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        localSchedule = validateLocalSchedule(JSON.parse(stored));
        activities = localSchedule.activities;
        loadState = 'ready';
        renderDataNotice();
        return;
      }
    } catch { $('import-status').textContent = 'המערכת השמורה לא זמינה. מוצגת תוכנית ההדגמה.'; }
    const response = await fetch('./schedule.demo.json');
    if (!response.ok) throw new Error('Could not load demo');
    const demo = validateSchedule(await response.json());
    if (!localSchedule) { activities = demo; loadState = 'ready'; }
  } catch { if (!localSchedule) loadState = 'error'; }
  finally { loading = false; render(); }
}

loadSchedule();
window.addEventListener('online', () => { if (scheduleOrigin === 'hosted-cache') loadSchedule(); });
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(registration => registration.update())
    .catch(() => { /* Online use remains available if installation is unsupported. */ });
}
