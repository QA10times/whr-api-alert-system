// Copies non-TS assets (email templates) into dist after tsc.
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', 'src', 'alerts', 'templates');
const to = path.join(__dirname, '..', 'dist', 'alerts', 'templates');
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
