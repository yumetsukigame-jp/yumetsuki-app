import QuestExperience from "@/components/quest/QuestExperience";

export default async function QuestPlayPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <QuestExperience key={runId} selectedRunId={runId} />;
}
