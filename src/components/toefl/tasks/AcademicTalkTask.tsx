"use client";

import StimulusAudioTask from "./StimulusAudioTask";
import type { ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";

// spec §6 academic_talk. 구현은 StimulusAudioTask 공용(파일 상단 주석 참고) — 아이콘/라벨만 다름.
export default function AcademicTalkTask(props: {
  item: ToeflItemPublic;
  stimulus: ToeflStimulusPublic | null;
  attemptId: string;
  value: { selected?: string[] } | undefined;
  onChange: (answer: { selected: string[] }) => void;
  onAudioEnded: () => void;
}) {
  return <StimulusAudioTask {...props} icon="🎓" label="Academic talk" />;
}
