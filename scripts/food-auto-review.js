#!/usr/bin/env node
// Nightly auto-review of the food inbox. Decrypts food-inbox.json, sends every pending item
// (text and/or photo) to Claude for a cal/protein estimate, and writes the numbers back.
// The app fill-merges them on next open. Same encryption + commit pattern as whoop-sync.js.
//
// Env: WHOOP_KEY (base64, 32 bytes) · ANTHROPIC_API_KEY
// Exits 0 and does nothing if there's no key or nothing pending, so the cron stays quiet.
//
// Anything Claude can't identify is left pending on purpose — better an empty number than a
// confident wrong one, and a human can resolve it with scripts/food-review.js.
const fs = require('fs');
const crypto = require('crypto');

const INBOX = 'food-inbox.json';
const MODEL = 'claude-sonnet-5';

const ak = process.env.ANTHROPIC_API_KEY;
if (!ak) { console.log('No ANTHROPIC_API_KEY — skipping.'); process.exit(0); }
if (!process.env.WHOOP_KEY) { console.log('No WHOOP_KEY — skipping.'); process.exit(0); }
if (!fs.existsSync(INBOX)) { console.log('No food-inbox.json — nothing queued.'); process.exit(0); }

const KEY = Buffer.from(process.env.WHOOP_KEY, 'base64');
if (KEY.length !== 32) { console.error(`WHOOP_KEY is ${KEY.length} bytes, expected 32.`); process.exit(1); }

const dec = j => {
  const ct = Buffer.from(j.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(j.iv, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'));
};
const enc = o => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(o), 'utf8'), c.final(), c.getAuthTag()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64') };
};

const SYSTEM = [
  'You estimate nutrition for a food log. The user logs what they ate as a short note, a photo, or both.',
  'Reply with ONLY valid JSON, no markdown fences:',
  '{"n":"short name, max 28 chars","c":calories,"p":protein_grams}',
  'If the photo shows a packaged product, read the label; if the label is not legible, use known values for that product.',
  'If it shows a plate or bowl, estimate from visible portion cues and typical serving sizes.',
  'Assume normal home or restaurant portions when an amount is unstated; a bare protein like "chicken" means about 6oz cooked.',
  'Round calories to the nearest 10 and protein to the nearest gram.',
  'If you genuinely cannot tell what the food is or the portion is unguessable, return {"c":null,"p":null,"why":"one short reason"} instead of guessing.'
].join(' ');

async function estimate(item) {
  const content = [];
  if (item.ph) {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(item.ph);
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  const note = item.n && item.n !== '📷 Photo' ? item.n : '';
  content.push({ type: 'text', text: note ? `Logged as: ${note}` : 'Estimate this meal.' });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ak, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, system: SYSTEM, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  const txt = j.content.map(b => b.text || '').join('').replace(/```(json)?/g, '').trim();
  return JSON.parse(txt);
}

(async () => {
  const o = dec(JSON.parse(fs.readFileSync(INBOX, 'utf8')));
  const items = o.items || [];
  const todo = items.filter(i => i.c == null);
  if (!todo.length) { console.log(`Nothing pending (${items.length} item(s) in inbox).`); process.exit(0); }

  console.log(`${todo.length} pending of ${items.length}...`);
  let done = 0, errors = 0;
  for (const it of todo) {
    try {
      const g = await estimate(it);
      if (g.c == null) { console.log(`  ~ ${it.id}  left pending — ${g.why || 'unidentifiable'}`); continue; }
      it.c = Math.round(+g.c) || 0;
      it.p = Math.round(+g.p) || 0;
      if (g.n) it.n = String(g.n).slice(0, 48);
      delete it.ph; // photo has served its purpose; keeps the committed file small
      done++;
      console.log(`  ✓ ${it.id}  ${it.n} — ${it.c} cal / ${it.p}g`);
    } catch (e) {
      errors++;
      console.log(`  ! ${it.id}  failed — ${e.message}`);
    }
  }

  if (!done) {
    console.log('Nothing resolved; leaving the inbox untouched.');
    // Fail loudly if the API rejected everything — a silently-green cron that never resolves
    // anything is worse than a red one. An expired key is the likely cause.
    if (errors) { console.error(`All ${errors} call(s) failed — check ANTHROPIC_API_KEY.`); process.exit(1); }
    process.exit(0);
  }
  fs.writeFileSync(INBOX, JSON.stringify(enc({ ...o, items, reviewed: new Date().toISOString() })));
  console.log(`Resolved ${done}/${todo.length}. food-inbox.json rewritten.`);
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
