#!/usr/bin/env node
// One-time local helper: authorize a SEPARATE Whoop OAuth grant for the Actions sync.
// (The local MCP server has its own token chain in ~/.whoop-mcp — Whoop rotates refresh
// tokens on use, so the two consumers must never share a chain.)
// Usage: WHOOP_KEY=<base64> node scripts/whoop-auth.js <client_id> <client_secret>
// Prints an auth URL, listens on http://localhost:3000/callback, then writes whoop-tokens.enc.
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');

// Creds: argv, or fall back to .mcp.json in the repo root (gitignored, local only).
// Key: WHOOP_KEY env, or a file named by WHOOP_KEY_FILE — keeps secrets off the CLI.
let CID = process.argv[2], SEC = process.argv[3];
if (!CID || !SEC) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.mcp.json'), 'utf8')).mcpServers.whoop.env;
    CID = m.WHOOP_CLIENT_ID; SEC = m.WHOOP_CLIENT_SECRET;
  } catch (e) {}
}
const keyB64 = process.env.WHOOP_KEY ||
  (process.env.WHOOP_KEY_FILE ? fs.readFileSync(process.env.WHOOP_KEY_FILE, 'utf8').trim() : '');
const KEY = Buffer.from(keyB64, 'base64');
if (!CID || !SEC || KEY.length !== 32) {
  console.error('usage: WHOOP_KEY=<base64 32B> node scripts/whoop-auth.js [client_id] [client_secret]');
  process.exit(1);
}
const REDIRECT = 'http://localhost:3000/callback';
const SCOPE = 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline';
const state = crypto.randomBytes(8).toString('hex');
const authUrl = 'https://api.prod.whoop.com/oauth/oauth2/auth?' + new URLSearchParams({
  response_type: 'code', client_id: CID, redirect_uri: REDIRECT, scope: SCOPE, state
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:3000');
  if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
  try {
    if (u.searchParams.get('state') !== state) throw new Error('state mismatch');
    const r = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: u.searchParams.get('code'),
        client_id: CID, client_secret: SEC, redirect_uri: REDIRECT
      })
    });
    if (!r.ok) throw new Error('token exchange failed: ' + r.status + ' ' + await r.text());
    const t = await r.json();
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const body = JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token });
    const ct = Buffer.concat([c.update(body), c.final(), c.getAuthTag()]);
    fs.writeFileSync(path.join(__dirname, '..', 'whoop-tokens.enc'),
      JSON.stringify({ iv: iv.toString('base64'), ct: ct.toString('base64') }));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Authorized — whoop-tokens.enc written. Close this tab.</h2>');
    console.log('whoop-tokens.enc written');
    server.close(); setTimeout(() => process.exit(0), 200);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(String(e));
    console.error(e); server.close(); setTimeout(() => process.exit(1), 200);
  }
});
server.listen(3000, () => {
  console.log('Authorize here:\n' + authUrl);
  if (process.platform === 'win32') // best-effort: pop the browser
    require('child_process').exec('start "" "' + authUrl.replace(/&/g, '^&') + '"', { shell: 'cmd.exe' });
});
