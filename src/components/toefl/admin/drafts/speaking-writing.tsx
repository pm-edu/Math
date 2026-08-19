"use client";

// Speaking·Writing 검수 편집기 5종.
// 이 유형들은 "정답"이 없거나(루브릭 채점) 순서가 정답이라, 편집 화면이 앞의 객관식들과
// 많이 다르다. 학생에게 보이면 안 되는 값에는 AudioOnlyNotice 로 경고를 붙인다.

import { AudioOnlyNotice, Field, TextArea, inputClass, type DraftEditorProps } from "./shared";

/** 듣고 따라 말하기 — 목표 문장이 곧 정답. 화면엔 지시문만 나간다. */
export function ListenAndRepeatEditor({ item, onChange }: DraftEditorProps) {
  const sentence = item.target_sentence ?? "";
  const words = sentence.trim().split(/\s+/).filter(Boolean).length;
  const window = words <= 8 ? 8 : words <= 12 ? 10 : 12;

  return (
    <>
      <Field label="따라 말할 문장">
        <TextArea value={sentence} onChange={(v) => onChange({ target_sentence: v })} />
        <AudioOnlyNotice>
          이 문장이 <b>정답이자 들려줄 음성</b>입니다. 학생 화면에는 글자로 나가지 않습니다. 현재 {words}단어 →
          응답 시간 {window}초.
        </AudioOnlyNotice>
      </Field>
      <Field label="상황 안내" hint="(화면에 보이는 지시문)">
        <TextArea
          value={item.context ?? ""}
          onChange={(v) => onChange({ context: v })}
          placeholder="You are asking about library hours."
        />
      </Field>
    </>
  );
}

const TURN_TYPES = [
  { value: "opinion", label: "의견 — 선호를 밝히고 근거 대기" },
  { value: "compare", label: "비교 — 두 선택지 저울질" },
  { value: "hypothetical", label: "가정 — 상황을 상상해 답하기" },
];

