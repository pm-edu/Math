"use client";

// 검수 편집기 디스패처. 유형 하나당 컴포넌트 하나, 여기서 switch 한 번으로 고른다.
// 학생 화면의 TaskRenderer 와 같은 패턴 — spec §10 "유형별 if문을 페이지에 흩뿌리지 않는다".
//
// 새 유형을 추가할 때 손댈 곳: 이 파일의 switch + 편집기 컴포넌트 하나. 화면(page.tsx)은
// 그대로다.

import type { ItemDraft } from "@/lib/toefl/server/generators/types";
import { Field, TextArea, type DraftEditorProps } from "./shared";
import { ChooseAResponseEditor, CompleteTheWordsEditor, McqQuestionEditor } from "./reading-listening";
import {
  AcademicDiscussionEditor,
  BuildASentenceEditor,
  ListenAndRepeatEditor,
  TakeAnInterviewEditor,
  WriteAnEmailEditor,
} from "./speaking-writing";

export function DraftEditor({
  taskType,
  item,
  onChange,
}: DraftEditorProps & { taskType: string }) {
  const props = { item, onChange };

  switch (taskType) {
    case "complete_the_words":
      return <CompleteTheWordsEditor {...props} />;
    case "choose_a_response":
      return <ChooseAResponseEditor {...props} />;
    // 지문·스크립트를 공유하는 다섯 유형은 문항 편집 모양이 같다(질문 + 보기).
    case "daily_life":
    case "academic_passage":
    case "conversation":
    case "announcement":
    case "academic_talk":
      return <McqQuestionEditor {...props} />;
    case "listen_and_repeat":
      return <ListenAndRepeatEditor {...props} />;
    case "take_an_interview":
      return <TakeAnInterviewEditor {...props} />;
    case "build_a_sentence":
      return <BuildASentenceEditor {...props} />;
    case "write_an_email":
      return <WriteAnEmailEditor {...props} />;
    case "academic_discussion":
      return <AcademicDiscussionEditor {...props} />;
    default:
      // 카탈로그에 유형을 추가했는데 편집기를 안 만든 경우. 조용히 빈 화면을 보여주면
      // "생성은 됐는데 아무것도 안 보인다"가 되므로 이유를 적어둔다.
      return (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--border-c)] px-3 py-2 text-xs text-[var(--secondary)]">
          이 유형({taskType})의 검수 편집기가 아직 없습니다.
        </p>
      );
  }
}

/** 모든 유형에 공통으로 붙는 해설 칸. 검수의 핵심이라 편집기 밖에 둔다. */
export function ExplanationField({ item, onChange }: DraftEditorProps) {
  return (
    <Field label="해설 (한국어)">
      <TextArea value={item.explanation_ko} onChange={(v) => onChange({ explanation_ko: v })} />
    </Field>
  );
}

export type { ItemDraft };
