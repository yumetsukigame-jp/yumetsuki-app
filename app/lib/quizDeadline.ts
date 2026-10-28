import { formatJstDateTime } from "./dateTime";

type QuizDeadline = {
  id?: string;
  deadlineAt?: { toMillis(): number } | null;
};

export function compareQuizDeadlines(a: QuizDeadline, b: QuizDeadline): number {
  const first = a.deadlineAt?.toMillis() ?? Infinity;
  const second = b.deadlineAt?.toMillis() ?? Infinity;
  if (first !== second) return first < second ? -1 : 1;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

export function formatQuizDeadline(deadline: QuizDeadline["deadlineAt"]): string {
  return deadline
    ? formatJstDateTime(new Date(deadline.toMillis()))
    : "未設定";
}

export function quizDeadlineInput(deadline: QuizDeadline["deadlineAt"]): string {
  if (!deadline) return "";
  return new Date(deadline.toMillis() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19);
}
