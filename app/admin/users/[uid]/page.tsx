import UserHistory from "./UserHistory";

export default async function Page({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;

  return <UserHistory uid={uid} />;
}
