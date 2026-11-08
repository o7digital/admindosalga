import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const SESSION_COOKIE = 'dosalga_admin_session';
export const SESSION_SECONDS = 12 * 60 * 60;

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
}

export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 12) return 'Utilisez au moins 12 caractères.';
  if (password.length > 128) return 'Utilisez au maximum 128 caractères.';
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64, scryptOptions);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [algorithm, salt, digest] = String(encoded).split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const actual = await deriveKey(password, salt, 64, scryptOptions);
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}

export const newSessionToken = () => randomBytes(32).toString('hex');
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const validSessionToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export function sessionCookie(token, secure, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

