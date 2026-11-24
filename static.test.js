import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { startTestServer } from './helpers.js';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const built = fs.existsSync(path.join(dist, 'index.html'));
let t;
before(async () => { if (built) t = await startTestServer({ clientDist: dist }); });
after(async () => { if (t) await t.close(); });

test('serves the built SPA, deep-link fallback, embedded game and CSP', { skip: !built && 'client not built' }, async () => {
  const home = await fetch(t.baseUrl + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<div id="root">/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  const deep = await fetch(t.baseUrl + '/play/snake');
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /<div id="root">/);
  const ext = await fetch(t.baseUrl + '/ext/memory/game.js');
  assert.equal(ext.status, 200);
  assert.equal((await fetch(t.baseUrl + '/api/nope')).status, 404);
});
