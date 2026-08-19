"use client";

// Reading·Listening 검수 편집기. 기존 page.tsx 안에 if문으로 있던 것을 그대로 옮겼다.

import { AudioOnlyNotice, Field, OptionsEditor, TextArea, type DraftEditorProps } from "./shared";

/** 빈칸 채우기 — 문단 + 빈칸별 정답. 정답은 학생에게 안 나간다(answer_key). */
export function CompleteTheWordsEditor({ item, onChange }: DraftEditorProps) {
  const blanks = item.blanks ?? [];
  return (
    <>
      <Field label="문단" hint="(빈칸은 _ 로 표시)">
        <TextArea value={item.paragraph ?? ""} onChange={(v) => onChange({ paragraph: v })} />
      </Field>
      <Field label="빈칸 정답">
        <div className="mt-1 space-y-2">
          {blanks.map((b, bi) => (
            <div key={b.id} className="flex items-center gap-2 text-sm">
              <span className="w-24 truncate text-[var(--secondary)]">{b.masked}</span>
              <input
                type="text"
                value={b.answer}
                onChange={(e) =>
                  onChange({ blanks: blanks.map((x, xi) => (xi === bi ? { ...x, answer: e.target.value } : x)) })
                }
                className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
            </div>
          ))}
        </div>
      </Field>
    </>
  );
}

/** 짧은 응답 고르기 — 들려줄 문장 + 보기 4개. 문장은 음성으로만 전달된다. */
export function ChooseAResponseEditor({ item, onChange }: DraftEditorProps) {
  return (
    <>
      <Field label="들려줄 문장">
        <TextArea value={item.spoken_text ?? ""} onChange={(v) => onChange({ spoken_text: v })} />
        <AudioOnlyNotice>
          저장하면 이 문장으로 음성이 만들어집니다. 학생 화면에는 글자로 보이지 않습니다.
        </AudioOnlyNotice>
      </Field>
      <OptionsEditor item={item} onChange={onChange} />
    </>
  );
}

/** 지문·스크립트를 공유하는 유형들의 문항 — 질문 + 보기 4개. */
export function McqQuestionEditor({ item, onChange }: DraftEditorProps) {
  return (
    <>
      <Field label="질문">
        <TextArea value={item.prompt ?? ""} onChange={(v) => onChange({ prompt: v })} />
      </Field>
      <OptionsEditor item={item} onChange={onChange} />
    </>
  );
}
