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
  // knee healing — no running until the ramp starts Sep 19
  '2026-08-22': 'Double walk day — knee still healing, no run yet',
  '2026-08-29': 'Double walk day — knee still healing, no run yet',
  '2026-09-12': 'Double walk day — last one before the run ramp',
  // travel — walks only
  '2026-09-04': 'Nashville — outdoor walks, AM + PM',
  '2026-09-05': 'Nashville — outdoor walks, AM + PM',
  '2026-09-06': 'Nashville — outdoor walks, AM + PM',
  '2026-09-07': 'Nashville — outdoor walks, then shop tomorrow 🛒',
  '2026-10-13': 'Conference — outdoor walks, AM + PM',
  '2026-10-14': 'Conference — outdoor walks, AM + PM',
  '2026-10-15': 'Conference — outdoor walks, AM + PM',
  '2026-10-18': 'Retreat — outdoor walks, AM + PM',
  '2026-10-19': 'Retreat — outdoor walks, AM + PM',
  '2026-10-20': 'Retreat — outdoor walks, AM + PM',
  // return-to-run ramp
  '2026-09-19': '🏃 Walk-run wk 1 — 6 × (1 min jog / 2 min walk). Easy does it.',
  '2026-09-26': '🏃 Walk-run wk 2 — 6 × (2 min jog / 2 min walk)',
  '2026-10-03': '🏃 Walk-run wk 3 — 5 × (3 min jog / 2 min walk)',
  '2026-10-10': '🏃 First continuous run — 20 min easy, conversational'
};
// Sun–Sat weekly rhythm (v2) — mirrors DEF in app-src.html
const WORKOUT = [
  'Single walk / rest day — still hit 10k',
  'Chest + double walk — bench, incline DB, fly, dips',
  'Back + single walk — pulldown, row, pull-ups, face pulls',
  'Arms + shoulders + single walk — OHP, laterals, curls, triceps',
  'Legs + single walk — press, quad machine, hamstring machine, calves',
  'Double walk day — outdoor AM + incline, no lift',
  'Run day — VO2. Lights out and away we go 🏁'
];
const msg = FIXED[process.env.SCHEDULE] ||
  { title: '🏋️ Today', body: TRAIN[localDate()] || WORKOUT[new Date().getDay()] };

Promise.allSettled(subs.map(s => webpush.sendNotification(s, JSON.stringify(msg))))
  .then(rs => {
    const ok = rs.filter(r => r.status === 'fulfilled').length;
    console.log(`sent "${msg.title}" — ${ok}/${subs.length} ok`);
    rs.filter(r => r.status === 'rejected').forEach(r => console.log('fail:', r.reason.statusCode || r.reason.message));
  });
