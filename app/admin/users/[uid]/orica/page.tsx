import UserOricaManager from "./UserOricaManager";

export default async function AdminUserOricaPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;

  return <UserOricaManager uid={uid} />;
}
