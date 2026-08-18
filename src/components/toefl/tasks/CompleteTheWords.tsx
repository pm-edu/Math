"use client";

import type { ReactNode } from "react";
import type { CompleteTheWordsPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 complete_the_words: payload.paragraph 안에 payload.blanks[i].masked 문자열이 그대로
// 등장한다("The eco_omy grew..."). masked 자체가 이미 "일부 글자만 보여주는" 힌트 패턴이라
// (예: "eco_omy" = eco/omy는 보이고 가운데만 빈칸), 별도의 "힌트 on/off" 필드가 blueprint/
// payload 어디에도 없다(§5 DDL의 task_mix는 count만 담는 jsonb, on/off 플래그 없음) — 그래서
// "글자 힌트를 보여줄지"는 콘텐츠 저자가 masked를 어떻게 쓰는지로 이미 결정되는 것으로 해석함
// (완전히 가린 빈칸을 원하면 masked를 "_______"처럼 전부 밑줄로 채우면 됨). 새 스키마 필드는
// 만들지 않음 — 있는 데이터로 정확히 표현 가능해서.
// 채점은 auto_key(§7), blank 단위 대소문자·공백 무시로 서버가 처리 — 이 컴포넌트는 입력만 받고
// 정오 판정은 절대 하지 않는다(입력 중 피드백 없음).

export default function CompleteTheWords({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: Record<string, string> | undefined;
  onChange: (answer: Record<string, string>) => void;
}) {
  const payload = item.payload as CompleteTheWordsPayload;

  function setBlank(id: string, v: string) {
    onChange({ ...(value ?? {}), [id]: v });
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
      <p className="mt-4 rounded-xl border border-[var(--border-c)] bg-white p-5 text-[16px] leading-loose text-[var(--foreground)]">
        {renderParagraph(payload, value ?? {}, setBlank)}
      </p>
    </div>
  );
}

function renderParagraph(
  payload: CompleteTheWordsPayload,
  value: Record<string, string>,
  onBlankChange: (id: string, v: string) => void
): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = payload.paragraph;

  payload.blanks.forEach((blank, idx) => {
    const pos = remaining.indexOf(blank.masked);
    if (pos === -1) return;
    const before = remaining.slice(0, pos);
    if (before) parts.push(<span key={`t-${idx}`}>{before}</span>);
    parts.push(
      <input
        key={blank.id}
        type="text"
        value={value[blank.id] ?? ""}
        onChange={(e) => onBlankChange(blank.id, e.target.value)}
        // masked 자체를 placeholder로 써서 "어떤 글자가 이미 주어졌는지"(예: ec_n_my) 힌트가
        // 그대로 보이게 한다. 글자 수는 placeholder 길이 + 입력칸 너비(length) 둘 다로 드러남.
        placeholder={blank.masked}
        aria-label={`Blank ${idx + 1}`}
        style={{ width: `${Math.max(blank.length, 5)}ch` }}
        // 자동 대문자화·자동완성·맞춤법 검사를 전부 끈다 — 브라우저가 답을 바꾸거나 색칠하면
        // 안 되는 시험 입력칸이라(정오 피드백을 절대 실시간으로 주면 안 된다는 원칙과 같은 이유).
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="mx-1 rounded border-b-2 border-[var(--pink)] bg-[var(--pink-light)]/30 px-1 text-center font-medium text-[var(--foreground)] outline-none focus:bg-[var(--pink-light)]/60 focus:ring-2 focus:ring-[var(--pink)]/60"
      />
      // Tab 이동은 별도 처리 없이 DOM 순서(문단 내 등장 순서)를 그대로 따른다 — input에
      // tabIndex를 따로 안 주는 한 브라우저가 자연스럽게 다음 빈칸으로 넘겨준다.
    );
    remaining = remaining.slice(pos + blank.masked.length);
  });

  if (remaining) parts.push(<span key="tail">{remaining}</span>);
  return parts;
}
