// Writing 3종.
//
//   build_a_sentence     단어 조각을 순서대로 배열   → auto_sequence (정답 순서 대조)
//   write_an_email       상황에 맞는 이메일 작성     → ai_rubric (정답 없음)
//   academic_discussion  토론 스레드에 답글 작성     → ai_rubric (정답 없음)
//
// 셋 다 지문(stimulus)을 따로 두지 않는다 — 필요한 내용(시나리오·교수 글·학생 댓글)이
// payload 안에 들어간다. 학생 화면 컴포넌트도 payload 에서 직접 읽는다.

import {
  COMMON_RULES,
  normalizeSkillTags,
  promptPreamble,
  type ItemDraft,
  type ItemGenerator,
  type ParsedDrafts,
} from "./types";
import { catalogEntry } from "@/lib/toefl/task-catalog";

// ───────────────────────── build_a_sentence ─────────────────────────

const buildEntry = catalogEntry("build_a_sentence")!;

/** 정답 순서 그대로 화면에 내보내면 답이 보인다 — 조각을 섞어서 담는다. */
function shuffled<T>(arr: T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const buildASentenceGenerator: ItemGenerator = {
  taskType: buildEntry.taskType,
  section: buildEntry.section,
  label: buildEntry.label,
  needsStimulus: buildEntry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "auto_sequence",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
    return `You are writing TOEFL Writing "Build a Sentence" practice items.
Create ${n} independent items. ${topicLine} Difficulty: ${diff}.
Each item gives a short situation and one target sentence broken into 4-7 meaningful chunks (not single words unless natural). The student rearranges the chunks into the correct order. Chunks must combine into exactly one natural English sentence. If another ordering is also fully grammatical and natural, list it in accepted_alternatives; otherwise leave that array empty.
${COMMON_RULES}

JSON shape:
{"items":[
  {"context":"A classmate asks what you want to know from the housing office.",
   "chunks":[{"id":"c1","text":"Could you tell me"},{"id":"c2","text":"when the maintenance team"},{"id":"c3","text":"will visit"},{"id":"c4","text":"my room"}],
   "order":["c1","c2","c3","c4"],
   "accepted_alternatives":[],
   "explanation_ko":"간접의문문 어순이므로 'when + 주어 + 동사' 순서가 됩니다.",
   "skill_tags":["syntax"]}
]}`;
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const rawChunks = Array.isArray(o.chunks) ? o.chunks : [];
      const chunks = rawChunks.map((c, i) => {
        const co = (c ?? {}) as Record<string, unknown>;
        return { id: String(co.id ?? `c${i + 1}`), text: String(co.text ?? "").trim() };
      });
      const ids = new Set(chunks.map((c) => c.id));
      const order = (Array.isArray(o.order) ? o.order : [])
        .map((v) => String(v ?? "").trim())
        .filter((v) => ids.has(v));
      const alternatives = (Array.isArray(o.accepted_alternatives) ? o.accepted_alternatives : [])
        .map((alt) => (Array.isArray(alt) ? alt.map((v) => String(v ?? "").trim()).filter((v) => ids.has(v)) : []))
        .filter((alt) => alt.length === chunks.length);
      return {
        context: String(o.context ?? "").trim(),
        chunks,
        order,
        accepted_alternatives: alternatives,
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const chunks = (draft.chunks ?? []).filter((c) => c.text.trim());
    const order = draft.order ?? [];
    // 정답 순서가 조각을 전부 한 번씩 써야 채점이 성립한다.
    if (chunks.length < 3 || order.length !== chunks.length || new Set(order).size !== chunks.length) {
      return { ok: false, message: "조각과 정답 순서가 맞지 않아 건너뛰었습니다." };
    }
    return {
      ok: true,
      prompt: (draft.context ?? "").trim() || "Put the chunks in the correct order to form one sentence.",
      // 저장 시점에 한 번 섞어서 넣는다 — 정답 순서 그대로 내보내면 답이 그대로 보인다.
      payload: { chunks: shuffled(chunks) },
      answerKey: { order, accepted_alternatives: draft.accepted_alternatives ?? [] },
      spokenText: null,
    };
  },
};

// ───────────────────────── write_an_email ─────────────────────────

const emailEntry = catalogEntry("write_an_email")!;

export const writeAnEmailGenerator: ItemGenerator = {
  taskType: emailEntry.taskType,
  section: emailEntry.section,
  label: emailEntry.label,
  needsStimulus: emailEntry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "ai_rubric",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
    return `You are writing TOEFL Writing "Write an E-mail" practice items.
Create ${n} independent items. ${topicLine} Difficulty: ${diff}.
Each item gives a realistic campus or daily-life situation in which the student must write an e-mail, plus exactly 3 required points the e-mail must cover (written in Korean). Target length is 100-130 words.
${COMMON_RULES}

JSON shape:
{"items":[
  {"scenario":"You cannot attend your lab session this week because of a medical appointment. Write an e-mail to your lab instructor.",
   "required_points":["결석 사실 알리기","사유 설명하기","보강 방법 제안하기"],
   "explanation_ko":"세 가지 요구사항을 모두 다루고, 정중한 요청 표현을 쓰는지가 핵심입니다.",
   "skill_tags":["task_achievement"]}
]}`;
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        scenario: String(o.scenario ?? "").trim(),
        required_points: (Array.isArray(o.required_points) ? o.required_points : [])
          .map((p) => String(p ?? "").trim())
          .filter(Boolean)
          .slice(0, 5),
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const scenario = (draft.scenario ?? "").trim();
    const points = draft.required_points ?? [];
    if (!scenario || points.length === 0) {
      return { ok: false, message: "이메일 상황이나 요구사항이 비어 있어 건너뛰었습니다." };
    }
    return {
      ok: true,
      prompt: scenario,
      payload: { scenario, required_points: points, word_min: 100, word_max: 130 },
      answerKey: null,
      spokenText: null,
    };
  },
};

