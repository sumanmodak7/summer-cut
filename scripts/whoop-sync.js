#!/usr/bin/env node
// Whoop → whoop-data.json sync (runs in GitHub Actions, 3× daily).
// Token chain lives in whoop-tokens.enc — Whoop rotates refresh tokens on every use,
// so the refreshed pair is written back BEFORE any data fetch and must be committed.
// Both files are AES-256-GCM encrypted with WHOOP_KEY (Actions secret; same key is
// baked into app-src.html so the app can decrypt whoop-data.json client-side).
// Env: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_KEY (base64 32 bytes)
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const need = k => process.env[k] || (console.error('missing env ' + k), process.exit(1));
const KEY = Buffer.from(need('WHOOP_KEY'), 'base64');
const CID = need('WHOOP_CLIENT_ID'), SEC = need('WHOOP_CLIENT_SECRET');
const ROOT = path.join(__dirname, '..');
const TOK = path.join(ROOT, 'whoop-tokens.enc'), OUT = path.join(ROOT, 'whoop-data.json');
const API = 'https://api.prod.whoop.com/developer/v2';

// {iv, ct} base64 JSON, GCM auth tag appended to ct — same format WebCrypto expects
function enc(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final(), c.getAuthTag()]);
  return JSON.stringify({ iv: iv.toString('base64'), ct: ct.toString('base64') });
}
function dec(str) {
  const { iv, ct } = JSON.parse(str);
  const b = Buffer.from(ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  d.setAuthTag(b.subarray(b.length - 16));
  return JSON.parse(Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()]).toString());
}

async function main() {
  const tokens = dec(fs.readFileSync(TOK, 'utf8'));

  const r = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tokens.refresh_token,
      client_id: CID, client_secret: SEC, scope: 'offline'
    })
  });
  if (!r.ok) { console.error('token refresh failed: ' + r.status + ' ' + await r.text()); process.exit(1); }
  const t = await r.json();
  fs.writeFileSync(TOK, enc({ access_token: t.access_token, refresh_token: t.refresh_token }));

  const H = { Authorization: 'Bearer ' + t.access_token };
  const get = async p => {
    const x = await fetch(API + p, { headers: H });
    if (!x.ok) throw new Error(p + ' → ' + x.status);
    return x.json();
  };
  const [rec, cyc, slp] = await Promise.all([
    get('/recovery?limit=14'), get('/cycle?limit=14'), get('/activity/sleep?limit=5')
  ]);

  const cycById = {};
  for (const c of cyc.records) cycById[c.id] = c;
  const locDate = c => { // cycle start shifted by its timezone_offset ("-07:00") → local calendar date
    if (!c) return null;
    const off = c.timezone_offset || '+00:00';
    const min = (off[0] === '-' ? -1 : 1) * ((+off.slice(1, 3)) * 60 + (+off.slice(4, 6)));
    return new Date(new Date(c.start).getTime() + min * 60000).toISOString().slice(0, 10);
  };

  const hist = rec.records.filter(x => x.score)
    .map(x => ({ d: locDate(cycById[x.cycle_id]), s: Math.round(x.score.recovery_score) }));
  const R = rec.records.find(x => x.score);
  const S = slp.records.find(x => x.score && !x.nap);
  const st = S && S.score.stage_summary;
  const C = cyc.records[0];

  const data = {
    up: new Date().toISOString(),
    rec: R ? {
      d: hist[0] && hist[0].d,
      s: Math.round(R.score.recovery_score),
      hrv: Math.round(R.score.hrv_rmssd_milli),
      rhr: Math.round(R.score.resting_heart_rate),
      spo2: R.score.spo2_percentage != null ? +R.score.spo2_percentage.toFixed(1) : null
    } : null,
    sleep: S ? {
      h: st ? +((st.total_in_bed_time_milli - st.total_awake_time_milli) / 3.6e6).toFixed(1) : null,
      perf: S.score.sleep_performance_percentage,
      eff: S.score.sleep_efficiency_percentage != null ? Math.round(S.score.sleep_efficiency_percentage) : null
    } : null,
    strain: C && C.score ? { s: +C.score.strain.toFixed(1), cal: Math.round(C.score.kilojoule / 4.184) } : null,
    hist
  };
  fs.writeFileSync(OUT, enc(data));
  console.log('whoop-data.json written — recovery ' + (data.rec ? data.rec.s + '%' : 'n/a'));
}
main().catch(e => { console.error(e); process.exit(1); });
