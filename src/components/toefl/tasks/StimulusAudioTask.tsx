"use client";

import { useState } from "react";
import AudioPlayer from "../AudioPlayer";
import OptionsList from "./OptionsList";
import NotesPanel from "./NotesPanel";
import type { ListeningStimulusItemPayload, ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";

// conversation/announcement/academic_talk가 공유하는 구현(spec §6, 셋 다 payload/동작이
// 동일 — "규칙의 3법칙": Conversation/Announcement/AcademicTalk 3개 파일은 이 컴포넌트를
// 아이콘·라벨만 바꿔서 얇게 감싼다).
//
// - 재생 중엔 문항 비노출, 화자/상황 아이콘만 표시(실제 이미지 자산 파이프라인이 없어서
//   이모지 아이콘으로 대체 — 요청의 "화자/상황 안내 이미지 또는 아이콘" 중 아이콘 쪽).
// - 우측 노트테이킹 패널은 재생 전/중/후 상관없이 항상 사용 가능(요청엔 시점이 명시 안 돼
//   있어서, 실제 시험처럼 강의를 들으며 계속 메모할 수 있어야 자연스럽다고 판단).
// - transcript는 이 컴포넌트에 아예 넘어오지 않는다 — toefl_stimulus_public 뷰 자체가
//   그 컬럼을 제외하고 있어서 여기서 따로 막을 것도 없다(응시 중 클라이언트에 안 감).
// - format="replay"(특정 구간만 재재생)는 스펙에 예시가 없고 시드 데이터도 전혀 안 써서
//   (전부 mcq) 지금은 mcq와 동일하게 처리한다 — 구간 재생 로직은 실제 콘텐츠 없이 만들면
//   검증이 안 돼서 미룸.

export default function StimulusAudioTask({
  item,
  stimulus,
  attemptId,
  value,
  onChange,
  onAudioEnded,
  icon,
  label,
}: {
  item: ToeflItemPublic;
  stimulus: ToeflStimulusPublic | null;
  attemptId: string;
  value: { selected?: string[] } | undefined;
  onChange: (answer: { selected: string[] }) => void;
  onAudioEnded: () => void;
  icon: string;
  label: string;
}) {
  const payload = item.payload as ListeningStimulusItemPayload;
  const [ended, setEnded] = useState(false);
  const audioUrl = stimulus?.audio_path ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div>
        {stimulus?.title && <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">{stimulus.title}</p>}

        {audioUrl && !ended && (
          <>
            <AudioPlayer
              src={audioUrl}
              onComplete={() => {
                setEnded(true);
                onAudioEnded();
              }}
            />
            <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-c)] py-10 text-center">
              <span className="text-4xl" aria-hidden="true">
                {icon}
              </span>
              <span className="text-xs text-[var(--secondary)]">{label} in progress — the question appears after it ends.</span>
            </div>
          </>
        )}

        {audioUrl && ended && (
          <>
            <div className="mb-4 rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/20 px-5 py-3 text-sm text-[var(--mint-dark)]">
              ✓ Audio finished
            </div>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
            <OptionsList
              options={payload.options}
              isMulti={payload.format === "multi_select"}
              selected={value?.selected ?? []}
              onChange={(selected) => onChange({ selected })}
            />
          </>
        )}
      </div>

      <NotesPanel attemptId={attemptId} section="listening" />
    </div>
  );
}
