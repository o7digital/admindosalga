import '@/styles/globals.css';
import { ClerkProvider } from '@clerk/nextjs';

export default function App({ Component, pageProps }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <Component {...pageProps} />;
  return <ClerkProvider {...pageProps}><Component {...pageProps} /></ClerkProvider>;
}
