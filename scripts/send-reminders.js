// Sends a Web Push reminder to every subscription in push-subs.json.
// Which message depends on which cron fired (SCHEDULE env, set by the workflow).
const webpush = require('web-push');
const fs = require('fs');

let subs = [];
try { subs = JSON.parse(fs.readFileSync('push-subs.json', 'utf8')); } catch (e) {}
if (!subs.length) { console.log('no subscribers yet'); process.exit(0); }

webpush.setVapidDetails('mailto:smodak@turnriver.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const FIXED = {
  '0 13 * * 6': { title: '⚖️ Weigh-in day', body: 'Same scale, same time. Log it — Omega precision, Rolex patience.' },
  '0 23 * * 4': { title: '💉 Reta day', body: 'Tonight is the dose — rotate the site. Hydrate hard.' }
};
const WORKOUT = [
  'Light day — easy walk + mobility, still hit 10k',
  'Chest day — bench, incline DB, fly, dips',
  'Legs day — press, quad machine, hamstring machine, calves',
  'Back day — pulldown, row, pull-ups, face pulls',
  'Incline walk — 45–60 min, zone 2',
  'Arms + shoulders — OHP, laterals, curls, triceps',
  'Run day — VO2. Lights out and away we go 🏁'
];

const msg = FIXED[process.env.SCHEDULE] ||
  { title: '🏋️ Tonight', body: WORKOUT[new Date().getDay()] };

Promise.allSettled(subs.map(s => webpush.sendNotification(s, JSON.stringify(msg))))
  .then(rs => {
    const ok = rs.filter(r => r.status === 'fulfilled').length;
    console.log(`sent "${msg.title}" — ${ok}/${subs.length} ok`);
    rs.filter(r => r.status === 'rejected').forEach(r => console.log('fail:', r.reason.statusCode || r.reason.message));
  });
