import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword } from '../lib/auth.mjs';

// Run from a trusted terminal. Passwords are generated in memory and shown once;
// neither plaintext passwords nor hashes are written to the repository.
const reset = process.argv.includes('--reset');
if (reset) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await terminal.question('Réinitialiser les deux comptes et révoquer leurs sessions ? Tapez RESET : ');
  terminal.close();
  if (answer !== 'RESET') process.exit(1);
}
const connectionString = process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_NON_POOLING ou DATABASE_URL est requis.');
const client = new Client({ connectionString, ssl: connectionString.includes('localhost') || process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false } });
await client.connect();
try {
  const credentials = [];
  await client.query('BEGIN');
  for (const [email, name] of [['dosalga.fac@gmail.com', 'Dosalga'], ['olivier.steineur@gmail.com', 'Olivier Steineur']]) {
    const password = randomBytes(18).toString('base64url');
    const passwordHash = await hashPassword(password);
    const result = await client.query(reset ? `
      INSERT INTO admin_users (email, name, password_hash, password_expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
        must_change_password = TRUE, password_expires_at = EXCLUDED.password_expires_at,
        active = TRUE, updated_at = NOW()
      RETURNING id
    ` : `INSERT INTO admin_users (email, name, password_hash, password_expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '7 days') ON CONFLICT (email) DO NOTHING RETURNING id`, [email, name, passwordHash]);
    if (result.rowCount) {
      await client.query('DELETE FROM admin_sessions WHERE user_id = $1', [result.rows[0].id]);
      credentials.push({ email, password });
    } else console.log(`${email} : compte existant conservé.`);
  }
  await client.query('DELETE FROM admin_sessions WHERE expires_at < NOW()');
  await client.query("DELETE FROM admin_auth_attempts WHERE window_started_at < NOW() - INTERVAL '1 day'");
  await client.query('COMMIT');
  for (const { email, password } of credentials) console.log(`${email} : ${password}`);
  if (credentials.length) console.log('Mots de passe temporaires valables 7 jours, à changer à la première connexion.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
