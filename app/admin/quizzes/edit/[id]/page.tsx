import EditQuizForm from "./EditQuizForm";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditQuizForm quizId={id} />;
}
