import EditRewardForm from "./EditRewardForm";

export default function EditRewardPage({ params }) {
  const id = params.id; // ← await 不要、これが正しい

  return <EditRewardForm id={id} />;
}
