const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const config = require('./polarConfig.cjs');
const polar = require('./polar.cjs');
const license = require('./license.cjs');

const BENEFIT = '0bc31d71-a7a8-413b-9e43-a6a8262f63f2';

test('Polar config is the public HuManuScript product, with no access token', () => {
  assert.equal(config.organizationId, 'cfd3c2a6-2654-4565-8c15-e8ca7d25bff6');
  assert.equal(config.productId, '6488b14c-d63a-4814-b29f-c9ba42ec132f');
  assert.equal(config.benefitId, BENEFIT);
  assert.equal(config.checkoutUrl, 'https://buy.polar.sh/polar_cl_eIHOifn9kcCTQijdu9kyp7anFWbu9kqVqEIke2EDeo8');
  assert.equal(config.apiBase(), 'https://api.polar.sh');
  assert.equal(config.isConfigured(), true);
  assert.equal(config.accessToken, undefined);
  assert.equal(config.webhookSecret, undefined);
  const source = fs.readFileSync(require.resolve('./polarConfig.cjs'), 'utf8');
  assert.equal(/POLAR_ACCESS_TOKEN|webhook secret|whsec_/i.test(source), false);
});

test('Polar HTTP errors map 404 and 403 to stable codes', () => {
  assert.equal(polar.polarHttpError(404, null).code, 'not-found');
  assert.equal(polar.polarHttpError(403, null).code, 'activation-limit');
  assert.match(polar.polarHttpError(403, null).message, /3 machines/);
  assert.match(polar.polarHttpError(422, { detail: 'bad' }).message, /bad/);
});

test('Electron license derive stays aligned with the 15-day trial', () => {
  const now = Date.parse('2026-08-17T12:00:00.000Z');
  const opts = { gated: true, checkoutUrl: 'https://example.com', configured: true };
  const trial = license.deriveLicenseStatus({ trialStartedAt: new Date(now).toISOString() }, now, opts);
  assert.equal(trial.kind, 'trial');
  assert.equal(trial.mayWrite, true);
  assert.equal(trial.daysLeft, 15);
  const expired = license.deriveLicenseStatus({ trialStartedAt: new Date(now).toISOString() }, now + license.TRIAL_MS, opts);
  assert.equal(expired.kind, 'expired');
  assert.equal(expired.mayWrite, false);
});

test('customer-portal license calls', async (t) => {
await t.test('activate calls the customer-portal endpoint and remembers the key', async () => {
  const file = license.licensePath();
  fs.rmSync(file, { force: true });
  const original = global.fetch;
  /** @type {string[]} */
  const paths = [];
  global.fetch = async (url, init) => {
    const href = String(url);
    paths.push(href);
    const body = JSON.parse(init.body);
    assert.equal(body.organization_id, config.organizationId);
    assert.equal(body.key, 'HM-TEST-KEY-123456');
    assert.equal('access_token' in body, false);
    assert.equal(init.headers.Authorization, undefined);
    if (href.endsWith('/activate')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'act-1',
          license_key: {
            status: 'granted',
            benefit_id: BENEFIT,
            key: body.key,
          },
        }),
      };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  try {
    const result = await license.activate('  HM-TEST-KEY-123456  ');
    assert.equal(result.ok, true);
    assert.equal(paths.length, 1);
    assert.match(paths[0], /\/v1\/customer-portal\/license-keys\/activate$/);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(stored.key, 'HM-TEST-KEY-123456');
    assert.equal(stored.activationId, 'act-1');
    assert.equal(stored.benefitId, BENEFIT);
    assert.equal(stored.lastValidatedStatus, 'granted');
    assert.equal(license.getStoredKey(), 'HM-TEST-KEY-123456');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    global.fetch = original;
    fs.rmSync(file, { force: true });
  }
});

await t.test('activate rejects a key from another Polar benefit and does not store it', async () => {
  const file = license.licensePath();
  fs.rmSync(file, { force: true });
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'act-other',
      license_key: { status: 'granted', benefit_id: '00000000-0000-4000-8000-000000000000' },
    }),
  });
  try {
    const result = await license.activate('OTHER-PRODUCT-KEY');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'wrong-benefit');
    assert.equal(fs.existsSync(file), false);
  } finally {
    global.fetch = original;
    fs.rmSync(file, { force: true });
  }
});

await t.test('validate posts the organization id and key to the customer portal', async () => {
  const original = global.fetch;
  /** @type {Record<string, unknown> | undefined} */
  let sent;
  global.fetch = async (url, init) => {
    assert.match(String(url), /\/v1\/customer-portal\/license-keys\/validate$/);
    sent = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'key-1',
        status: 'granted',
        benefit_id: BENEFIT,
        activation: { id: 'act-9' },
      }),
    };
  };
  try {
    const result = await polar.validate('HM-VALID', 'act-9');
    assert.equal(result.status, 'granted');
    assert.equal(result.activationId, 'act-9');
    assert.equal(sent.organization_id, config.organizationId);
    assert.equal(sent.key, 'HM-VALID');
    assert.equal(sent.activation_id, 'act-9');
  } finally {
    global.fetch = original;
  }
});
});
