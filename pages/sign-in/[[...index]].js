import { useState } from 'react';
import { useRouter } from 'next/router';
import AuthLayout from '@/components/AuthLayout';
import { safeRedirect } from '@/lib/authRedirect.mjs';

export default function SignInPage({ unavailable = false }) {
  const router = useRouter();
  const [error, setError] = useState(unavailable ? 'Connexion temporairement indisponible. Réessayez dans quelques instants.' : '');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Connexion impossible.');
      window.location.assign(result.user.mustChangePassword ? '/change-password' : safeRedirect(router.query.next));
    } catch (err) {
      setError(err.message || 'Connexion impossible. Vérifiez votre connexion internet.');
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Connexion">
      <span className="auth-eyebrow">ESPACE ADMINISTRATION</span>
      <h1>Bienvenue chez Dosalga</h1>
      <p>Connectez-vous avec votre email et votre mot de passe pour accéder à la gestion des boutiques.</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="vous@exemple.com" required maxLength={254} disabled={busy} />
        <label htmlFor="password">Mot de passe</label>
        <div className="auth-password">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} disabled={busy} />
          <button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Masquer' : 'Afficher'}</button>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      <p className="auth-hint">Accès réservé aux comptes autorisés. Le mot de passe temporaire doit être changé à la première connexion.</p>
    </AuthLayout>
  );
}

export async function getServerSideProps({ req, res, query }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const { getSession } = await import('@/lib/adminAuth');
  try {
    const user = await getSession(req);
    if (user) return { redirect: { destination: user.must_change_password ? '/change-password' : safeRedirect(query.next), permanent: false } };
    return { props: { unavailable: query.unavailable === '1' } };
  } catch {
    res.statusCode = 503;
    return { props: { unavailable: true } };
  }
}
