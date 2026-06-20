import EditQuizForm from "./EditQuizForm";

export default function EditQuizPage({ params }) {
  return <EditQuizForm quizId={params.id} />;
}
