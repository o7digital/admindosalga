import ClerkAuthPage from '@/components/ClerkAuthPage';

export default function SignInPage(props) {
  return <ClerkAuthPage {...props} />;
}

export async function getServerSideProps(context) {
  const { authenticationPage } = await import('@/lib/adminAuth');
  return authenticationPage(context);
}
