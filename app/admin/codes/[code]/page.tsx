import CodeDetail from "./CodeDetail";

export default async function Page({
  params,
}: {
  params: { code: string };
}) {
  const { code } = params;

  return <CodeDetail code={code} />;
}
