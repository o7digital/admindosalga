import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword, tokenHash, SESSION_COOKIE } from '../lib/auth.mjs';

// Opt-in integration check against a running app and its configured database.
// A disposable user is removed in finally; no catalogue or real account is changed.
const base = process.env.AUTH_TEST_BASE_URL;
if (!base) throw new Error('AUTH_TEST_BASE_URL is required.');
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;
const client = new Client({ connectionString, ssl: connectionString.includes('localhost') || process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false } });
const email = `auth-check-${randomUUID()}@example.invalid`;
const password = randomUUID();
let userId;

async function request(path, { cookie, body, origin = base, ...options } = {}) {
  const response = await fetch(`${base}${path}`, {
    redirect: 'manual', ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...options.headers },
    ...(body ? { body: JSON.stringify(body), method: options.method || 'POST' } : {}),
  });
  return response;
}
const cookieOf = (response) => {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'expected session cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  return cookie.split(';')[0];
};

await client.connect();
try {
  const result = await client.query(`INSERT INTO admin_users (email, name, password_hash, password_expires_at)
    VALUES ($1, 'Auth integration check', $2, NOW() + INTERVAL '1 hour') RETURNING id`, [email, await hashPassword(password)]);
  userId = result.rows[0].id;
  let response = await request('/');
  assert.ok([302, 307].includes(response.status));
  assert.match(response.headers.get('location'), /sign-in/);
  assert.equal((await request('/api/products')).status, 401);
  assert.equal((await request('/api/auth/session')).status, 401);
  assert.equal((await request('/sign-in')).status, 200);

  response = await request('/api/auth/login', { body: { email, password }, origin: 'https://attacker.invalid' });
  assert.equal(response.status, 403, 'cross-origin login blocked');
  response = await request('/api/auth/login', { body: { email, password: 'incorrect-password' } });
  assert.equal(response.status, 401);
  response = await request('/api/auth/login', { body: { email: email.toUpperCase(), password } });
  assert.equal(response.status, 200);
  const temporaryCookie = cookieOf(response);
  assert.equal((await response.json()).user.mustChangePassword, true);
  response = await request('/api/products', { cookie: temporaryCookie });
  assert.equal(response.status, 403, 'temporary passwords cannot read the catalogue');
  assert.equal((await response.json()).code, 'PASSWORD_CHANGE_REQUIRED');
  response = await request('/', { cookie: temporaryCookie });
  assert.match(response.headers.get('location'), /change-password/);

  const personalPassword = randomUUID();
  response = await request('/api/auth/password', { cookie: temporaryCookie, body: { currentPassword: password, password: 'short' } });
  assert.equal(response.status, 400);
  response = await request('/api/auth/password', { cookie: temporaryCookie, body: { currentPassword: 'incorrect-password', password: personalPassword } });
  assert.equal(response.status, 400);
  response = await request('/api/auth/password', { cookie: temporaryCookie, body: { currentPassword: password, password: personalPassword } });
  assert.equal(response.status, 200);
  const personalCookie = cookieOf(response);
  assert.notEqual(personalCookie, temporaryCookie);
  assert.equal((await request('/api/auth/session', { cookie: temporaryCookie })).status, 401, 'password change revokes old sessions');
  response = await request('/api/auth/session', { cookie: personalCookie });
  assert.equal(response.status, 200);
  const sessionUser = (await response.json()).user;
  assert.equal(sessionUser.email, email);
  assert.equal(sessionUser.mustChangePassword, false);
  assert.equal(sessionUser.password_hash, undefined);
  response = await request('/', { cookie: personalCookie });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(email));
  response = await request('/api/health', { cookie: personalCookie });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  response = await request('/api/auth/logout', { cookie: personalCookie, method: 'POST', headers: { Origin: base } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/api/auth/session', { cookie: personalCookie })).status, 401, 'logout revokes the token in PostgreSQL');

  response = await request('/api/auth/login', { body: { email, password } });
  assert.equal(response.status, 401, 'temporary password no longer works');
  response = await request('/api/auth/login', { body: { email, password: personalPassword } });
  assert.equal(response.status, 200);
  const token = cookieOf(response).slice(SESSION_COOKIE.length + 1);
  await client.query("UPDATE admin_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1", [tokenHash(token)]);
  assert.equal((await request('/api/auth/session', { cookie: `${SESSION_COOKIE}=${token}` })).status, 401, 'expired session rejected');
  assert.equal((await request('/api/health', { cookie: `${SESSION_COOKIE}=${'f'.repeat(64)}` })).status, 401, 'forged cookie rejected');
  response = await request('/api/health', { headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' } });
  assert.equal(response.status, 401, 'API remains protected when middleware is bypassed');

  await client.query('UPDATE admin_users SET active = FALSE WHERE id = $1', [userId]);
  response = await request('/api/auth/login', { body: { email, password: personalPassword } });
  assert.equal(response.status, 401, 'disabled user rejected');
  await client.query("UPDATE admin_users SET active = TRUE, password_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [userId]);
  response = await request('/api/auth/login', { body: { email, password: personalPassword } });
  assert.equal(response.status, 401, 'expired temporary access rejected');
  for (let i = 0; i < 3; i++) response = await request('/api/auth/login', { body: { email, password: personalPassword } });
  assert.equal(response.status, 429, 'repeated attempts are rate limited');
  console.log('Auth integration passed: anonymous access, CSRF, forced password change, session rotation, logout, expiry, forged tokens, middleware bypass, disabled accounts and rate limiting.');
} finally {
  if (userId) await client.query('DELETE FROM admin_users WHERE id = $1', [userId]);
  await client.query('DELETE FROM admin_auth_attempts WHERE bucket = ANY($1)', [[tokenHash(`login:email:${email}`), ...(userId ? [tokenHash(`password:${userId}`)] : [])]]);
  await client.end();
}
