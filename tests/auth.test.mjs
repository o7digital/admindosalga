import test from 'node:test';
import assert from 'node:assert/strict';
import { adminUser, createAuthGuard, publicUser, sameOrigin } from '../lib/auth.mjs';
import { safeRedirect } from '../lib/authRedirect.mjs';

function clerkUser(email = 'olivier.steineur@gmail.com', status = 'verified') {
  return {
    id: 'user_clerk_admin',
    firstName: 'Olivier',
    lastName: 'Steineur',
    primaryEmailAddressId: 'email_primary',
    emailAddresses: [{ id: 'email_primary', emailAddress: email, verification: { status } }],
    privateMetadata: { secret: 'never expose' },
  };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const request = (overrides = {}) => ({ method: 'GET', headers: { host: 'admin.dosalga.test' }, ...overrides });

test('only the two verified primary administrator emails grant access', () => {
  for (const email of ['olivier.steineur@gmail.com', 'dosalga.fac@gmail.com', ' OLIVIER.STEINEUR@GMAIL.COM ']) {
    assert.equal(adminUser(clerkUser(email)).authorized, true);
  }
  for (const email of ['stranger@gmail.com', 'olivier.steineur@gmail.com.attacker.test', '']) {
    assert.equal(adminUser(clerkUser(email)).authorized, false);
  }
  assert.equal(adminUser(clerkUser(undefined, 'unverified')).authorized, false);
  assert.equal(adminUser({ ...clerkUser(), banned: true }).authorized, false);
  const secondary = clerkUser('stranger@gmail.com');
  secondary.emailAddresses.push({ id: 'email_secondary', emailAddress: 'olivier.steineur@gmail.com', verification: { status: 'verified' } });
  assert.equal(adminUser(secondary).authorized, false, 'an authorized secondary email must not grant access');
  secondary.primaryEmailAddressId = null;
  assert.equal(adminUser(secondary).authorized, false);
});

test('public profile contains no Clerk metadata or credentials', () => {
  assert.deepEqual(publicUser(adminUser(clerkUser())), {
    id: 'user_clerk_admin', email: 'olivier.steineur@gmail.com', name: 'Olivier Steineur',
  });
  const nameless = clerkUser();
  nameless.firstName = null;
  nameless.lastName = null;
  assert.equal(adminUser(nameless).name, nameless.emailAddresses[0].emailAddress);
});

test('API guard blocks anonymous, unauthorized and unavailable sessions before the handler', async () => {
  for (const [session, status] of [[null, 401], [adminUser(clerkUser('stranger@gmail.com')), 403], [new Error('Clerk unavailable'), 503]]) {
    let called = false;
    const guard = createAuthGuard(async () => {
      if (session instanceof Error) throw session;
      return session;
    });
    const res = response();
    await guard(() => { called = true; })(request(), res);
    assert.equal(res.statusCode, status);
    assert.equal(called, false);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    if (status === 403) assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED');
  }
});

test('API guard uses verified identity for edits and prevents public caching', async () => {
  const user = adminUser(clerkUser());
  const req = request({ method: 'POST', headers: { host: 'admin.dosalga.test', origin: 'https://admin.dosalga.test' }, body: { editor: 'attacker@test.invalid' } });
  const res = response();
  await createAuthGuard(async () => user)((currentReq, currentRes) => {
    assert.equal(currentReq.authUser.id, user.id);
    assert.equal(currentReq.body.editor, user.email);
    currentRes.setHeader('cache-control', 'public, max-age=60');
    return currentRes.status(200).json({ success: true });
  })(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.equal(res.headers.vary, 'Cookie');
});

test('write requests require the same origin even with a valid session', async () => {
  const guard = createAuthGuard(async () => adminUser(clerkUser()));
  for (const origin of [undefined, 'null', 'https://attacker.test', 'https://admin.dosalga.test.attacker.test']) {
    const res = response();
    await guard(() => assert.fail('cross-origin write reached handler'))(request({ method: 'POST', headers: { host: 'admin.dosalga.test', origin } }), res);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(sameOrigin(request({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } })), true);
  assert.equal(sameOrigin(request({ headers: { host: 'localhost:3000', origin: 'http://localhost:4000' } })), false);
});

test('post-login redirects reject external URLs and authentication loops', () => {
  for (const destination of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example', '/sign-in', '/sign-up/verify-email-address', '/api/products', '/change-password', '/access-denied', ['/']]) {
    assert.equal(safeRedirect(destination), '/');
  }
  assert.equal(safeRedirect('/?market=MX#products'), '/?market=MX#products');
  assert.equal(safeRedirect('/account/security'), '/account/security');
});
