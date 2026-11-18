import { UserProfile } from '@clerk/nextjs';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';

export default function AccountPage() {
  return (
    <AuthLayout title="Mon compte" wide>
      <UserProfile routing="path" path="/account" />
      <Link className="auth-back" href="/">Retour à l’admin</Link>
    </AuthLayout>
  );
}

export async function getServerSideProps(context) {
  const { authenticatedPage } = await import('@/lib/adminAuth');
  return authenticatedPage(context, { adminOnly: false });
}
