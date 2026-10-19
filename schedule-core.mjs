export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
export const CHILDREN = [
  { id: 'eden', name: 'עדן', initial: 'ע' },
  { id: 'noya', name: 'נויה', initial: 'נ' },
  { id: 'tali', name: 'טלי', initial: 'ט' }
];
export const TIME_ZONE = 'Asia/Jerusalem';

// Use calendar arithmetic in UTC after obtaining the Israeli calendar date.
// This avoids DST shifts when finding the six dates of the displayed week.
export function calendarFor(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const get = type => Number(parts.find(part => part.type === type).value);
  const today = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  const saturday = today.getUTCDay() === 6;
  const selectedDay = saturday ? 0 : today.getUTCDay();
  const sunday = new Date(today);
  sunday.setUTCDate(today.getUTCDate() + (saturday ? 1 : -selectedDay));
  const dates = DAYS.map((_, day) => { const date = new Date(sunday); date.setUTCDate(sunday.getUTCDate() + day); return date; });
  return { today, dates, selectedDay, saturday, key: today.toISOString().slice(0, 10) };
}

export function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function validateActivities(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.activities) || data.activities.length > 2000) throw new Error('Invalid schedule');
  const ids = new Set();
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const item of data.activities) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Invalid activity ID');
    ids.add(item.id);
    if (!CHILDREN.some(child => child.id === item.child)) throw new Error('Unknown child');
    if (!Number.isInteger(item.day) || item.day < 0 || item.day > 5) throw new Error('Day must be Sunday through Friday');
    if (!['school', 'activity'].includes(item.type)) throw new Error('Invalid activity type');
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100) throw new Error('Invalid activity title');
    if (item.period !== undefined && (!Number.isInteger(item.period) || item.period < 1 || item.period > 20)) throw new Error('Invalid lesson number');
    const hasStart = item.start !== undefined;
    const hasEnd = item.end !== undefined;
    if (hasStart !== hasEnd) throw new Error('Partial activity time');
    if (hasStart) {
      if (!clock.test(item.start) || !clock.test(item.end) || minutes(item.end) <= minutes(item.start)) throw new Error('Invalid activity time');
    } else if (item.type !== 'school' || item.period === undefined) {
      throw new Error('Untimed activities need a lesson number');
    }
  }
  return data.activities;
}

export function validateSchedule(data) {
  if (data?.demo !== true) throw new Error('Invalid demo schedule');
  return validateActivities(data);
}

// A private import stays in this browser. Keep only supported fields and never
// mix its real lessons with synthetic activities from the bundled demo.
export function validateLocalSchedule(data) {
  if (data?.demo !== false || !Array.isArray(data.children) || !data.children.length || new Set(data.children).size !== data.children.length || !data.children.every(id => CHILDREN.some(child => child.id === id))) throw new Error('Invalid child list');
  const activities = validateActivities(data).map(item => {
    if (!data.children.includes(item.child)) throw new Error('Activity belongs to an unlisted child');
    return { id: item.id, child: item.child, day: item.day, ...(item.start === undefined ? {} : { start: item.start, end: item.end }), type: item.type, title: item.title, ...(item.period === undefined ? {} : { period: item.period }) };
  });
  const notes = data.notes ?? [];
  if (!Array.isArray(notes) || notes.length > 30 || notes.some(note => !note || !data.children.includes(note.child) || !Number.isInteger(note.day) || note.day < 0 || note.day > 5 || typeof note.text !== 'string' || note.text.length > 500)) throw new Error('Invalid schedule notes');
  return { version: 1, demo: false, children: [...data.children], activities, notes: notes.map(({child, day, text}) => ({child, day, text})) };
}

export function selectActivities(activities, { day, child = 'all', showSchool = true, afternoonClubsOnly = false }) {
  return activities.filter(item => item.day === day && (child === 'all' || item.child === child) && (showSchool || item.type !== 'school') && (!afternoonClubsOnly || (item.type === 'activity' && minutes(item.start) >= 12 * 60)))
    .sort((a, b) => (a.start === undefined ? Infinity : minutes(a.start)) - (b.start === undefined ? Infinity : minutes(b.start)) || (a.start === undefined ? (a.period ?? 0) - (b.period ?? 0) : minutes(a.end) - minutes(b.end)) || CHILDREN.findIndex(c => c.id === a.child) - CHILDREN.findIndex(c => c.id === b.child) || a.id.localeCompare(b.id));
}

export function groupByTime(activities) {
  const groups = new Map();
  for (const item of activities) {
    const label = item.start ?? `שיעור ${item.period}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return [...groups].map(([time, items]) => ({ time, items }));
}
