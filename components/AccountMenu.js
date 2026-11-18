import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';

export default function AccountMenu({ user }) {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    setError('');
    try {
      try { window.localStorage.removeItem('dosalga-admin-products-v2'); } catch {}
      await signOut({ redirectUrl: '/sign-in' });
    } catch {
      setError('Déconnexion impossible. Réessayez.');
      setBusy(false);
    }
  }
  return (
    <div className="account-menu">
      <div className="profile">
        <div className="avatar">{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</div>
        <div><strong>{user.name}</strong><span title={user.email}>{user.email}</span></div>
      </div>
      <div className="account-actions"><Link href="/account">Mon compte</Link><button type="button" onClick={logout} disabled={busy}>{busy ? 'Déconnexion…' : 'Déconnexion'}</button></div>
      {error && <p className="account-error" role="alert">{error}</p>}
    </div>
  );
}
