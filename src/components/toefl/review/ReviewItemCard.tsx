"use client";

import type { ReactNode } from "react";
import AudioReplay from "./AudioReplay";
import OptionsReview from "./OptionsReview";
import AddToReviewButton from "./AddToReviewButton";
import { assembleSentence } from "@/lib/toefl/sentence-assembly";
import type {
  AcademicDiscussionPayload,
  BuildASentenceAnswerKey,
  BuildASentencePayload,
  CompleteTheWordsAnswerKey,
  CompleteTheWordsPayload,
  InterviewRubricScore,
  ListenAndRepeatAnswerKey,
  ListenAndRepeatPayload,
  ListeningAnswerKey,
  ListeningChoosePayload,
  ListeningStimulusItemPayload,
  McqOption,
  ReadingMcqAnswerKey,
  ReadingMcqPayload,
  TakeAnInterviewPayload,
  WriteAnEmailPayload,
  WritingRubricScore,
} from "@/lib/toefl/types";
import type { ReviewItem } from "./types";

// 문항별 리뷰 카드. task_type 12종을 스위치 하나로 처리(§10 "유형별 if문을 페이지에 흩뿌리지
// 않는다"와 같은 원칙 — TaskRenderer의 읽기전용 버전). 여기서 보여주는 정답/해설은 이미 서버
// (review 라우트)가 제출 완료된 attempt에 대해서만 내려준 것 — 이 컴포넌트는 그걸 그대로
// 렌더링만 한다(정오 판정도 response.is_correct를 그대로 쓰고 다시 비교하지 않는다).

function StatusBadge({ item }: { item: ReviewItem }) {
  if (item.review_status === "pending_manual") {
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">🧑‍🏫 Pending review</span>;
  }
  if (item.review_status === "unanswered") {
    return <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs font-medium text-[var(--secondary)]">Not answered</span>;
  }
  const correct = item.response?.is_correct;
  if (correct === true) {
    return <span className="rounded-full bg-[var(--mint)]/40 px-2.5 py-1 text-xs font-medium text-[var(--mint-dark)]">✓ Correct</span>;
  }
  if (correct === false) {
    return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">✗ Incorrect</span>;
  }
  return <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs font-medium text-[var(--secondary)]">Scored</span>;
}

