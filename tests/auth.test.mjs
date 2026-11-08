import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, normalizeEmail, passwordError, newSessionToken, tokenHash, sessionCookie, validSessionToken } from '../lib/auth.mjs';
import { safeRedirect } from '../lib/authRedirect.mjs';

test('passwords use unique salts and reject incorrect or malformed credentials', async () => {
  const password = 'Une phrase longue avec des espaces !';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword('a'.repeat(129), first), false);
  assert.equal(await verifyPassword(null, first), false);
  assert.equal(await verifyPassword(password, 'scrypt$invalid$broken'), false);
});

test('password policy permits passphrases and bounds input', () => {
  assert.ok(passwordError('short'));
  assert.ok(passwordError('a'.repeat(129)));
  assert.ok(passwordError(null));
  assert.equal(passwordError('a'.repeat(12)), null);
  assert.equal(passwordError('Une longue phrase de passe'), null);
  assert.equal(normalizeEmail('  OLIVIER.STEINEUR@GMAIL.COM  '), 'olivier.steineur@gmail.com');
});

test('sessions are opaque random secrets with secure cookie flags', () => {
  const first = newSessionToken();
  assert.notEqual(first, newSessionToken());
  assert.equal(validSessionToken(first), true);
  assert.equal(validSessionToken('forged'), false);
  assert.notEqual(tokenHash(first), first);
  assert.match(sessionCookie(first, true), /HttpOnly; SameSite=Lax; Max-Age=43200; Secure$/);
  assert.doesNotMatch(sessionCookie(first, false), /Secure/);
  assert.match(sessionCookie('', true, 0), /Max-Age=0/);
});

test('post-login redirects reject external URLs and authentication loops', () => {
  for (const destination of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example', '/sign-in', '/api/products', '/change-password', ['/']]) {
    assert.equal(safeRedirect(destination), '/');
  }
  assert.equal(safeRedirect('/?market=MX#products'), '/?market=MX#products');
});
