import assert from 'node:assert/strict';

// Read-only checks against a running app; no Clerk users or database rows are created.
const base = process.env.AUTH_TEST_BASE_URL;
if (!base) throw new Error('AUTH_TEST_BASE_URL is required.');
const configured = process.env.AUTH_TEST_CLERK_CONFIGURED === '1';
const anonymousStatus = configured ? 401 : 503;

async function request(path, { cookie, headers, ...options } = {}) {
  return fetch(new URL(path, base), {
    redirect: 'manual', ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
  });
}

for (const path of ['/', '/account', '/account/security', '/access-denied']) {
  const result = await request(path);
  assert.ok([302, 307].includes(result.status), `${path}: anonymous visitors must be redirected`);
  assert.match(result.headers.get('location'), /sign-in/);
}
for (const path of ['/sign-in', '/sign-in?unavailable=1', '/sign-up', '/sign-up?unavailable=1', '/sign-up/verify-email-address']) {
  const result = await request(path);
  assert.equal(result.status, configured ? 200 : 503, path);
  const html = await result.text();
  assert.ok(html.includes('Dosalga'));
  if (configured) assert.ok(html.includes('class="clerk-auth"'), `${path}: the Clerk form must remain available after recovery`);
  assert.match(result.headers.get('cache-control'), /private, no-store/);
}
for (const path of ['/api/products', '/api/auth/session', '/api/health']) {
  const result = await request(path);
  assert.equal(result.status, anonymousStatus, path);
  assert.match(result.headers.get('cache-control'), /private, no-store/);
  assert.equal((await request(path, { cookie: `dosalga_admin_session=${'f'.repeat(64)}` })).status, anonymousStatus, 'legacy cookies must not authorize requests');
  const bypass = await request(path, { headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' } });
  assert.ok([401, 403, 503].includes(bypass.status), 'middleware bypass must not expose data');
}
{
  const result = await request('/api/wp/intake', { method: 'POST', headers: { Origin: base } });
  assert.equal(result.status, anonymousStatus, 'automatic catalogue intake requires an authenticated admin');
}
for (const path of ['/api/auth/login', '/api/auth/password', '/api/auth/logout']) {
  const result = await request(path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'olivier.steineur@gmail.com', password: 'obsolete-password' }) });
  assert.ok([401, 403, 404, 503].includes(result.status), 'legacy login endpoints must not create sessions');
  assert.equal(result.headers.get('set-cookie'), null);
}
if (process.env.AUTH_TEST_SESSION_COOKIE) {
  const cookie = process.env.AUTH_TEST_SESSION_COOKIE;
  let result = await request('/api/auth/session', { cookie });
  assert.equal(result.status, 200);
  const { user } = await result.json();
  assert.ok(['olivier.steineur@gmail.com', 'dosalga.fac@gmail.com'].includes(user.email));
  assert.equal(user.password_hash, undefined);
  assert.equal((await request('/', { cookie })).status, 200);
  result = await request('/api/products', { cookie, method: 'POST', headers: { Origin: 'https://attacker.invalid' } });
  assert.equal(result.status, 403);
  console.log('Authorized Clerk session and cross-origin protection passed.');
} else {
  console.log('SKIP: authenticated Clerk session checks (AUTH_TEST_SESSION_COOKIE missing).');
}
if (process.env.AUTH_TEST_DENIED_SESSION_COOKIE) {
  const cookie = process.env.AUTH_TEST_DENIED_SESSION_COOKIE;
  assert.equal((await request('/api/auth/session', { cookie })).status, 403);
  for (const path of ['/', '/sign-in?unavailable=1', '/sign-up?unavailable=1']) {
    const result = await request(path, { cookie });
    assert.match(result.headers.get('location'), /access-denied/);
  }
  console.log('Unauthorized Clerk account checks passed.');
} else {
  console.log('SKIP: unauthorized Clerk account checks (AUTH_TEST_DENIED_SESSION_COOKIE missing).');
}
console.log('HTTP auth checks passed: public authentication routes, protected pages and APIs, legacy cookies, retired endpoints and middleware bypass.');
