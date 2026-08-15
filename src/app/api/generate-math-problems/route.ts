import { createClient } from "@supabase/supabase-js";
import { curriculumGroupLabel, curriculumDetailLabel } from "@/lib/curriculum";
import { normAnswer } from "@/lib/grading";
import { callGemini } from "@/lib/gemini-server";
import { renderFunctionGraphSvg } from "@/lib/graph-svg";

// 수학 문제를 Gemini로 새로 생성한다. 저장은 하지 않는다 — 관리자가 화면에서 검수·수정 후 직접 저장한다.
// 정답 정확도를 보완하기 위해 Gemini를 두 번 부른다:
//   1) 생성 — 문제+정답+풀이를 만든다.
//   2) 자체 재검증 — 같은 문제를 정답 없이 다시 보내 독립적으로 풀게 하고, 1)의 정답과 비교한다.
// 두 결과가 다르면 관리자가 우선적으로 봐야 할 문제로 화면에 표시된다(저장을 막지는 않음).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

type DiagramSpec = { type: "function_graph"; expr: string; xMin: number; xMax: number };

type GeneratedProblem = {
  content_text: string;
  choices: string[]; // 객관식이 아니면 빈 배열
  answer: string;
  solution_text: string;
  diagram: DiagramSpec | null;
};

