// write_an_email/academic_discussion 실시간 단어 수 카운터(§10)에 쓰는 순수함수.
// WriteAnEmail.tsx와 AcademicDiscussion.tsx 둘 다 써서(2곳) lib으로 뺐다.
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
