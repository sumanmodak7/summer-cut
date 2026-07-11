#!/usr/bin/env node
// Encrypts app-src.html behind a passcode and writes index.html (the deployable lock-screen app).
// Usage: node build.js <passcode>
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const pass = process.argv[2];
if (!pass) { console.error('usage: node build.js <passcode>'); process.exit(1); }

const src  = fs.readFileSync(path.join(__dirname, 'app-src.html'));
const salt = crypto.randomBytes(16);
const iv   = crypto.randomBytes(12);
const key  = crypto.pbkdf2Sync(pass, salt, 300000, 32, 'sha256');

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
// auth tag appended to ciphertext — matches WebCrypto AES-GCM format
const ct = Buffer.concat([cipher.update(src), cipher.final(), cipher.getAuthTag()]);

const payload = JSON.stringify({
  salt: salt.toString('base64'),
  iv:   iv.toString('base64'),
  ct:   ct.toString('base64')
});

const loader = fs.readFileSync(path.join(__dirname, 'loader.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), loader.split('"__PAYLOAD__"').join(payload));
console.log(`index.html built — ${ct.length.toLocaleString()} bytes encrypted (AES-256-GCM, PBKDF2 300k)`);
