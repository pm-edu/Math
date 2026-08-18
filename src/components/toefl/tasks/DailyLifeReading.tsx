"use client";

import OptionsList from "./OptionsList";
import type { ReadingMcqPayload, ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";

// spec §6 daily_life: 짧은 실용문(이메일·공지·일정표 등) + MCQ. AcademicPassage와 달리 지문이
// 짧고(공지문 몇 줄 수준) 좌우 2단으로 나눌 만큼 길지 않아서, 지문+문항을 한 화면에 세로로
// 같이 보여주고 스크롤을 최소화한다(요청사항) — AcademicPassage의 2단 분할은 여기 안 씀.
// 이전엔 이 지문을 페이지가 별도로 그렸는데(daily_life/academic_passage가 McqOptionsRenderer
// 공용이었음), 이제 컴포넌트가 stimulus까지 받아서 스스로 완결된 레이아웃을 그린다 — "셸의
// 슬롯에 꽂히는" 컴포넌트가 되려면 지문 표시까지 컴포넌트 책임이어야 페이지가 문항 유형별
// 레이아웃을 몰라도 되기 때문.

export default function DailyLifeReading({
  item,
  stimulus,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  stimulus: ToeflStimulusPublic | null;
  value: { selected?: string[] } | undefined;
  onChange: (answer: { selected: string[] }) => void;
}) {
  const payload = item.payload as ReadingMcqPayload;

  return (
    <div>
      {stimulus && (
        <div className="mb-4 rounded-xl border border-[var(--border-c)] bg-white p-4">
          {stimulus.title && <p className="mb-1.5 text-sm font-semibold text-[var(--foreground)]">{stimulus.title}</p>}
          {stimulus.body && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]">{stimulus.body}</p>
          )}
        </div>
      )}
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
      <div className="mt-3">
        <OptionsList
          options={payload.options}
          isMulti={payload.format === "multi_select"}
          selectCount={payload.select_count}
          selected={value?.selected ?? []}
          onChange={(selected) => onChange({ selected })}
        />
      </div>
    </div>
  );
}
