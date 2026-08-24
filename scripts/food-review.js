#!/usr/bin/env node
// Review tool for the food inbox — the Claude Code half of the loop.
//
//   node scripts/food-review.js pull    decrypt food-inbox.json → review/inbox.json + review/*.jpg
//   node scripts/food-review.js push    re-encrypt review/inbox.json → food-inbox.json
//
// Workflow: `git pull` → `pull` → look at the photos, fill in c/p for each item in review/inbox.json
// → `push` → `git commit && git push`. The app merges the numbers on next open, matching on id.
//
// The key never lives in this file (public repo). Supply it as WHOOP_KEY, or drop the base64 in
// scratchpad/whoop-key.txt — same key that encrypts whoop-data.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const INBOX = path.join(ROOT, 'food-inbox.json');
const DIR = path.join(ROOT, 'review');
const PLAIN = path.join(DIR, 'inbox.json');

function key() {
  let k = process.env.WHOOP_KEY;
  if (!k) {
    const f = path.join(ROOT, 'scratchpad', 'whoop-key.txt');
    if (fs.existsSync(f)) k = fs.readFileSync(f, 'utf8').trim();
  }
  if (!k) {
    console.error('No key. Set WHOOP_KEY or create scratchpad/whoop-key.txt (base64, 32 bytes).');
    process.exit(1);
  }
  const b = Buffer.from(k, 'base64');
  if (b.length !== 32) { console.error(`Key is ${b.length} bytes, expected 32.`); process.exit(1); }
  return b;
}

const dec = (j, k) => {
  const ct = Buffer.from(j.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(j.iv, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'));
};
const enc = (o, k) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(o), 'utf8'), c.final(), c.getAuthTag()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64') };
};

const cmd = process.argv[2];

if (cmd === 'pull') {
  if (!fs.existsSync(INBOX)) { console.log('No food-inbox.json yet — nothing queued.'); process.exit(0); }
  const o = dec(JSON.parse(fs.readFileSync(INBOX, 'utf8')), key());
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.jpg')) fs.unlinkSync(path.join(DIR, f));

  const items = o.items || [];
  items.forEach((it, i) => {
    if (it.ph) {
      const b64 = String(it.ph).replace(/^data:image\/\w+;base64,/, '');
      const p = path.join(DIR, `${String(i + 1).padStart(2, '0')}-${it.id}.jpg`);
      fs.writeFileSync(p, Buffer.from(b64, 'base64'));
      it.photo_file = path.relative(ROOT, p).replace(/\\/g, '/');
      delete it.ph; // keep the editable file small; push re-attaches nothing, app drops the photo on resolve
    }
  });
  fs.writeFileSync(PLAIN, JSON.stringify(o, null, 2));

  console.log(`queued ${items.length} item(s)  ·  updated ${o.updated || '?'}\n`);
  for (const it of items) {
    const st = it.c == null ? 'PENDING' : `${it.c} cal · ${it.p}g`;
    console.log(`  ${it.id}  ${it.date}  ${st.padEnd(16)} ${it.photo_file ? '📷 ' + it.photo_file + '  ' : ''}${it.n}`);
  }
  console.log(`\nEdit ${path.relative(ROOT, PLAIN).replace(/\\/g, '/')} — set c and p on each item — then: node scripts/food-review.js push`);

} else if (cmd === 'push') {
  if (!fs.existsSync(PLAIN)) { console.error('Run `pull` first.'); process.exit(1); }
  const o = JSON.parse(fs.readFileSync(PLAIN, 'utf8'));
  const items = (o.items || []).map(({ photo_file, ...rest }) => rest);
  const unresolved = items.filter(i => i.c == null);
  fs.writeFileSync(INBOX, JSON.stringify(enc({ ...o, items, reviewed: new Date().toISOString() }, key())));
  console.log(`food-inbox.json written — ${items.length} item(s), ${items.length - unresolved.length} resolved` +
    (unresolved.length ? `, ${unresolved.length} still pending` : ''));
  console.log('Now: git add food-inbox.json && git commit && git push');

} else {
  console.log('usage: node scripts/food-review.js pull | push');
  process.exit(1);
}
