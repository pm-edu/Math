"use client";

import { useState } from "react";
import AudioPlayer from "../AudioPlayer";
import OptionsList from "./OptionsList";
import type { ListeningChoosePayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 choose_a_response: 짧은 발화를 듣고 최적 응답을 고른다. 오디오가 끝나기 전까지
// 선택지를 렌더링하지 않는다 — "듣고 나서 고르는" 타이밍 자체가 이 문항이 성립하는 조건이라
// (미리 글로 읽으면 리스닝이 아니게 됨), 옵션을 DOM에 아예 안 넣는다(숨기기가 아니라 미노출).
// 이제 오디오 재생·게이트를 이 컴포넌트가 스스로 갖고 있다(전엔 페이지가 담당) — "셸 슬롯에
// 꽂히는" Reading 컴포넌트들과 같은 방향(2026-08-18).

export default function ChooseAResponse({
  item,
  value,
  onChange,
  onAudioEnded,
}: {
  item: ToeflItemPublic;
  value: { selected?: string[] } | undefined;
  onChange: (answer: { selected: string[] }) => void;
  onAudioEnded: () => void;
}) {
  const payload = item.payload as ListeningChoosePayload;
  const [ended, setEnded] = useState(false);

  return (
    <div>
      {payload.clip_path && (
        <AudioPlayer
          src={payload.clip_path}
          onComplete={() => {
            setEnded(true);
            onAudioEnded();
          }}
        />
      )}
      {ended ? (
        <div className="mt-4">
          <p className="mb-3 text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
          <OptionsList
            options={payload.options}
            isMulti={false}
            selected={value?.selected ?? []}
            onChange={(selected) => onChange({ selected })}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--secondary)]">Listen to the audio above to see the response options.</p>
      )}
    </div>
  );
}
