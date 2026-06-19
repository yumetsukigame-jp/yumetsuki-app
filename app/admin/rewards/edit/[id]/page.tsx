import EditRewardForm from "./EditRewardForm";

export default function EditRewardPage({ params }) {
  const { id } = params; // Next.js 16 では await 不要

  return <EditRewardForm id={id} />;
}
