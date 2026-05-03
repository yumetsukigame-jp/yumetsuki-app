import CodeDetail from "./CodeDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;  // ← ★ これが必須

  return <CodeDetail code={code} />;
}
