"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import OptionsList from "./OptionsList";
import type { ReadingMcqPayload, ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";

// spec §6 academic_passage. 좌(지문, 독립 스크롤)/우(문항) 2단 — lg(1024px)부터 2단, 그 밑은
// 세로 스택(태블릿 세로 포함). 예전엔 md(768px)였는데 태블릿 세로 폭(768~820px)이 정확히 그
// 경계라 좁은 화면에 2단이 끼어버렸음(접근성/반응형 점검에서 발견, 2026-08-18).
//
// 스펙에 명시가 없어서 이 컴포넌트가 직접 정한 것 2가지(둘 다 §17 "payload 구조를 임의
// 변형하지 않는다"는 지키되, body 안의 "표현 방식"만 정한 것 — payload 필드 자체는 그대로임):
//
// 1) 문장삽입(insert_text) 삽입지점 표기: payload.insert_positions(예: ["p1","p2","p3","p4"])의
//    각 id가 stimulus.body 안에 리터럴 토큰 `[[p1]]` 형태로 박혀 있다고 가정한다. 스펙엔 이
//    토큰 형식이 정의돼 있지 않고, 시드 데이터에도 insert_text 문항이 하나도 없어서(전부 mcq
//    포맷) 이 컴포넌트는 실제 콘텐츠로 검증되지 않았다 — P6(관리자 문항 등록)에서 insert_text
//    문항을 만들 때 이 토큰 규칙을 따라야 동작한다.
// 2) 참조 하이라이트: 이런 용도의 payload 필드가 없어서, item.prompt에 따옴표로 감싼 구절이
//    있으면("...단어 'bleaching'이 가리키는 것은...") 그 구절을 지문에서 찾아 강조한다 —
//    새 스키마 필드를 만들지 않고 이미 있는 prompt 텍스트에서 끌어내는 방식.

const MARKER_RE = /\[\[(\w+)\]\]/g;
const QUOTED_RE = /"([^"]{3,80})"/;

export default function AcademicPassage({
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
  const isInsertText = payload.format === "insert_text";
  const passageRef = useRef<HTMLDivElement>(null);
  const selected = value?.selected ?? [];
  const quoteMatch = item.prompt.match(QUOTED_RE);
  const highlightPhrase = quoteMatch?.[1];

  // 문항 이동 시 지문 스크롤을 해당 위치로 옮긴다. insert_text는 첫 삽입지점 마커로, 그 외
  // 유형은 이 문항이 어느 단락을 가리키는지 알려주는 필드가 데이터에 없어서(스펙에 없음)
  // 맨 위로 되돌리는 것까지만 한다.
  useEffect(() => {
    const container = passageRef.current;
    if (!container) return;
    if (isInsertText && payload.insert_positions?.[0]) {
      const marker = container.querySelector(`[data-marker="${payload.insert_positions[0]}"]`);
      marker?.scrollIntoView({ block: "center" });
    } else {
      container.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div ref={passageRef} className="max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--border-c)] bg-white p-5">
        {stimulus?.title && <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">{stimulus.title}</p>}
        {stimulus?.body && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]">
            {renderBody({
              body: stimulus.body,
              // insert_positions는 항상 넘긴다(같은 stimulus를 mcq 문항과 insert_text 문항이
              // 공유할 수 있어서 — 실제 TOEFL 지문 하나에 문항 여러 개가 딸리는 게 정상이다).
              // 마커 토큰은 어느 쪽이든 항상 지문 텍스트에서 제거하고, "클릭 가능한 ■로
              // 보여줄지"만 showMarkers로 가른다 — 안 그러면 mcq 문항 화면에 다른 문항용
              // [[p1]] 같은 리터럴 토큰이 그대로 새어 보인다(실제로 겪은 버그, 아래 커밋 참고).
              insertPositions: payload.insert_positions ?? [],
              showMarkers: isInsertText,
              selectedPosition: isInsertText ? selected[0] : undefined,
              insertSentence: isInsertText ? highlightPhrase : undefined,
              onMarkerClick: (posId) => onChange({ selected: [posId] }),
              highlightPhrase,
            })}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
        <div className="mt-3">
          {isInsertText ? (
            <p className="text-xs text-[var(--secondary)]">
              Click a ■ marker in the passage to place the sentence there.
            </p>
          ) : (
            <OptionsList
              options={payload.options}
              isMulti={payload.format === "multi_select"}
              selectCount={payload.select_count}
              selected={selected}
              onChange={(next) => onChange({ selected: next })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function renderBody(params: {
  body: string;
  insertPositions: string[];
  showMarkers: boolean;
  selectedPosition: string | undefined;
  insertSentence: string | undefined;
  onMarkerClick: (posId: string) => void;
  highlightPhrase: string | undefined;
}): ReactNode[] {
  const { body, insertPositions, showMarkers, selectedPosition, insertSentence, onMarkerClick, highlightPhrase } = params;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let matchIdx = 0;
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = MARKER_RE.exec(body)) !== null) {
    const posId = m[1];
    // [[id]] 토큰은 어느 문항에서든 항상 텍스트에서 걷어낸다 — 같은 지문(stimulus)을
    // insert_text 문항과 mcq 문항이 같이 쓸 수 있어서, mcq 화면에 다른 문항용 토큰이
    // 리터럴로 새어 보이면 안 된다. 클릭 가능한 ■로 보여줄지만 showMarkers로 가른다.
    const textBefore = body.slice(lastIndex, m.index);
    if (textBefore) parts.push(<span key={`t-${matchIdx}`}>{highlightSpans(textBefore, highlightPhrase, `h-${matchIdx}`)}</span>);
    lastIndex = m.index + m[0].length;
    matchIdx++;

    if (!showMarkers || !insertPositions.includes(posId)) continue;

    const isSelected = selectedPosition === posId;
    parts.push(
      <button
        key={`marker-${posId}`}
        type="button"
        data-marker={posId}
        onClick={() => onMarkerClick(posId)}
        aria-label={`Insert sentence here (${posId})`}
        className={`mx-1 inline-block align-middle text-lg leading-none ${
          isSelected ? "text-[var(--mint-dark)]" : "text-[var(--pink-dark)] hover:opacity-70"
        }`}
      >
        {isSelected ? "■" : "□"}
      </button>
    );
    if (isSelected && insertSentence) {
      parts.push(
        <span key={`preview-${posId}`} className="mx-1 rounded bg-[var(--mint)]/40 px-1 italic text-[var(--mint-dark)]">
          {insertSentence}
        </span>
      );
    }
  }
  const tail = body.slice(lastIndex);
  if (tail) parts.push(<span key="tail">{highlightSpans(tail, highlightPhrase, "h-tail")}</span>);
  return parts;
}

// prompt에서 뽑아낸 참조 구절을 지문 안에서 찾아 강조 표시한다(대소문자 무시).
function highlightSpans(text: string, phrase: string | undefined, keyPrefix: string): ReactNode {
  if (!phrase) return text;
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark key={keyPrefix} className="rounded bg-[var(--pink-light)] px-0.5 text-[var(--pink-dark)]">
        {text.slice(idx, idx + phrase.length)}
      </mark>
      {text.slice(idx + phrase.length)}
    </>
  );
}
