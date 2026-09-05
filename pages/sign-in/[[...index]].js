import Head from 'next/head';
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <main className="auth-page">
      <Head><title>Connexion · Dosalga Admin</title></Head>
      <img src="https://www.dosalga.store/logo-dosalga.png" alt="Dosalga" />
      {configured
        ? <SignIn routing="path" path="/sign-in" signUpUrl={null} fallbackRedirectUrl="/" />
        : <div className="auth-setup"><h1>Connexion Clerk à configurer</h1><p>Ajoutez les clés Clerk dans Vercel pour activer les comptes Olivier et Guillermo.</p></div>}
    </main>
  );
}
