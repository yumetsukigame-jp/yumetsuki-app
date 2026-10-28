/* eslint-disable @typescript-eslint/no-require-imports -- Node's test runner exercises the compiled Functions. */
const assert = require("node:assert/strict");
const { test, beforeEach, afterEach, mock } = require("node:test");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { submitQuizAnswer, confirmQuizAnswer, finalizeExpiredQuizzes } = require("../lib/quiz");
const { startOfJstDay, quizFinalizationTime } = require("../lib/common/quizDeadline");

const db = getFirestore();
const deadline = Date.parse("2026-11-04T23:09:00+09:00");
let documents;
let failAnnouncement;

function document(path) {
  return {
    path,
    id: path.split("/").pop(),
    collection: (name) => collection(`${path}/${name}`),
    get: async () => snapshot(path),
    set: async (data, options) => write(path, data, options),
  };
}

function snapshot(path) {
  return {
    id: path.split("/").pop(),
    ref: document(path),
    exists: documents.has(path),
    data: () => documents.get(path),
    get: (field) => documents.get(path)?.[field],
  };
}

function collection(path, filter) {
  return {
    path,
    doc: (id = "generated") => document(`${path}/${id}`),
    where: (field, operator, value) => collection(path, { field, operator, value }),
    get: async () => {
      const docs = [...documents.keys()]
        .filter((key) => key.startsWith(`${path}/`) &&
          key.split("/").length === path.split("/").length + 1)
        .filter((key) => !filter ||
          (filter.operator === "<" &&
            documents.get(key)[filter.field]?.toMillis() < filter.value.toMillis()))
        .map(snapshot);
      return { docs, size: docs.length };
    },
  };
}

