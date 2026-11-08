import Head from 'next/head';

export default function AuthLayout({ title, children }) {
  return (
    <main className="auth-page">
      <Head><title>{`${title} · Dosalga Admin`}</title><meta name="robots" content="noindex, nofollow" /></Head>
      <img src="https://www.dosalga.store/logo-dosalga.png" alt="Dosalga" />
      <section className="auth-card">{children}</section>
      <p className="auth-footer">DOSALGA · PRODUCT CONTROL</p>
    </main>
  );
}
