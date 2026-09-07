export interface MathUnit {
  id: number;
  curriculum_group: string;
  curriculum_detail: string;
  unit_name: string;
}

/** 단원 1개 배치(숫자+객관식 혼합, count개). */
export function buildMathUnitPrompt(unit: MathUnit, count: number): string {
  return `Write a batch of ${count} math practice problems for the "${unit.curriculum_detail}" curriculum, unit "${unit.unit_name}".

Mix both formats across the batch — roughly half "mcq" and half "numeric", whichever fits each specific problem better. Vary difficulty across the batch ("하"/"중"/"상", not all the same).

Return ONLY this JSON shape, filled in (no markdown fences, no extra text):
{
  "items": [
    {"format":"mcq","contentText":"...","choices":["...","...","...","..."],"correctIndex":0,"solutionText":"...","difficulty":"중"},
    {"format":"numeric","contentText":"...","answerRaw":"3/4","solutionText":"...","difficulty":"하"}
    /* ... ${count} items total ... */
  ]
}`;
}
