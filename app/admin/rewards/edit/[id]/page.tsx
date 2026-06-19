import EditRewardForm from "./EditRewardForm";

export default function EditRewardPage({ params }) {
  const id = params?.id; // ← これが重要

  return <EditRewardForm id={id} />;
}
