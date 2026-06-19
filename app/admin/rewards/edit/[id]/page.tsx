import EditRewardForm from "./EditRewardForm";

export default function EditRewardPage({ params }) {
  const id = params.id; // ← これだけでいい

  return <EditRewardForm id={id} />;
}

