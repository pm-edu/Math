"use client";

import type { ToeflItemPublic } from "@/lib/toefl/types";
import CompleteTheWordsRenderer from "./CompleteTheWordsRenderer";
import ReadingMcqRenderer from "./ReadingMcqRenderer";

// task_type별 문항 렌더러 디스패처. spec §10: "유형별 if문을 페이지에 흩뿌리지 않는다" —
// 페이지는 이 컴포넌트 하나만 쓰고, 유형 추가는 여기 switch 한 곳만 늘리면 된다.
// P1(Reading)만 구현: complete_the_words / daily_life / academic_passage.
// 나머지 유형은 P2~P4에서 케이스를 추가한다.

export default function TaskRenderer({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
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
      return (
        <ReadingMcqRenderer
          item={item}
          value={value as { selected?: string[] } | undefined}
          onChange={onChange as (answer: { selected: string[] }) => void}
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
