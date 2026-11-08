import { useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';

export default function ChangePassword({ user }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Déconnexion impossible. Réessayez.');
      try { window.localStorage.removeItem('dosalga-admin-products-v2'); } catch {}
      window.location.assign('/sign-in');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmPassword')) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.get('currentPassword'), password: form.get('password') }),
      });
      const result = await response.json();
      if (response.status === 401) { window.location.assign('/sign-in'); return; }
      if (!response.ok) throw new Error(result.message || 'Modification impossible.');
      window.location.assign('/');
    } catch (err) {
      setError(err.message || 'Modification impossible. Vérifiez votre connexion internet.');
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Changer le mot de passe">
      <span className="auth-eyebrow">SÉCURITÉ DU COMPTE</span>
      <h1>{user.mustChangePassword ? 'Créez votre mot de passe' : 'Changer le mot de passe'}</h1>
      <p>{user.mustChangePassword ? 'Remplacez votre mot de passe temporaire pour accéder à l’administration.' : 'Choisissez un nouveau mot de passe pour votre compte.'}</p>
      <p className="auth-email">{user.email}</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="currentPassword">{user.mustChangePassword ? 'Mot de passe temporaire' : 'Mot de passe actuel'}</label>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} />
        <label htmlFor="password">Nouveau mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-help" disabled={busy} />
        <small id="password-help">Au moins 12 caractères. Vous pouvez utiliser une phrase.</small>
        <label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer et accéder à l’admin'}</button>
      </form>
      <p className="auth-hint">Les autres sessions seront déconnectées après ce changement.</p>
      {user.mustChangePassword
        ? <button type="button" className="auth-back" onClick={logout} disabled={busy}>Se déconnecter</button>
        : <Link className="auth-back" href="/">Retour à l’admin</Link>}
    </AuthLayout>
  );
}

export async function getServerSideProps({ req, res }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const { getSession, publicUser } = await import('@/lib/adminAuth');
  try {
    const user = await getSession(req);
    if (!user) return { redirect: { destination: '/sign-in', permanent: false } };
    return { props: { user: publicUser(user) } };
  } catch {
    return { redirect: { destination: '/sign-in?unavailable=1', permanent: false } };
  }
}
