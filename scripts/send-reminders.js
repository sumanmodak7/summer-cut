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
// Per-date overrides mirror TRAIN in app-src.html; fall back to the weekday default below.
const TRAIN = {
  '2026-08-03': 'Chest — bench, incline DB, fly, dips (+ incline & outdoor walk)',
  '2026-08-04': 'Back — pulldown, row, pull-ups, face pulls (+ incline & outdoor walk)',
  '2026-08-05': 'Arms + shoulders — OHP, laterals, curls, triceps (+ incline & outdoor walk)',
  '2026-08-06': 'Legs — press, quad machine, hamstring machine, calves (+ incline & outdoor walk)',
  '2026-08-07': 'Travel — outdoor walks only, AM + PM',
  '2026-08-08': 'Travel — outdoor walks only, AM + PM',
  '2026-08-09': 'Travel — outdoor walks only, AM + PM',
  '2026-08-10': 'Travel home — outdoor walks, then shop tonight 🛒',
  '2026-08-11': '⚡ Chest + 2× incline walks. OMAD.',
  '2026-08-12': '⚡ Back + 2× incline walks. OMAD.',
  '2026-08-13': '⚡ Arms + shoulders + 2× incline walks. OMAD.',
  '2026-08-14': '⚡ Legs + 2× incline walks. OMAD.',
  '2026-08-15': '⚡ Run day (VO2) + 2× incline walks. OMAD.',
  '2026-08-16': '⚡ Chest + 2× incline walks. OMAD — closes the super-send.'
};
const WORKOUT = [
  'Walk day — incline + outdoor, still hit 10k',
  'Chest day — bench, incline DB, fly, dips (+ walks)',
  'Legs day — press, quad machine, hamstring machine, calves (+ walks)',
  'Back day — pulldown, row, pull-ups, face pulls (+ walks)',
  'Walk day — incline + outdoor, zone 2',
  'Arms + shoulders — OHP, laterals, curls, triceps (+ walks)',
  'Run day — VO2 + outdoor walk. Lights out and away we go 🏁'
];
const msg = FIXED[process.env.SCHEDULE] ||
  { title: '🏋️ Today', body: TRAIN[localDate()] || WORKOUT[new Date().getDay()] };

Promise.allSettled(subs.map(s => webpush.sendNotification(s, JSON.stringify(msg))))
  .then(rs => {
    const ok = rs.filter(r => r.status === 'fulfilled').length;
    console.log(`sent "${msg.title}" — ${ok}/${subs.length} ok`);
    rs.filter(r => r.status === 'rejected').forEach(r => console.log('fail:', r.reason.statusCode || r.reason.message));
  });