function RubricFeedback({ rubric }: { rubric: WritingRubricScore | InterviewRubricScore }) {
  const metrics = Object.entries(rubric).filter(
    ([k, v]) => typeof v === "number" && k !== "overall_band"
  ) as [string, number][];
  return (
    <div className="mt-3 rounded-xl border border-[var(--border-c)] bg-[var(--background)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[var(--foreground)]">Band {rubric.overall_band}</span>
        {metrics.map(([k, v]) => (
          <span key={k} className="text-xs text-[var(--secondary)]">
            {k.replace(/_/g, " ")}: {v}
          </span>
        ))}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">{rubric.feedback_ko}</p>
      {rubric.strengths?.length > 0 && (
        <p className="mt-2 text-xs text-[var(--mint-dark)]">✓ {rubric.strengths.join(" · ")}</p>
      )}
      {rubric.improvements?.length > 0 && (
        <p className="mt-1 text-xs text-red-600">△ {rubric.improvements.join(" · ")}</p>
      )}
      {"corrected_excerpts" in rubric && rubric.corrected_excerpts?.length > 0 && (
        <div className="mt-3 space-y-2">
          {rubric.corrected_excerpts.map((ex, i) => (
            <div key={i} className="rounded-lg bg-white p-3 text-xs">
              <p className="text-red-600 line-through">{ex.original}</p>
              <p className="mt-1 text-[var(--mint-dark)]">{ex.corrected}</p>
              <p className="mt-1 text-[var(--secondary)]">{ex.reason_ko}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function completeTheWordsBody(payload: CompleteTheWordsPayload, myAnswer: Record<string, string>, correct: CompleteTheWordsAnswerKey): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = payload.paragraph;
  payload.blanks.forEach((blank, idx) => {
    const pos = remaining.indexOf(blank.masked);
    if (pos === -1) return;
    const before = remaining.slice(0, pos);
    if (before) parts.push(<span key={`t-${idx}`}>{before}</span>);
    const mine = (myAnswer[blank.id] ?? "").trim();
    const correctWord = correct[blank.id];
    const isRight = mine.toLowerCase() === (correctWord ?? "").toLowerCase();
    parts.push(
      <span key={blank.id} className="mx-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm">
        <span className={isRight ? "font-medium text-[var(--mint-dark)]" : "font-medium text-red-600 line-through"}>
          {mine || "(blank)"}
        </span>
        {!isRight && <span className="font-medium text-[var(--mint-dark)]">{correctWord}</span>}
      </span>
    );
    remaining = remaining.slice(pos + blank.masked.length);
  });
  if (remaining) parts.push(<span key="tail">{remaining}</span>);
  return parts;
}

export default function ReviewItemCard({ item, index }: { item: ReviewItem; index: number }) {
  const myAnswer = item.response?.answer as Record<string, unknown> | undefined;
  const canAddToReview = item.vocab_ids.length > 0 && item.response?.is_correct === false;

  function body() {
    switch (item.task_type) {
      case "complete_the_words": {
        const payload = item.payload as CompleteTheWordsPayload;
        const answerKey = item.answer_key as CompleteTheWordsAnswerKey;
        return (
          <p className="rounded-xl border border-[var(--border-c)] bg-white p-5 text-[15px] leading-loose text-[var(--foreground)]">
            {completeTheWordsBody(payload, (myAnswer as Record<string, string>) ?? {}, answerKey)}
          </p>
        );
      }
      case "daily_life":
      case "academic_passage": {
        const payload = item.payload as ReadingMcqPayload;
        const answerKey = item.answer_key as ReadingMcqAnswerKey;
        const selected = (myAnswer?.selected as string[]) ?? [];
        return (
          <div className="space-y-3">
            {item.stimulus?.body && (
              <p className="whitespace-pre-line rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm leading-relaxed text-[var(--foreground)]">
                {item.stimulus.title && <span className="mb-1 block font-semibold">{item.stimulus.title}</span>}
                {item.stimulus.body.replace(/\[\[\w+\]\]/g, "")}
              </p>
            )}
            {payload.format === "insert_text" ? (
              <p className="text-sm text-[var(--foreground)]">
                Your insertion point: <strong>{selected[0] ?? "—"}</strong> · Correct:{" "}
                <strong>{answerKey.correct[0] ?? "—"}</strong>
              </p>
            ) : (
              <OptionsReview options={payload.options} selected={selected} correct={answerKey.correct} />
            )}
          </div>
        );
      }
      case "choose_a_response": {
        const payload = item.payload as ListeningChoosePayload;
        const answerKey = item.answer_key as ListeningAnswerKey;
        const selected = (myAnswer?.selected as string[]) ?? [];
        return (
          <div className="space-y-3">
            <AudioReplay src={(payload.clip_path as string) ?? null} />
            <OptionsReview options={payload.options as McqOption[]} selected={selected} correct={answerKey.correct} />
          </div>
        );
      }
      case "conversation":
      case "announcement":
      case "academic_talk": {
        const payload = item.payload as ListeningStimulusItemPayload;
        const answerKey = item.answer_key as ListeningAnswerKey;
        const selected = (myAnswer?.selected as string[]) ?? [];
        return (
          <div className="space-y-3">
            {item.stimulus?.title && <p className="text-sm font-semibold text-[var(--foreground)]">{item.stimulus.title}</p>}
            <AudioReplay src={item.stimulus?.audio_path ?? null} />
            {item.stimulus?.transcript && (
              <details className="rounded-xl border border-[var(--border-c)] bg-white p-3 text-xs text-[var(--foreground)]">
                <summary className="cursor-pointer font-medium text-[var(--secondary)]">Show transcript</summary>
                <p className="mt-2 whitespace-pre-line leading-relaxed">{item.stimulus.transcript}</p>
              </details>
            )}
            <OptionsReview options={payload.options as McqOption[]} selected={selected} correct={answerKey.correct} />
          </div>
        );
      }
      case "listen_and_repeat": {
        const payload = item.payload as ListenAndRepeatPayload;
        const answerKey = item.answer_key as ListenAndRepeatAnswerKey;
        return (
          <div className="space-y-3">
            <AudioReplay src={(payload.clip_path as string) ?? null} label="Original sentence" />
            <p className="text-sm text-[var(--foreground)]">
              Target: <span className="font-medium text-[var(--mint-dark)]">{answerKey.target_sentence}</span>
            </p>
            <AudioReplay src={item.response?.audio_path ?? null} label="Your recording" />
            {item.response?.transcript && (
              <p className="text-sm text-[var(--foreground)]">
                What we heard: <span className="italic">&ldquo;{item.response.transcript}&rdquo;</span>
              </p>
            )}
          </div>
        );
      }
      case "take_an_interview": {
        const payload = item.payload as TakeAnInterviewPayload;
        return (
          <div className="space-y-3">
            <AudioReplay src={(payload.question_audio_path as string) ?? null} label="Interview question" />
            <AudioReplay src={item.response?.audio_path ?? null} label="Your response" />
            {item.ai_score ? (
              <RubricFeedback rubric={item.ai_score.rubric as unknown as InterviewRubricScore} />
            ) : (
              <p className="text-sm text-amber-700">This response is still waiting on manual review.</p>
            )}
          </div>
        );
      }
      case "build_a_sentence": {
        const payload = item.payload as BuildASentencePayload;
        const answerKey = item.answer_key as BuildASentenceAnswerKey;
        const chunkById = new Map(payload.chunks.map((c) => [c.id, c]));
        const myOrder = (myAnswer?.order as string[]) ?? [];
        return (
          <div className="space-y-2">
            <p className="rounded-xl border border-[var(--border-c)] bg-white p-4 text-base font-medium text-[var(--foreground)]">
              {assembleSentence(myOrder, chunkById) || "(no answer)"}
            </p>
            {item.response?.is_correct === false && (
              <p className="text-sm text-[var(--mint-dark)]">
                Correct: {assembleSentence(answerKey.order, chunkById)}
              </p>
            )}
          </div>
        );
      }
      case "write_an_email":
      case "academic_discussion": {
        const payload = item.payload as WriteAnEmailPayload | AcademicDiscussionPayload;
        void payload;
        const text = (myAnswer?.text as string) ?? "";
        return (
          <div className="space-y-3">
            <p className="whitespace-pre-line rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)]">
              {text || "(no answer)"}
            </p>
            {item.ai_score ? (
              <RubricFeedback rubric={item.ai_score.rubric as unknown as WritingRubricScore} />
            ) : (
              <p className="text-sm text-amber-700">This response is still waiting on manual review.</p>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border-c)] bg-[var(--background)] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--secondary)]">
          Item {index + 1} · {item.task_type.replace(/_/g, " ")}
        </p>
        <StatusBadge item={item} />
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
      <div className="mt-3">{body()}</div>
      {item.explanation_ko && (
        <div className="mt-4 rounded-xl bg-[var(--pink-light)]/30 p-4 text-sm leading-relaxed text-[var(--foreground)]">
          <p className="mb-1 text-xs font-semibold text-[var(--pink-dark)]">Explanation</p>
          {item.explanation_ko}
        </div>
      )}
      {canAddToReview && <AddToReviewButton vocabIds={item.vocab_ids} />}
    </div>
  );
}
