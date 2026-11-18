import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';
import AuthLayout from '@/components/AuthLayout';

export default function AccessDenied({ user }) {
  const { signOut } = useClerk();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function switchAccount() {
    setBusy(true);
    setError('');
    try {
      await signOut({ redirectUrl: '/sign-in' });
    } catch {
      setError('Déconnexion impossible. Réessayez.');
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Accès réservé">
      <span className="auth-eyebrow">ESPACE ADMINISTRATION</span>
      <h1>Accès réservé</h1>
      <p>Le compte {user.email || 'connecté'} n’est pas autorisé à accéder à l’administration Dosalga. Utilisez votre adresse administrateur vérifiée.</p>
      <button className="auth-submit" type="button" onClick={switchAccount} disabled={busy}>{busy ? 'Déconnexion…' : 'Utiliser un autre compte'}</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </AuthLayout>
  );
}

export async function getServerSideProps(context) {
  const { authenticatedPage } = await import('@/lib/adminAuth');
  const result = await authenticatedPage(context, { adminOnly: false });
  if (result.props?.user.authorized) return { redirect: { destination: '/', permanent: false } };
  return result;
}
