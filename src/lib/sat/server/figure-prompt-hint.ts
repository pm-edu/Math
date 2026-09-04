// RW/Math 생성 프롬프트가 공유하는 도형 예시. 종류마다 정확한 필드 예시를 보여줘서
// LLM이 kind는 "table"인데 필드는 bar_chart 것을 섞어 쓰는 실수(실사용 중 발견)를 막는다.
export const FIGURE_KIND_EXAMPLES = `Pick exactly ONE shape below and use ONLY the fields shown for that kind — never mix fields from a different kind:
- coordinate_plane: {"kind":"coordinate_plane","xRange":[-5,5],"yRange":[-5,5],"points":[{"x":1,"y":2,"label":"A"}],"lines":[{"a":1,"b":-1,"c":0}],"curves":[{"expr":"x^2 - 3*x + 2"}]}
- triangle: {"kind":"triangle","vertices":[{"x":0,"y":0},{"x":4,"y":0},{"x":0,"y":3}],"labels":["A","B","C"],"sideLabels":{"ab":"4","ca":"3"},"rightAngleAt":0}
- circle: {"kind":"circle","center":{"x":0,"y":0},"radius":5,"radiusLabel":"5","points":[{"x":5,"y":0,"label":"P"}]}
- bar_chart: {"kind":"bar_chart","categories":["A","B"],"values":[10,20],"xLabel":"...","yLabel":"..."}
- scatter: {"kind":"scatter","points":[{"x":1,"y":2},{"x":2,"y":3}],"trendLine":{"slope":1.5,"intercept":0.5}}
- table: {"kind":"table","headers":["Route","Time (hr)"],"rows":[["Rough road, 12 mi",5],["Cobbled road, 12 mi",3]],"caption":"..."}`;
