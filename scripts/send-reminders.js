// Sends a Web Push reminder to every subscription in push-subs.json.
// Which message depends on which cron fired (SCHEDULE env, set by the workflow).
const webpush = require('web-push');
const fs = require('fs');

let subs = [];
try { subs = JSON.parse(fs.readFileSync('push-subs.json', 'utf8')); } catch (e) {}
if (!subs.length) { console.log('no subscribers yet'); process.exit(0); }

webpush.setVapidDetails('mailto:smodak@turnriver.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const localDate = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10); // US Pacific

// Mirrors isDose() in app-src.html — update both together.
//   Aug 10–27 : half-dose 2×/wk, Mon + Thu
//   Aug 28–Sep 12 : gap, no doses (returns null → nothing is sent). He skipped the Sep 10 restart.
//   from Sep 13 : one full dose, SUNDAY nights — off soccer night, and he is re-titrating the mg
const retaMsg = () => {
  const ds = localDate();
  if (ds >= '2026-08-28' && ds < '2026-09-13') return null; // the gap ran Aug 28 – Sep 12
  return {
    title: '💉 Reta day',
    body: (ds >= '2026-08-10' && ds < '2026-08-28')
      ? 'Half-dose tonight — rotate the site. Hydrate hard.'
      : 'Tonight is the dose — rotate the site. Hydrate hard.'
  };
};
const FIXED = {
  '0 15 * * 6': { title: '⚖️ Weigh-in day', body: 'Same scale, same time. Log it — Omega precision, Rolex patience.' },
  '0 1 * * 1':  retaMsg // Sun 6pm PT (Mon 01:00 UTC) — moved off Thursday so it misses soccer night
};
// Per-date overrides mirror TRAIN in app-src.html — update both together.
const TRAIN = {
  // ⚽ the five booked soccer Thursdays
  '2026-08-27': '⚽ SOCCER — pogo hops before, electrolytes at half',
  '2026-09-03': '⚽ SOCCER — pogo hops before, electrolytes at half',
  '2026-09-10': '🌳 AM walk · ⚽ SOCCER tonight — pogo hops before, electrolytes at half · skip lunch, chicken dinner, 💉 Reta',
  '2026-09-17': '🌳 AM walk · ⚽ SOCCER tonight — pogo hops before, electrolytes at half. Eat 2–3h before.',
  '2026-09-24': '⚽ SOCCER — last booked one. Make it count.',
  // 5-week run on-ramp on the Tue/Wed/Sat run days — 65 → 75 → 85 → 95 → 105 → 110 min/wk
  '2026-08-25': '🏠 Abs + 🏃 20 min run-walk — 4 min jog / 2 min walk',
  '2026-08-26': '🏋️ Push + 🏃 20 min run-walk — 4 / 2',
  '2026-08-29': '🏃 25 min run-walk — 4 / 2. Zone 2 the whole way.',
  '2026-09-01': '🏠 Abs + 🏃 25 min run-walk — 6 min jog / 2 min walk',
  '2026-09-02': '🏋️ Push + 🏃 25 min run-walk — 6 / 2',
  '2026-09-05': '🏃 25 min run-walk — 6 / 2',
  // from Sep 8 the v6 layout takes over — Wednesday is PULL, so the on-ramp rides Tue/Sat only
  // 🔥 Sep 8–13 debloat week — AM session + PM walk daily, push slides to Sunday
  '2026-09-08': '🏃 25 min run-walk — 9 jog / 1 walk · 🌳 PM walk · lunch only, no dinner',
  '2026-09-09': '🏋️ Pull — pulldown, row, pull-ups, face pulls, curls · 🌳 PM walk · lunch only, no dinner',
  '2026-09-11': '⏳ FAST DAY · 🏋️ Legs + calves — press, quads, hams, slow calf raises · 🌳 PM walk',
  '2026-09-12': '🏃 35 min run-walk — 9 / 1 · 🌳 PM walk · dinner chicken only · ⚖️ weigh-in',
  '2026-09-13': '🏋️ Push — bench, incline DB, laterals, fly, pushdown · 🌳 PM walk · small lunch + dinner',
  // 🔁 v7 week — Mon recovery, 4 lifts, evenings back. Zone 2 is 118–137 bpm (max HR 196 confirmed).
  '2026-09-14': '🚶 Recovery day — AM incline walk 45–60 min · PM outdoor walk. No lifting.',
  '2026-09-15': '🏃 AM 3 mi easy — keep HR under 137 · PM light arms + calf protocol',
  '2026-09-16': '🌳 AM walk · PM GYM: pull — pulldown, row, pull-ups, face pulls, curls',
  '2026-09-18': '🏋️ AM GYM: push — bench, incline DB, laterals, fly, pushdown · 🌳 PM walk',
  '2026-09-19': '🏃 AM 45 min easy (~4 mi) — cap it here, do not chase 5 · PM rest',
  '2026-09-20': '🏋️ AM GYM: legs + calves — press, quads, hams, slow calf raises · 🌳 PM walk · 💉 Reta tonight',
  '2026-09-22': '🏠 Abs + 🏃 30 min easy',
  '2026-09-26': '🏃 45 min easy — Zone 2',
  // ✈️ travel — no gym, runs and walks still work
  '2026-09-04': 'Nashville — outdoor walks, AM + PM',
  '2026-09-06': '😴 Nashville — rest day. Walk if you feel like it.',
  '2026-09-07': 'Nashville — outdoor walks, AM + PM',
  '2026-10-14': 'Conference — 🏃 30 min easy + outdoor walks',
  '2026-10-19': 'Retreat — outdoor walks, AM + PM',
  '2026-11-18': 'Thailand — 🏃 30 min easy', '2026-11-19': 'Thailand — outdoor walks',
  '2026-11-20': 'Thailand — outdoor walks',  '2026-11-21': 'Thailand — 🏃 40 min easy',
  '2026-11-23': 'Thailand — outdoor walks',  '2026-11-25': 'Thailand — 🏃 30 min easy',
  '2026-11-26': 'Thailand — outdoor walks',  '2026-11-27': 'Thailand — outdoor walks'
};
// Sun–Sat rhythm (v5, 2026-08-24) — mirrors DEF in app-src.html.
// Gym Mon/Wed/Fri · Tue home abs + run · Thu soccer-or-4×4 · Sat long run · SUNDAY REST.
// Mirrors DEF in app-src.html (v6, morning-only PPL + 4 walk/run days) — update both together.
const WORKOUT = [
  '🚶 Walk only — fasted day. 30–40 min easy, nothing structured.',
  '🏋️ GYM: push — bench, incline DB, laterals, fly, pushdown',
  '🏠 Abs + 🏃 35 min easy — leg raises, twists, planks, pogo hops',
  '🏋️ GYM: pull — pulldown, row, pull-ups, face pulls, curls',
  '🏃 4 × 4 min hard / 3 easy — replaces soccer this week',
  '🏋️ GYM: legs + calves — press, quads, hams, slow calf raises',
  '🏃 50 min long easy run — biggest Zone 2 block of the week'
];
let msg = FIXED[process.env.SCHEDULE];
if (typeof msg === 'function') msg = msg();
if (msg === null) { console.log('reta washout — no dose reminder tonight'); process.exit(0); }
if (!msg) msg = { title: '🏋️ Today', body: TRAIN[localDate()] || WORKOUT[new Date().getDay()] };

Promise.allSettled(subs.map(s => webpush.sendNotification(s, JSON.stringify(msg))))
  .then(rs => {
    const ok = rs.filter(r => r.status === 'fulfilled').length;
    console.log(`sent "${msg.title}" — ${ok}/${subs.length} ok`);
    rs.filter(r => r.status === 'rejected').forEach(r => console.log('fail:', r.reason.statusCode || r.reason.message));
  });
