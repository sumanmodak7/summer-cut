#!/usr/bin/env node
// Decrypts the deployed/committed index.html payload back into app-src.html.
// Run this after Garage (in-app Claude) edits so the local source stays in sync:
//   git pull && node extract.js <passcode>
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const pass = process.argv[2];
if (!pass) { console.error('usage: node extract.js <passcode>'); process.exit(1); }

const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = idx.match(/const P = (\{[^}]*\});/);
if (!m) { console.error('payload marker not found in index.html'); process.exit(1); }

const P = JSON.parse(m[1]);
const key = crypto.pbkdf2Sync(pass, Buffer.from(P.salt, 'base64'), 300000, 32, 'sha256');
const ct = Buffer.from(P.ct, 'base64');
const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(P.iv, 'base64'));
d.setAuthTag(ct.slice(-16));
const src = Buffer.concat([d.update(ct.slice(0, -16)), d.final()]);

fs.writeFileSync(path.join(__dirname, 'app-src.html'), src);
console.log(`app-src.html updated — ${src.length.toLocaleString()} bytes decrypted`);
