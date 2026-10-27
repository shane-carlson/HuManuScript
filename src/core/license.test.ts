import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVATION_LIMIT,
  deriveLicenseStatus,
  displayKey,
  GRACE_MS,
  remainingDays,
  TRIAL_DAYS,
  TRIAL_MS,
  type LicenseRecord,
} from './license.ts';

const checkout = {
  gated: true,
  checkoutUrl: 'https://buy.polar.sh/polar_cl_eIHOifn9kcCTQijdu9kyp7anFWbu9kqVqEIke2EDeo8',
  configured: true,
};

function status(record: LicenseRecord, now: number, gated = true) {
  return deriveLicenseStatus(record, now, { ...checkout, gated });
}

test('license status skips the gate in development', () => {
  const s = status({}, Date.parse('2026-08-17T12:00:00.000Z'), false);
  assert.equal(s.kind, 'dev');
  assert.equal(s.mayWrite, true);
  assert.equal(s.gated, false);
});

test('license status starts a 15-day trial with 15 days remaining', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status({ trialStartedAt: new Date(t0).toISOString() }, t0);
  assert.equal(TRIAL_DAYS, 15);
  assert.equal(ACTIVATION_LIMIT, 3);
  assert.equal(s.kind, 'trial');
  assert.equal(s.mayWrite, true);
  assert.equal(s.daysLeft, 15);
  assert.equal(s.activationLimit, 3);
});

test('license status expires when the trial window elapses', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status({ trialStartedAt: new Date(t0).toISOString() }, t0 + TRIAL_MS);
  assert.equal(s.kind, 'expired');
  assert.equal(s.mayWrite, false);
  assert.equal(s.daysLeft, 0);
});

test('license status still has one day left just before the trial ends', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status({ trialStartedAt: new Date(t0).toISOString() }, t0 + TRIAL_MS - 1);
  assert.equal(s.kind, 'trial');
  assert.equal(s.daysLeft, 1);
});

test('license status treats a granted Polar key as licensed', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status(
    {
      trialStartedAt: new Date(t0).toISOString(),
      key: 'HM-ABC123-XYZ789',
      activationId: 'act-1',
      lastValidatedStatus: 'granted',
      lastValidatedAt: new Date(t0).toISOString(),
    },
    t0,
  );
  assert.equal(s.kind, 'licensed');
  assert.equal(s.mayWrite, true);
  assert.equal(s.displayKey, '****-XYZ789');
});

test('license status blocks writing when Polar revokes the key', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status(
    {
      key: 'HM-ABC123-XYZ789',
      activationId: 'act-1',
      lastValidatedStatus: 'revoked',
    },
    t0,
  );
  assert.equal(s.kind, 'expired');
  assert.equal(s.mayWrite, false);
});

test('license status keeps writing during Polar offline grace', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status(
    {
      key: 'HM-ABC123-XYZ789',
      activationId: 'act-1',
      lastValidatedStatus: 'offline',
      lastValidatedAt: new Date(t0).toISOString(),
    },
    t0 + GRACE_MS - 1000,
  );
  assert.equal(s.kind, 'grace');
  assert.equal(s.mayWrite, true);
});

test('license status expires after Polar offline grace', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  const s = status(
    {
      key: 'HM-ABC123-XYZ789',
      activationId: 'act-1',
      lastValidatedStatus: 'offline',
      lastValidatedAt: new Date(t0).toISOString(),
    },
    t0 + GRACE_MS + 1,
  );
  assert.equal(s.kind, 'expired');
  assert.equal(s.mayWrite, false);
});

test('license status masks the key and ceil-rounds remaining days', () => {
  const t0 = Date.parse('2026-08-17T12:00:00.000Z');
  assert.equal(displayKey('HM-HELLO-WORLD12'), '****-ORLD12');
  assert.equal(remainingDays(t0 + 24 * 60 * 60 * 1000 - 1, t0), 1);
});
