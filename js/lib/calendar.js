/** Calendar exports: .ics files (any calendar app) and Google / Outlook web deep links. */
import { isoLocalStamp, timeMin, minToHHMM, addDays, uid } from './util.js';

const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const fold = (line) => { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); };
const stampUTC = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

/** events: [{date:'2026-11-20', start:'18:00', minutes:45, title, description, location}] */
export function buildICS(events, calName = 'FOODIE meals') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FOODIE//Meal Planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEsc(calName)}`];
  for (const e of events) {
    const startMin = timeMin(e.start);
    const endMin = startMin + (e.minutes || 45);
    const endDate = endMin >= 1440 ? addDays(e.date, 1) : e.date;
    lines.push('BEGIN:VEVENT', `UID:${uid('foodie')}@foodie.local`, `DTSTAMP:${stampUTC()}`,
      `DTSTART:${isoLocalStamp(e.date, e.start)}`, `DTEND:${isoLocalStamp(endDate, minToHHMM(endMin))}`,
      fold(`SUMMARY:${icsEsc(e.title)}`), e.description ? fold(`DESCRIPTION:${icsEsc(e.description)}`) : '', e.location ? fold(`LOCATION:${icsEsc(e.location)}`) : '', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

const range = (e) => {
  const startMin = timeMin(e.start); const endMin = startMin + (e.minutes || 45);
  return [isoLocalStamp(e.date, e.start), isoLocalStamp(endMin >= 1440 ? addDays(e.date, 1) : e.date, minToHHMM(endMin))];
};

export function googleCalendarLink(e) {
  const [s, en] = range(e);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${s}/${en}`, details: e.description || '' });
  if (e.location) p.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function outlookCalendarLink(e) {
  const iso = (d, t) => `${d}T${t}:00`;
  const startMin = timeMin(e.start); const endMin = startMin + (e.minutes || 45);
  const p = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title, body: e.description || '',
    startdt: iso(e.date, e.start), enddt: iso(endMin >= 1440 ? addDays(e.date, 1) : e.date, minToHHMM(endMin)) });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}