function write(path, data, options) {
  const previous = documents.get(path) ?? {};
  const next = options?.merge ? { ...previous } : {};
  for (const [key, value] of Object.entries(data)) {
    if (value?.constructor === FieldValue.increment(1).constructor) {
      next[key] = (previous[key] ?? 0) + value.operand;
    } else if (value?.constructor === FieldValue.delete().constructor) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  documents.set(path, next);
}

function writer() {
  const writes = [];
  return {
    get: async (ref) => {
      if (failAnnouncement && ref.path === "homeAnnouncements/archiveUpdates") {
        failAnnouncement = false;
        throw new Error("simulated failure after awarding points");
      }
      return ref.get();
    },
    set: (ref, data, options) => writes.push(() => write(ref.path, data, options)),
    update: (ref, data) => writes.push(() => write(ref.path, data, { merge: true })),
    delete: (ref) => writes.push(() => documents.delete(ref.path)),
    commit: async () => writes.forEach((operation) => operation()),
  };
}

function setNow(millis) {
  mock.method(Date, "now", () => millis);
  mock.method(Timestamp, "now", () => Timestamp.fromMillis(millis));
}

function seedQuiz(id = "quiz", overrides = {}) {
  documents.set(`quizzes/${id}`, {
    title: "Test quiz",
    answer: "correct",
    maxAnswers: 2,
    rewardPoint: 100,
    deadlineAt: Timestamp.fromMillis(deadline),
    ...overrides,
  });
}

beforeEach(() => {
  documents = new Map();
  failAnnouncement = false;
  mock.method(db, "collection", collection);
  mock.method(db, "batch", writer);
  mock.method(db, "runTransaction", async (callback) => {
    const transaction = writer();
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  });
});

afterEach(() => mock.restoreAll());

test("JST day and next-day finalization work across year boundaries", () => {
  assert.equal(
    startOfJstDay(Date.parse("2026-12-31T23:59:59+09:00")),
    Date.parse("2026-12-31T00:00:00+09:00")
  );
  assert.equal(
    quizFinalizationTime(Date.parse("2026-12-31T00:00:00+09:00")),
    Date.parse("2027-01-01T00:05:00+09:00")
  );
});

test("accepts an answer immediately before the deadline using server time", async () => {
  setNow(deadline - 1);
  seedQuiz();
  const result = await submitQuizAnswer.run(
    { quizId: "quiz", answer: " correct " },
    { auth: { uid: "user" } }
  );
  assert.equal(result.createdAt, deadline - 1);
  assert.equal(result.newAnswerCount, 1);
  assert.equal(documents.get("quizzes/quiz/answers/user/items/generated").answer, "correct");
});

test("rejects answers at or after the deadline without writing", async () => {
  seedQuiz();
  for (const now of [deadline, deadline + 1]) {
    setNow(now);
    await assert.rejects(
      submitQuizAnswer.run({ quizId: "quiz", answer: "correct" }, { auth: { uid: "user" } }),
      { code: "failed-precondition" }
    );
    assert.equal(documents.size, 1);
  }
});

test("rejects logged-out users, closed quizzes and exhausted answer limits", async () => {
  setNow(deadline - 1);
  seedQuiz();
  await assert.rejects(
    submitQuizAnswer.run({ quizId: "quiz", answer: "correct" }, {}),
    { code: "unauthenticated" }
  );
  seedQuiz("quiz", { finalizationStatus: "failed" });
  await assert.rejects(
    submitQuizAnswer.run({ quizId: "quiz", answer: "correct" }, { auth: { uid: "user" } }),
    { code: "failed-precondition" }
  );
  seedQuiz("quiz", { maxAnswers: 1 });
  documents.set("quizzes/quiz/answers/user/items/first", { answer: "first" });
  await assert.rejects(
    submitQuizAnswer.run({ quizId: "quiz", answer: "correct" }, { auth: { uid: "user" } }),
    { code: "resource-exhausted" }
  );
});

test("does not finalize on the deadline day, then finalizes the next day", async () => {
  seedQuiz();
  setNow(Date.parse("2026-11-04T23:59:59+09:00"));
  await finalizeExpiredQuizzes.run({});
  assert.equal(documents.has("quizzes/quiz"), true);

  setNow(Date.parse("2026-11-05T00:05:00+09:00"));
  await finalizeExpiredQuizzes.run({});
  assert.equal(documents.has("quizzes/quiz"), false);
  assert.equal(documents.get("quizzes_archive/quiz").finalizationStatus, "completed");
  assert.equal(documents.get("homeAnnouncements/archiveUpdates").items[0].sourceId, "quiz");
});

test("skips archived, unset and future deadlines, including today's midnight", async () => {
  setNow(Date.parse("2026-11-05T00:05:00+09:00"));
  seedQuiz("archived", { archived: true });
  seedQuiz("unset", { deadlineAt: null });
  seedQuiz("midnight", { deadlineAt: Timestamp.fromDate(new Date("2026-11-05T00:00:00+09:00")) });
  seedQuiz("future", { deadlineAt: Timestamp.fromDate(new Date("2026-11-06T00:00:00+09:00")) });
  await finalizeExpiredQuizzes.run({});
  assert.equal(documents.size, 4);
});

test("continues other quizzes when a correct answer is missing and reports failure", async () => {
  setNow(Date.parse("2026-11-05T00:05:00+09:00"));
  seedQuiz("missing", { answer: "" });
  seedQuiz("valid");
  await assert.rejects(finalizeExpiredQuizzes.run({}), /missing/);
  assert.equal(documents.has("quizzes/valid"), false);
  assert.equal(documents.get("quizzes/missing").answersClosedAt, undefined);
});

test("retries finalization without awarding points twice", async () => {
  setNow(Date.parse("2026-11-05T00:05:00+09:00"));
  seedQuiz();
  documents.set("users/user", { points: 10 });
  documents.set("quizzes/quiz/answers/user", { displayName: "User" });
  documents.set("quizzes/quiz/answers/user/items/first", { answer: "correct" });
  documents.set("quizzes/quiz/answers/user/items/second", { answer: "correct" });
  failAnnouncement = true;
  await assert.rejects(finalizeExpiredQuizzes.run({}), /quiz/);
  assert.equal(documents.get("users/user").points, 110);
  assert.equal(documents.get("quizzes/quiz").finalizationStatus, "failed");

  await finalizeExpiredQuizzes.run({});
  await finalizeExpiredQuizzes.run({});
  assert.equal(documents.get("users/user").points, 110);
  assert.equal(documents.get("quizzes_archive/quiz").correctUserCount, 1);
  assert.equal(documents.get("quizzes_archive/quiz").rewardPerUser, 100);
});

test("manual finalization still requires an administrator", async () => {
  seedQuiz();
  await assert.rejects(
    confirmQuizAnswer.run({ quizId: "quiz" }, { auth: { uid: "user" } }),
    { code: "permission-denied" }
  );
});
