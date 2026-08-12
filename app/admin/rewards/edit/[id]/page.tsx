import EditRewardForm from "./EditRewardForm";

export default async function EditRewardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <EditRewardForm id={id} />;
}

