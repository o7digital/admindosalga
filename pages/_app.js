import { ClerkProvider } from '@clerk/nextjs';
import { frFR } from '@clerk/localizations';
import '@/styles/globals.css';

export default function App({ Component, pageProps }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <Component {...pageProps} />;
  return (
    <ClerkProvider
      {...pageProps}
      localization={{
        ...frFR,
        signIn: { ...frFR.signIn, start: { ...frFR.signIn.start, subtitle: 'pour accéder à l’administration Dosalga' } },
        signUp: { ...frFR.signUp, start: { ...frFR.signUp.start, subtitle: 'pour accéder à l’administration Dosalga' } },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
      appearance={{ variables: { colorPrimary: '#ef0010', borderRadius: '0.5rem', fontFamily: 'Arial, Helvetica, sans-serif' } }}
    >
      <Component {...pageProps} />
    </ClerkProvider>
  );
}