export async function POST(req: Request) {
  // 1) 관리자 확인
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!["owner", "admin", "teacher", "assistant"].includes(me?.role ?? ""))
    return json(403, "권한이 없습니다.");

  if (!GEMINI_API_KEY) return json(500, "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)");

  const body = (await req.json().catch(() => ({}))) as {
    curriculumGroup?: string;
    curriculumDetail?: string;
    unit?: string;
    difficulty?: string;
    problemFormat?: string;
    count?: number;
  };
  if (!body.curriculumDetail || !body.unit) return json(400, "커리큘럼·세부과정·단원을 먼저 선택해주세요.");

  const count = Math.min(Math.max(body.count ?? 5, 1), 10);
  const difficulty = body.difficulty?.trim() || "중";
  const problemFormat = body.problemFormat?.trim() || "객관식";
  const groupLabel = curriculumGroupLabel(body.curriculumGroup ?? null);
  const detailLabel = curriculumDetailLabel(body.curriculumGroup ?? null, body.curriculumDetail);

  // 1) 생성 호출
  const genPrompt = `당신은 한국 수학 과외 선생님입니다. ${groupLabel} ${detailLabel} 과정의 "${body.unit}" 단원에서
난이도 "${difficulty}"(하/중/상 중 하나)의 "${problemFormat}" 문제를 ${count}개 만드세요.

규칙:
- 문제 본문의 수식은 반드시 LaTeX로 쓰고 $...$ 로 감쌉니다.
- "객관식"이면 보기를 5개 만들고(오답도 그럴듯하게), 정답은 그중 하나를 문자(A/B/C/D/E)로 표기합니다.
- "단답형"이면 명확한 답 하나만 존재하도록 만듭니다(보기 없음).
- "서술형"이면 보기 없이, 최종 답을 함께 제시합니다.
- 반드시 직접 풀어서 검산한 뒤 정답을 적으세요. 계산 실수에 주의하세요.
- 풀이(solution_text)는 학생이 이해할 단계별 설명으로, 수식은 LaTeX로.
- 그래프를 직접 봐야 풀리는 함수 문제라면 diagram 필드에 그릴 함수식을 채우세요(아래 형식). 지금은
  함수 그래프(function_graph)만 그릴 수 있습니다 — 삼각형·원 등 도형 그림이 필요한 문제는 diagram을
  null로 두고, 그런 도형 문제는 아예 만들지 말고 다른 문제로 대신하세요. 그래프가 필요 없는 문제도
  diagram은 null로 둡니다.

반드시 JSON 배열만 출력하세요(다른 설명 금지):
[
  {
    "content_text": "문제 본문",
    "choices": ["보기 A", "보기 B", "보기 C", "보기 D", "보기 E"],
    "answer": "객관식이면 A~E 문자, 아니면 답 값",
    "solution_text": "단계별 풀이",
    "diagram": { "type": "function_graph", "expr": "x^2 - 4", "xMin": -3, "xMax": 3 }
  }
]
객관식이 아니면 choices는 빈 배열 []로 두세요. diagram이 필요 없으면 null로 두세요.`;

  const genRes = await callGemini([{ text: genPrompt }], { temperature: 0.7, json: true });
  if (!genRes.ok) return json(502, `생성 실패: ${genRes.message}`);

  let problems: GeneratedProblem[] = [];
  try {
    const parsed = JSON.parse(genRes.text);
    if (!Array.isArray(parsed)) throw new Error("not array");
    problems = parsed.map((p: Record<string, unknown>) => {
      const d = p.diagram as Record<string, unknown> | null | undefined;
      const diagram: DiagramSpec | null =
        d && d.type === "function_graph" && typeof d.expr === "string"
          ? { type: "function_graph", expr: d.expr, xMin: Number(d.xMin ?? -5), xMax: Number(d.xMax ?? 5) }
          : null;
      return {
        content_text: String(p.content_text ?? ""),
        choices: Array.isArray(p.choices) ? (p.choices as unknown[]).map((c) => String(c)).filter((c) => c.trim()) : [],
        answer: String(p.answer ?? ""),
        solution_text: String(p.solution_text ?? ""),
        diagram,
      };
    }).filter((p) => p.content_text.trim());
  } catch {
    return json(502, "생성 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }
  if (problems.length === 0) return json(502, "생성된 문제가 없습니다. 다시 시도해주세요.");

  // 그래프가 필요한 문제는 서버에서 직접 SVG로 그려 스토리지에 올린다.
  // 하나가 실패해도(식 오류 등) 문제 자체는 그래프 없이 그대로 반환한다.
  const imageUrls = new Map<number, string>();
  for (let i = 0; i < problems.length; i++) {
    const d = problems[i].diagram;
    if (!d) continue;
    const rendered = renderFunctionGraphSvg({ expr: d.expr, xMin: d.xMin, xMax: d.xMax });
    if (!rendered.ok) continue;
    const path = `${crypto.randomUUID()}.svg`;
    const { error: upErr } = await supabase.storage
      .from("problems")
      .upload(path, new Blob([rendered.svg], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
    if (upErr) continue;
    const { data: pub } = supabase.storage.from("problems").getPublicUrl(path);
    imageUrls.set(i, pub.publicUrl);
  }

  // 2) 자체 재검증 호출 — 정답을 안 알려주고 같은 문제들을 다시 풀게 한다 (문항 수와 무관하게 1번만 호출)
  const verifyPrompt = `아래 수학 문제들을 각각 처음부터 다시 풀어 정답만 구하세요. 주어진 정답은 없으니 참고하지 말고 독립적으로 계산하세요.
객관식(보기가 있는 문제)은 보기 중 정답에 해당하는 문자(A/B/C/D/E)만 답하세요. 단답형·서술형은 최종 값만 답하세요.

문제 목록:
${problems.map((p, i) => `${i}. ${p.content_text}${p.choices.length ? "\n보기: " + p.choices.map((c, ci) => `${String.fromCharCode(65 + ci)}) ${c}`).join(", ") : ""}`).join("\n\n")}

반드시 JSON 배열만 출력하세요: [{"index": 0, "computed_answer": "..."}]`;

  const verifyRes = await callGemini([{ text: verifyPrompt }], { temperature: 0, json: true });
  let computedAnswers = new Map<number, string>();
  if (verifyRes.ok) {
    try {
      const parsed = JSON.parse(verifyRes.text);
      if (Array.isArray(parsed)) {
        computedAnswers = new Map(
          parsed.map((r: Record<string, unknown>) => [Number(r.index), String(r.computed_answer ?? "")])
        );
      }
    } catch {
      // 재검증 파싱 실패는 치명적이지 않다 — 배지 없이 그냥 넘어간다.
    }
  }

  const result = problems.map((p, i) => {
    const isEssay = problemFormat === "서술형" && p.choices.length === 0;
    const computed = computedAnswers.get(i) ?? null;
    const selfCheckMatch = isEssay || computed === null ? null : normAnswer(computed) === normAnswer(p.answer);
    return {
      ...p,
      difficulty,
      problem_format: problemFormat,
      selfCheckAnswer: computed,
      selfCheckMatch,
      image_url: imageUrls.get(i) ?? null,
    };
  });

  return Response.json({ ok: true, problems: result });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
