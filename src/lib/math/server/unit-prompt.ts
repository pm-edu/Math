export interface MathUnit {
  id: number;
  curriculum_group: string;
  curriculum_detail: string;
  unit_name: string;
}

// 단원 이름으로 도형·그래프가 흔한 단원인지 대략 판단한다. 정확할 필요는 없다 — 프롬프트가
// "필요한 문제에만" figure를 붙이라고 이미 지시하므로, 이건 그 지시를 강조할지 말지 정도의
// 힌트일 뿐이다.
const FIGURE_HINT_PATTERN = /함수|그래프|도형|삼각형|사각형|원|닮음|피타고라스|삼각비|산포도|상관관계|입체|평행선/;

/** 단원 1개 배치(숫자+객관식 혼합, count개). */
export function buildMathUnitPrompt(unit: MathUnit, count: number): string {
  const likelyNeedsFigures = FIGURE_HINT_PATTERN.test(unit.unit_name);

  return `Write a batch of ${count} math practice problems for the "${unit.curriculum_detail}" curriculum, unit "${unit.unit_name}".

Mix both formats across the batch — roughly half "mcq" and half "numeric", whichever fits each specific problem better. Vary difficulty across the batch ("하"/"중"/"상", not all the same).

Some problems need a diagram (a graph, a triangle, a circle, a chart, a table) to make sense. For those, add an optional "figure" field with ONE of these shapes — do NOT describe the picture in words instead, and do NOT add "figure" to a problem that doesn't need one:
- Coordinate plane / function graph: {"kind":"coordinate_plane","xRange":[-5,5],"yRange":[-5,5],"lines":[{"a":1,"b":-1,"c":0}],"curves":[{"expr":"x^2 - 3*x + 2"}],"points":[{"x":1,"y":2,"label":"A"}]} (curves.expr is a JS-style expression in x; lines are ax+by=c)
- Triangle: {"kind":"triangle","vertices":[{"x":0,"y":0},{"x":6,"y":0},{"x":0,"y":8}],"labels":["A","B","C"],"sideLabels":{"ab":"6cm","ca":"8cm"},"rightAngleAt":0}
- Circle: {"kind":"circle","center":{"x":0,"y":0},"radius":5,"radiusLabel":"5cm","points":[{"x":5,"y":0,"label":"A"},{"x":0,"y":5,"label":"B"}],"chords":[{"from":0,"to":1}]}
- Bar chart: {"kind":"bar_chart","categories":["A","B","C"],"values":[3,7,5],"xLabel":"모둠","yLabel":"인원"}
- Scatter plot: {"kind":"scatter","points":[{"x":1,"y":2},{"x":2,"y":3.5}],"xLabel":"공부시간","yLabel":"점수","trendLine":{"slope":1.2,"intercept":0.5}}
- Table: {"kind":"table","headers":["구간","도수"],"rows":[["0~10",3],["10~20",7]],"caption":"..."}
The numbers in "figure" MUST exactly match the numbers stated in "contentText" (same side lengths, same coordinates, same data) — the picture and the problem text describe the same thing.${likelyNeedsFigures ? " Most problems in this unit will need a figure." : ""}

Return ONLY this JSON shape, filled in (no markdown fences, no extra text):
{
  "items": [
    {"format":"mcq","contentText":"...","choices":["...","...","...","..."],"correctIndex":0,"solutionText":"...","difficulty":"중"},
    {"format":"numeric","contentText":"...","answerRaw":"3/4","solutionText":"...","difficulty":"하","figure":{"kind":"triangle","vertices":[...],...}}
    /* ... ${count} items total ... */
  ]
}`;
}
