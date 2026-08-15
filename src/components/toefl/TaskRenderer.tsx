"use client";

import type { ToeflItemPublic } from "@/lib/toefl/types";
import CompleteTheWordsRenderer from "./CompleteTheWordsRenderer";
import McqOptionsRenderer from "./McqOptionsRenderer";
import BuildASentenceRenderer from "./BuildASentenceRenderer";
import EssayRenderer from "./EssayRenderer";
import ListenAndRepeatRenderer from "./ListenAndRepeatRenderer";
import TakeAnInterviewRenderer from "./TakeAnInterviewRenderer";

// task_type별 문항 렌더러 디스패처. spec §10: "유형별 if문을 페이지에 흩뿌리지 않는다" —
// 페이지는 이 컴포넌트 하나만 쓰고, 유형 추가는 여기 switch 한 곳만 늘리면 된다.
// P1(Reading)+P2(Listening)+P3(Speaking)+P4(Writing) 전체 12종 구현 완료.
// Listening 문항의 오디오 재생 게이트(§6: "재생 완료 전 문항 노출 금지")는 이 컴포넌트가 아니라
// 페이지(listening/page.tsx)가 담당한다 — TaskRenderer는 "이미 재생 끝난 뒤 무엇을 보여줄지"만 안다.
// attemptId는 Speaking 두 유형(녹음 업로드 경로 구성용)에만 쓰인다.

export default function TaskRenderer({
  item,
  attemptId,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  attemptId: string;
  value: unknown;
  onChange: (answer: unknown) => void;
}) {
  switch (item.task_type) {
    case "complete_the_words":
      return (
        <CompleteTheWordsRenderer
          item={item}
          value={value as Record<string, string> | undefined}
          onChange={onChange as (answer: Record<string, string>) => void}
        />
      );
    case "daily_life":
    case "academic_passage":
    case "choose_a_response":
    case "conversation":
    case "announcement":
    case "academic_talk":
      return (
        <McqOptionsRenderer
          item={item}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
        />
      );
    case "build_a_sentence":
      return (
        <BuildASentenceRenderer
          item={item}
          value={value as { order?: string[] } | undefined}
          onChange={onChange as (answer: { order: string[] }) => void}
        />
      );
    case "write_an_email":
    case "academic_discussion":
      return (
        <EssayRenderer
          item={item}
          value={value as { text?: string } | undefined}
          onChange={onChange as (answer: { text: string }) => void}
        />
      );
    case "listen_and_repeat":
      return (
        <ListenAndRepeatRenderer
          item={item}
          attemptId={attemptId}
          value={value as { audio_path?: string } | undefined}
          onChange={onChange as (answer: { audio_path: string }) => void}
        />
      );
    case "take_an_interview":
      return (
        <TakeAnInterviewRenderer
          item={item}
          attemptId={attemptId}
          value={value as { audio_path?: string } | undefined}
          onChange={onChange as (answer: { audio_path: string }) => void}
        />
      );
    default:
      return (
        <p className="text-sm text-[var(--secondary)]">
          This task type is not supported yet: {item.task_type}
        </p>
      );
  }
}
