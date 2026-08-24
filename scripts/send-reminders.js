// Sends a Web Push reminder to every subscription in push-subs.json.
// Which message depends on which cron fired (SCHEDULE env, set by the workflow).
const webpush = require('web-push');
const fs = require('fs');

let subs = [];
try { subs = JSON.parse(fs.readFileSync('push-subs.json', 'utf8')); } catch (e) {}
if (!subs.length) { console.log('no subscribers yet'); process.exit(0); }

webpush.setVapidDetails('mailto:smodak@turnriver.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const localDate = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10); // US Pacific

// Half-dose 2×/wk (Mon + Thu) from Aug 10; full weekly dose before that.
const reta = {
  title: '💉 Reta day',
  body: localDate() >= '2026-08-10'
    ? 'Half-dose tonight — rotate the site. Hydrate hard.'
    : 'Tonight is the dose — rotate the site. Hydrate hard.'
};
const FIXED = {
  '0 15 * * 6': { title: '⚖️ Weigh-in day', body: 'Same scale, same time. Log it — Omega precision, Rolex patience.' },
  '0 1 * * 5':  reta, // Thu 6pm PT
  '0 1 * * 2':  reta  // Mon 6pm PT
};
// Per-date overrides mirror TRAIN in app-src.html — update both together.
const TRAIN = {
  // 4-week run on-ramp — no running since Aug 1 (knee) + calf history. Duration ramps, not just the ratio.
  '2026-08-23': 'Double walk — ramp starts Tuesday. Knee gets one more day.',
  '2026-08-25': '🏋️ Push + 🏃 25 min run-walk — 4 min jog / 2 min walk. Zone 2.',
  '2026-08-26': '🏃 30 min run-walk — 4 min jog / 2 min walk',
  '2026-08-30': '🏃 35 min run-walk — 6 min jog / 2 min walk',
  '2026-09-01': '🏋️ Push + 🏃 25 min run-walk — 6 / 2',
  '2026-09-02': '🏃 30 min run-walk — 6 / 2',
  '2026-09-08': '🏋️ Push + 🏃 30 min run-walk — 9 min jog / 1 min walk',
  '2026-09-09': '🏃 35 min run-walk — 9 / 1',
  '2026-09-13': '🏃 45 min continuous — first one. Conversational the whole way.',
  '2026-09-16': '🏃 35 min easy — Zone 2',
  // travel — walks only, no gym
  '2026-09-04': 'Nashville — outdoor walks, AM + PM',
  '2026-09-05': 'Nashville — outdoor walks, AM + PM',
  '2026-09-06': 'Nashville — 🏃 40 min run-walk outdoors, 9 / 1',
  '2026-09-07': 'Nashville — outdoor walks, AM + PM',
  '2026-10-13': 'Conference — 🏃 30 min easy + outdoor walks',
  '2026-10-14': 'Conference — 🏃 40 min easy + outdoor walks',
  '2026-10-15': 'Conference — 🏃 4 × 4 min hard / 3 easy. Substitutes for soccer this week.',
  '2026-10-18': 'Retreat — 🏃 40 min easy + outdoor walks',
  '2026-10-19': 'Retreat — outdoor walks, AM + PM',
  '2026-10-20': 'Retreat — 🏃 30 min easy + outdoor walks',
  // ✈️ Thailand Nov 18–28 — outdoor only, keep the base ticking
  '2026-11-18': 'Thailand — 🏃 30 min easy', '2026-11-19': 'Thailand — outdoor walks',
  '2026-11-20': 'Thailand — outdoor walks',  '2026-11-21': 'Thailand — 🏃 40 min easy',
  '2026-11-22': 'Thailand — 🏃 50 min easy', '2026-11-23': 'Thailand — outdoor walks',
  '2026-11-24': 'Thailand — 🏃 30 min easy', '2026-11-25': 'Thailand — 🏃 40 min easy',
  '2026-11-26': 'Thailand — outdoor walks',  '2026-11-27': 'Thailand — outdoor walks',
  '2026-11-28': 'Thailand — 🏃 50 min easy'
};
// Sun–Sat rhythm (v3, VO2max / soccer block) — mirrors DEF in app-src.html
const WORKOUT = [
  '🏃 50 min easy run — Zone 2, conversational. Biggest block of the week.',
  '🏋️ Lower + calves + abs — press, quads, hams, calf raises slow. Double walk.',
  '🏋️ Push + 🏃 30 min easy run — bench, incline DB, laterals',
  '🏃 40 min easy run — Zone 2. Walk when the HR climbs.',
  '⚽ SOCCER — the hard day. Pogo hops before, electrolytes at half.',
  '🏋️ Pull + double walk — pulldown, row, pull-ups, curls',
  '🦵 Calves + plyo, 15 min — light. Double walk.'
];
const msg = FIXED[process.env.SCHEDULE] ||
  { title: '🏋️ Today', body: TRAIN[localDate()] || WORKOUT[new Date().getDay()] };

Promise.allSettled(subs.map(s => webpush.sendNotification(s, JSON.stringify(msg))))
  .then(rs => {
    const ok = rs.filter(r => r.status === 'fulfilled').length;
    console.log(`sent "${msg.title}" — ${ok}/${subs.length} ok`);
    rs.filter(r => r.status === 'rejected').forEach(r => console.log('fail:', r.reason.statusCode || r.reason.message));
  });
