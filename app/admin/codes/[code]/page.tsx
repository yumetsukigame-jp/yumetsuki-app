import CodeDetail from "./CodeDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return <CodeDetail code={code} />;
}
