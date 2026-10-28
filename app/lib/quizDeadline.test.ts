import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "firebase/firestore";
import {
  compareQuizDeadlines,
  formatQuizDeadline,
  quizDeadlineInput,
} from "./quizDeadline";
import { parseJstDateTime } from "./dateTime";

test("sorts earliest deadlines first, unset deadlines last and ties by ID", () => {
  const early = Timestamp.fromDate(new Date("2026-11-04T14:09:00Z"));
  const late = Timestamp.fromDate(new Date("2026-11-05T14:09:00Z"));
  const quizzes = [
    { id: "unset" },
    { id: "late", deadlineAt: late },
    { id: "b", deadlineAt: early },
    { id: "a", deadlineAt: early },
  ];
  assert.deepEqual(quizzes.sort(compareQuizDeadlines).map((quiz) => quiz.id), [
    "a", "b", "late", "unset",
  ]);
  assert.equal(compareQuizDeadlines({}, {}), 0);
});

test("displays and edits deadlines in JST, preserving the stored instant", () => {
  const deadline = Timestamp.fromDate(new Date("2026-11-04T14:09:46Z"));
  assert.equal(formatQuizDeadline(deadline), "2026/11/04 23:09:46 JST");
  assert.equal(quizDeadlineInput(deadline), "2026-11-04T23:09:46");
  assert.equal(
    parseJstDateTime(quizDeadlineInput(deadline)).getTime(),
    deadline.toMillis()
  );
  assert.equal(formatQuizDeadline(null), "未設定");
  assert.equal(quizDeadlineInput(null), "");
});
