"use client";

import type { ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";
import CompleteTheWords from "./tasks/CompleteTheWords";
import DailyLifeReading from "./tasks/DailyLifeReading";
import AcademicPassage from "./tasks/AcademicPassage";
import ChooseAResponse from "./tasks/ChooseAResponse";
import ConversationTask from "./tasks/ConversationTask";
import AnnouncementTask from "./tasks/AnnouncementTask";
import AcademicTalkTask from "./tasks/AcademicTalkTask";
import BuildASentence from "./tasks/BuildASentence";
import WriteAnEmail from "./tasks/WriteAnEmail";
import AcademicDiscussion from "./tasks/AcademicDiscussion";
import ListenAndRepeat from "./tasks/ListenAndRepeat";
import TakeAnInterview from "./tasks/TakeAnInterview";

// task_type별 문항 렌더러 디스패처. spec §10: "유형별 if문을 페이지에 흩뿌리지 않는다" —
// 페이지는 이 컴포넌트 하나만 쓰고, 유형 추가는 여기 switch 한 곳만 늘리면 된다.
// P1(Reading)+P2(Listening)+P3(Speaking)+P4(Writing) 전체 12종 구현 완료.
// attemptId는 Speaking 두 유형(녹음 업로드 경로 구성용)과 Listening 노트패널(섹션 전체
// 메모 저장 경로)에 쓰인다.
// stimulus는 Reading 3종 + Listening의 conversation/announcement/academic_talk 3종에 쓰인다
// (2026-08-18 재작업) — 이 유형들은 지문/오디오 표시까지 스스로 책임져서 "셸의 슬롯에
// 꽂히는" 컴포넌트가 됐다(전엔 페이지가 따로 그렸음).
// onAudioEnded는 Listening 4종에서만 쓰인다 — 오디오 재생 게이트(§6: "재생 완료 전 문항
// 노출 금지")를 이제 각 컴포넌트가 스스로 갖고 있고, "언제 다음/제출 버튼을 활성화할지"만
// 페이지에 알려주면 되므로 이 콜백 하나로 충분하다.

export default function TaskRenderer({
  item,
  attemptId,
  stimulus,
  value,
  onChange,
  onAudioEnded,
  turnIndex,
  turnTotal,
}: {
  item: ToeflItemPublic;
  attemptId: string;
  stimulus?: ToeflStimulusPublic | null;
  value: unknown;
  onChange: (answer: unknown) => void;
  onAudioEnded?: () => void;
  // take_an_interview 전용: 같은 섹션의 이 유형 문항들 중 몇 번째인지(0-based)/총 몇 턴인지.
  turnIndex?: number;
  turnTotal?: number;
}) {
  switch (item.task_type) {
    case "complete_the_words":
      return (
        <CompleteTheWords
          item={item}
          value={value as Record<string, string> | undefined}
          onChange={onChange as (answer: Record<string, string>) => void}
        />
      );
    case "daily_life":
      return (
        <DailyLifeReading
          item={item}
          stimulus={stimulus ?? null}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
        />
      );
    case "academic_passage":
      return (
        <AcademicPassage
          item={item}
          stimulus={stimulus ?? null}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
        />
      );
    case "choose_a_response":
      return (
        <ChooseAResponse
          item={item}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
          onAudioEnded={onAudioEnded ?? (() => {})}
        />
      );
    case "conversation":
      return (
        <ConversationTask
          item={item}
          stimulus={stimulus ?? null}
          attemptId={attemptId}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
          onAudioEnded={onAudioEnded ?? (() => {})}
        />
      );
    case "announcement":
      return (
        <AnnouncementTask
          item={item}
          stimulus={stimulus ?? null}
          attemptId={attemptId}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
          onAudioEnded={onAudioEnded ?? (() => {})}
        />
      );
    case "academic_talk":
      return (
        <AcademicTalkTask
          item={item}
          stimulus={stimulus ?? null}
          attemptId={attemptId}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
          onAudioEnded={onAudioEnded ?? (() => {})}
        />
      );
    case "build_a_sentence":
      return (
        <BuildASentence
          item={item}
          value={value as { order?: string[] } | undefined}
          onChange={onChange as (answer: { order: string[] }) => void}
        />
      );
    case "write_an_email":
      return (
        <WriteAnEmail
          item={item}
          value={value as { text?: string } | undefined}
          onChange={onChange as (answer: { text: string }) => void}
        />
      );
    case "academic_discussion":
      return (
        <AcademicDiscussion
          item={item}
          value={value as { text?: string } | undefined}
          onChange={onChange as (answer: { text: string }) => void}
        />
      );
    case "listen_and_repeat":
      return (
        <ListenAndRepeat
          item={item}
          attemptId={attemptId}
          value={value as { audio_path?: string } | undefined}
          onChange={onChange as (answer: { audio_path: string }) => void}
        />
      );
    case "take_an_interview":
      return (
        <TakeAnInterview
          item={item}
          attemptId={attemptId}
          value={value as { audio_path?: string } | undefined}
          onChange={onChange as (answer: { audio_path: string }) => void}
          turnIndex={turnIndex}
          turnTotal={turnTotal}
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