// ───────────────────────── academic_discussion ─────────────────────────

const discussionEntry = catalogEntry("academic_discussion")!;

export const academicDiscussionGenerator: ItemGenerator = {
  taskType: discussionEntry.taskType,
  section: discussionEntry.section,
  label: discussionEntry.label,
  needsStimulus: discussionEntry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "ai_rubric",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
    return `You are writing TOEFL Writing "Academic Discussion" practice items.
Create ${n} independent items. ${topicLine} Difficulty: ${diff}.
Each item is an online class discussion: a professor's post that poses a debatable question, plus exactly 2 student replies that take different positions. The student will write their own reply of 100-150 words. Keep the professor's post to 2-3 sentences and each student reply to 1-2 sentences. Use realistic first names.
${COMMON_RULES}

JSON shape:
{"items":[
  {"topic":"urban planning",
   "professor_post":"Cities are debating whether to convert downtown streets into pedestrian-only zones. Do the benefits outweigh the drawbacks? Why or why not?",
   "student_posts":[{"name":"Marco","text":"Pedestrian zones make downtowns more pleasant and boost small shops."},{"name":"Lena","text":"Deliveries and people with limited mobility depend on car access."}],
   "explanation_ko":"두 학생의 입장을 언급하면서 자신의 관점을 새로 더하는지가 가점 요소입니다.",
   "skill_tags":["coherence"]}
]}`;
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const posts = (Array.isArray(o.student_posts) ? o.student_posts : []).map((p) => {
        const po = (p ?? {}) as Record<string, unknown>;
        return { name: String(po.name ?? "").trim(), text: String(po.text ?? "").trim() };
      });
      return {
        professor_post: String(o.professor_post ?? "").trim(),
        student_posts: posts.filter((p) => p.name && p.text),
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const professorPost = (draft.professor_post ?? "").trim();
    const posts = draft.student_posts ?? [];
    if (!professorPost || posts.length < 2) {
      return { ok: false, message: "교수 글이나 학생 댓글이 부족해 건너뛰었습니다." };
    }
    return {
      ok: true,
      prompt: "Write a post responding to the professor's question. Express and support your opinion, and add to the discussion.",
      payload: { professor_post: professorPost, student_posts: posts, word_min: 100, word_max: 150 },
      answerKey: null,
      spokenText: null,
    };
  },
};