/** 인터뷰 응답 — 질문은 음성으로만. 정답 없음(루브릭 채점). */
export function TakeAnInterviewEditor({ item, onChange }: DraftEditorProps) {
  return (
    <>
      <Field label="인터뷰 질문">
        <TextArea value={item.question_text ?? ""} rows={3} onChange={(v) => onChange({ question_text: v })} />
        <AudioOnlyNotice>
          질문은 <b>음성으로만</b> 전달됩니다(spec §6). 학생 화면에 글자로 표시되지 않으니, 듣고 한 번에
          이해되는 문장인지 확인해 주세요.
        </AudioOnlyNotice>
      </Field>
      <Field label="질문 유형">
        <select
          value={item.turn_type ?? "opinion"}
          onChange={(e) => onChange({ turn_type: e.target.value })}
          className={inputClass}
        >
          {TURN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="mt-2 text-[11.5px] text-[var(--secondary)]">준비 15초 · 응답 45초 · AI 루브릭 채점(정답 없음)</p>
    </>
  );
}

/** 문장 배열 — 조각과 정답 순서. 화면에는 섞어서 나간다. */
export function BuildASentenceEditor({ item, onChange }: DraftEditorProps) {
  const chunks = item.chunks ?? [];
  const order = item.order ?? [];
  const byId = new Map(chunks.map((c) => [c.id, c.text]));
  const sentence = order.map((id) => byId.get(id) ?? "?").join(" ");
  const valid = chunks.length >= 3 && order.length === chunks.length && new Set(order).size === chunks.length;

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    onChange({ order: next });
  }

  return (
    <>
      <Field label="상황 안내" hint="(화면에 보이는 지시문)">
        <TextArea value={item.context ?? ""} onChange={(v) => onChange({ context: v })} />
      </Field>

      <Field label="정답 순서" hint="(위/아래로 옮겨 문장을 맞추세요)">
        <div className="mt-1 space-y-1.5">
          {order.map((id, oi) => (
            <div key={id} className="flex items-center gap-2">
              <span className="w-6 text-center text-xs text-[var(--secondary)]">{oi + 1}</span>
              <input
                type="text"
                value={byId.get(id) ?? ""}
                onChange={(e) =>
                  onChange({ chunks: chunks.map((c) => (c.id === id ? { ...c, text: e.target.value } : c)) })
                }
                className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
              <button
                type="button"
                onClick={() => move(oi, oi - 1)}
                disabled={oi === 0}
                className="rounded border border-[var(--border-c)] px-2 py-1 text-xs disabled:opacity-30"
                aria-label="위로 옮기기"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(oi, oi + 1)}
                disabled={oi === order.length - 1}
                className="rounded border border-[var(--border-c)] px-2 py-1 text-xs disabled:opacity-30"
                aria-label="아래로 옮기기"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      </Field>

      <p
        className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] ${
          valid ? "bg-[var(--mint)]/40 text-[var(--mint-dark)]" : "bg-[#FDECEC] text-[var(--risk-hi)]"
        }`}
      >
        {valid ? "✓ " : "⚠ "}
        완성 문장: {sentence || "(비어 있음)"}
      </p>
      <p className="mt-1.5 text-[11.5px] text-[var(--secondary)]">
        학생 화면에는 조각이 <b>섞여서</b> 나갑니다 — 여기 순서가 그대로 보이지 않습니다.
      </p>
    </>
  );
}

/** 이메일 작성 — 시나리오 + 요구사항. 정답 없음. */
export function WriteAnEmailEditor({ item, onChange }: DraftEditorProps) {
  const points = item.required_points ?? [];
  return (
    <>
      <Field label="상황" hint="(화면에 보이는 지시문)">
        <TextArea value={item.scenario ?? ""} rows={3} onChange={(v) => onChange({ scenario: v })} />
      </Field>
      <Field label="반드시 다뤄야 할 내용" hint="(채점 기준)">
        <div className="mt-1 space-y-2">
          {points.map((p, pi) => (
            <div key={pi} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs text-[var(--secondary)]">{pi + 1}</span>
              <input
                type="text"
                value={p}
                onChange={(e) => onChange({ required_points: points.map((x, xi) => (xi === pi ? e.target.value : x)) })}
                className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
              <button
                type="button"
                onClick={() => onChange({ required_points: points.filter((_, xi) => xi !== pi) })}
                className="rounded border border-[var(--border-c)] px-2 py-1 text-xs"
                aria-label="항목 삭제"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ required_points: [...points, ""] })}
            className="rounded-lg border border-[var(--border-c)] px-3 py-1.5 text-xs font-medium"
          >
            + 항목 추가
          </button>
        </div>
        {points.length === 0 && (
          <p className="mt-1.5 text-[11.5px] text-[var(--risk-hi)]">⚠ 요구사항이 하나도 없으면 저장되지 않습니다.</p>
        )}
      </Field>
      <p className="mt-2 text-[11.5px] text-[var(--secondary)]">목표 분량 100~130단어 · AI 루브릭 채점(정답 없음)</p>
    </>
  );
}

/** 토론 글쓰기 — 교수 글 + 학생 댓글 2개 이상. 정답 없음. */
export function AcademicDiscussionEditor({ item, onChange }: DraftEditorProps) {
  const posts = item.student_posts ?? [];
  return (
    <>
      <Field label="교수 글" hint="(토론 질문)">
        <TextArea value={item.professor_post ?? ""} rows={3} onChange={(v) => onChange({ professor_post: v })} />
      </Field>
      <Field label="학생 댓글" hint="(서로 다른 입장 2개 이상)">
        <div className="mt-1 space-y-2">
          {posts.map((p, pi) => (
            <div key={pi} className="flex items-start gap-2">
              <input
                type="text"
                value={p.name}
                onChange={(e) =>
                  onChange({ student_posts: posts.map((x, xi) => (xi === pi ? { ...x, name: e.target.value } : x)) })
                }
                className="w-24 shrink-0 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                placeholder="이름"
              />
              <textarea
                rows={2}
                value={p.text}
                onChange={(e) =>
                  onChange({ student_posts: posts.map((x, xi) => (xi === pi ? { ...x, text: e.target.value } : x)) })
                }
                className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
              <button
                type="button"
                onClick={() => onChange({ student_posts: posts.filter((_, xi) => xi !== pi) })}
                className="rounded border border-[var(--border-c)] px-2 py-1 text-xs"
                aria-label="댓글 삭제"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ student_posts: [...posts, { name: "", text: "" }] })}
            className="rounded-lg border border-[var(--border-c)] px-3 py-1.5 text-xs font-medium"
          >
            + 댓글 추가
          </button>
        </div>
        {posts.length < 2 && (
          <p className="mt-1.5 text-[11.5px] text-[var(--risk-hi)]">⚠ 댓글이 2개 미만이면 저장되지 않습니다.</p>
        )}
      </Field>
      <p className="mt-2 text-[11.5px] text-[var(--secondary)]">목표 분량 100~150단어 · AI 루브릭 채점(정답 없음)</p>
    </>
  );
}
