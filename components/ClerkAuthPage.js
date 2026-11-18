import { ClerkFailed, ClerkLoading, SignIn, SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthLayout from '@/components/AuthLayout';
import { safeRedirect } from '@/lib/authRedirect.mjs';

export default function ClerkAuthPage({ configured, unavailable = false, signUp = false }) {
  const router = useRouter();
  const destination = safeRedirect(router.query.next);
  const title = signUp ? 'Créer un compte' : 'Connexion';
  return (
    <AuthLayout title={title}>
      <span className="auth-eyebrow">ESPACE ADMINISTRATION</span>
      <h1>{signUp ? 'Créez votre compte Dosalga' : 'Bienvenue chez Dosalga'}</h1>
      <p>{signUp ? 'Utilisez votre adresse administrateur et vérifiez votre email pour créer votre compte.' : 'Connectez-vous pour accéder à la gestion des boutiques Dosalga.'}</p>
      {!configured || unavailable ? (
        <p className="auth-error" role="alert">La connexion est temporairement indisponible. Réessayez dans quelques instants.</p>
      ) : (
        <div className="clerk-auth">
          <ClerkLoading><p role="status">Chargement du formulaire sécurisé…</p></ClerkLoading>
          <ClerkFailed><p className="auth-error" role="alert">Le formulaire n’a pas pu se charger. Actualisez la page pour réessayer.</p></ClerkFailed>
          {signUp
            ? <SignUp routing="path" path="/sign-up" signInUrl={`/sign-in?next=${encodeURIComponent(destination)}`} forceRedirectUrl={destination} />
            : <SignIn routing="path" path="/sign-in" signUpUrl={`/sign-up?next=${encodeURIComponent(destination)}`} forceRedirectUrl={destination} />}
        </div>
      )}
      <p className="auth-hint">L’accès à l’administration est réservé aux comptes autorisés.</p>
      <Link className="auth-back" href={`${signUp ? '/sign-in' : '/sign-up'}?next=${encodeURIComponent(destination)}`}>
        {signUp ? 'Déjà un compte ? Se connecter' : 'Première visite ? Créer un compte'}
      </Link>
    </AuthLayout>
  );
}
