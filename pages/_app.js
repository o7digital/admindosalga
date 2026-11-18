import { ClerkProvider } from '@clerk/nextjs';
import { frFR } from '@clerk/localizations';
import '@/styles/globals.css';

export default function App({ Component, pageProps }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <Component {...pageProps} />;
  return (
    <ClerkProvider
      {...pageProps}
      localization={frFR}
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
