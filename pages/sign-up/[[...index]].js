import ClerkAuthPage from '@/components/ClerkAuthPage';

export default function SignUpPage(props) {
  return <ClerkAuthPage {...props} signUp />;
}

export async function getServerSideProps(context) {
  const { authenticationPage } = await import('@/lib/adminAuth');
  return authenticationPage(context);
}
