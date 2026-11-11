import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountApp } from './http.mjs';
import { APP_RETURN_URL } from './tools.mjs';

const PASSWORD = 'Harbor-Key-1!';

async function json(response) {
  return { status: response.status, body: await response.json(), etag: response.headers.get('ETag') };
}

test('the landing page is branded HuManuScript and a from-app visit can return', async () => {
  const app = createAccountApp();
  const home = await app.handle(new Request('http://127.0.0.1:8787/'));
  const html = await home.text();
  assert.match(html, /HuManuScript/);
  assert.match(html, /Proof of humanity in Prose/);
  assert.equal(html.toLowerCase().includes('ready writer'), false);
  assert.equal(html.includes('sidequests'), false);
  const returned = await app.handle(new Request('http://127.0.0.1:8787/sign-in?from=app'));
  const signIn = await returned.text();
  assert.match(signIn, /Back to HuManuScript/);
  assert.match(signIn, new RegExp(APP_RETURN_URL.replace(':', '\\:')));
});

test('an account signs in, keeps a HuManuScript snapshot, and can name SpeakFiction later', async () => {
  const app = createAccountApp();
  const created = await json(await app.handle(new Request('http://127.0.0.1:8787/api/account/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'Ada@Example.com', password: PASSWORD, displayName: 'Ada', tool: 'humanuscript' }),
  })));
  assert.equal(created.status, 200);
  assert.equal(created.body.user.email, 'ada@example.com');
  const token = created.body.token;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const empty = await json(await app.handle(new Request('http://127.0.0.1:8787/api/sync/humanuscript', { headers: auth })));
  assert.equal(empty.body.snapshot, null);

  const wire = { version: 1, manuscripts: { 'book-1': { blocks: [] } }, notes: {}, certification: {} };
  const put = await json(await app.handle(new Request('http://127.0.0.1:8787/api/sync/humanuscript', {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(wire),
  })));
  assert.equal(put.status, 200);
  assert.ok(put.body.revision);

  const conflict = await json(await app.handle(new Request('http://127.0.0.1:8787/api/sync/humanuscript', {
    method: 'PUT',
    headers: { ...auth, 'If-Match': '"stale"' },
    body: JSON.stringify(wire),
  })));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.revision, put.body.revision);

  const saved = await json(await app.handle(new Request('http://127.0.0.1:8787/api/sync/humanuscript', { headers: auth })));
  assert.equal(saved.body.snapshot.manuscripts['book-1'].blocks.length, 0);
  assert.equal(saved.etag, `"${put.body.revision}"`);

  const speak = await json(await app.handle(new Request('http://127.0.0.1:8787/api/account/tools', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ tool: 'speakfiction' }),
  })));
  assert.equal(speak.body.tools.find((tool) => tool.id === 'speakfiction').connected, true);
  const blocked = await json(await app.handle(new Request('http://127.0.0.1:8787/api/sync/speakfiction', {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(wire),
  })));
  assert.equal(blocked.status, 404);

  const renamed = await json(await app.handle(new Request('http://127.0.0.1:8787/api/account/profile', {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ displayName: 'Ada Harbor' }),
  })));
  assert.equal(renamed.body.user.displayName, 'Ada Harbor');

  const wrong = await json(await app.handle(new Request('http://127.0.0.1:8787/api/account/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: 'nope' }),
  })));
  assert.equal(wrong.status, 401);
});
