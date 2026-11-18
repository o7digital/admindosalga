export default function ChangePassword() { return null; }

export async function getServerSideProps() {
  return { redirect: { destination: '/account/security', permanent: false } };
}
