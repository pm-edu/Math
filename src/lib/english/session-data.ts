// 영어 완전학습 화면(Stage 3)이 쓰는 데이터 접근 함수.
// 순수 함수가 아니다(Supabase 호출) — 엔진(src/lib/engine)과는 분리해 여기 둔다.
// 접근 제어는 RLS(supabase/migrations)가 한다.

import { createClient } from "@/lib/supabase/client";
import { pickConfusionPartner } from "@/lib/engine";
import type { ItemType, FsrsRating, MasteryState, FsrsState } from "@/lib/engine";
import type {
  UnitSummary,
  UnitGateStatus,
  UnitProgress,
  WordContent,
  WordSense,
  WordExample,
  WordProgress,
  SessionMode,
} from "./types";

export async function loadPublishedUnits(userId: string): Promise<UnitSummary[]> {
  const supabase = createClient();

  const { data: sets } = await supabase.from("word_sets").select("id, title_ko").eq("is_published", true);
  const setIds = (sets ?? []).map((s) => s.id);
  if (setIds.length === 0) return [];

  const { data: units } = await supabase
    .from("units")
    .select("id, set_id, position, title")
    .in("set_id", setIds)
    .order("position");
  const unitList = units ?? [];
  if (unitList.length === 0) return [];
  const unitIds = unitList.map((u) => u.id);

  const { data: uw } = await supabase.from("unit_words").select("unit_id, word_id").in("unit_id", unitIds);
  const unitWordRows = uw ?? [];
  const wordIds = Array.from(new Set(unitWordRows.map((r) => r.word_id)));

  const [{ data: states }, { data: progressRows }] = await Promise.all([
    wordIds.length > 0
      ? supabase.from("user_word_states").select("word_id, due_at").eq("user_id", userId).in("word_id", wordIds)
      : Promise.resolve({ data: [] as { word_id: string; due_at: string }[] }),
    supabase
      .from("unit_progress")
      .select("unit_id, status, cycle_count")
      .eq("user_id", userId)
      .in("unit_id", unitIds),
  ]);

  const dueAtByWord = new Map((states ?? []).map((s) => [s.word_id, s.due_at]));
  const setTitleById = new Map((sets ?? []).map((s) => [s.id, s.title_ko]));
  const progressByUnit = new Map(
    (progressRows ?? []).map((p) => [p.unit_id, { status: p.status as UnitGateStatus, cycleCount: p.cycle_count }])
  );
  const now = Date.now();

  // 같은 단어장(set) 안에서 순서대로 통과해야 다음 유닛이 열린다.
  const passedBySet = new Map<string, Set<number>>(); // set_id -> 통과한 position 집합
  unitList.forEach((u) => {
    if (progressByUnit.get(u.id)?.status === "passed") {
      const set = passedBySet.get(u.set_id) ?? new Set<number>();
      set.add(u.position);
      passedBySet.set(u.set_id, set);
    }
  });

  return unitList.map((u) => {
    const wordIdsInUnit = unitWordRows.filter((r) => r.unit_id === u.id).map((r) => r.word_id);
    const newCount = wordIdsInUnit.filter((id) => !dueAtByWord.has(id)).length;
    const dueCount = wordIdsInUnit.filter((id) => {
      const dueAt = dueAtByWord.get(id);
      return dueAt !== undefined && new Date(dueAt).getTime() <= now;
    }).length;

    const progress = progressByUnit.get(u.id);
    const passedPositions = passedBySet.get(u.set_id) ?? new Set<number>();
    const isFirstInSet = u.position <= Math.min(...unitList.filter((x) => x.set_id === u.set_id).map((x) => x.position));
    const prevPassed = isFirstInSet || passedPositions.has(u.position - 1);
    // locked는 항상 "이전 유닛 통과 여부"로만 판단한다(DB에 저장된 값은 안 쓴다) —
    // DB의 status는 in_progress/passed만 의미 있게 갱신되므로 이게 더 안전하다.
    const status: UnitGateStatus = !prevPassed ? "locked" : progress?.status === "passed" ? "passed" : "in_progress";

    return {
      id: u.id,
      setId: u.set_id,
      setTitleKo: setTitleById.get(u.set_id) ?? "",
      title: u.title,
      position: u.position,
      wordCount: wordIdsInUnit.length,
      newCount,
      dueCount,
      status,
      cycleCount: progress?.cycleCount ?? 0,
    };
  });
}

export async function loadUnitTitle(unitId: string): Promise<{ title: string; setTitleKo: string } | null> {
  const supabase = createClient();
  const { data: unit } = await supabase.from("units").select("title, set_id").eq("id", unitId).maybeSingle();
  if (!unit) return null;
  const { data: set } = await supabase.from("word_sets").select("title_ko").eq("id", unit.set_id).maybeSingle();
  return { title: unit.title, setTitleKo: set?.title_ko ?? "" };
}

export async function loadUnitProgress(userId: string, unitId: string): Promise<UnitProgress | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("unit_progress")
    .select("mastery_ratio, test_score, status, cycle_count")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .maybeSingle();
  if (!data) return null;
  return {
    masteryRatio: data.mastery_ratio,
    testScore: data.test_score,
    status: data.status as UnitGateStatus,
    cycleCount: data.cycle_count,
  };
}

export async function saveUnitProgress(
  userId: string,
  unitId: string,
  progress: { masteryRatio: number; testScore: number; status: "in_progress" | "passed"; cycleCount: number }
): Promise<void> {
  const supabase = createClient();
  await supabase.from("unit_progress").upsert(
    {
      user_id: userId,
      unit_id: unitId,
      mastery_ratio: progress.masteryRatio,
      test_score: progress.testScore,
      status: progress.status,
      cycle_count: progress.cycleCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,unit_id" }
  );
}

export async function loadUnitWordIds(unitId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase.from("unit_words").select("word_id").eq("unit_id", unitId).order("position");
  return (data ?? []).map((r) => r.word_id);
}

export async function loadDueWordIds(userId: string, limit: number): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_word_states")
    .select("word_id")
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(limit);
  return (data ?? []).map((r) => r.word_id);
}

export async function loadWordContents(wordIds: string[]): Promise<WordContent[]> {
  if (wordIds.length === 0) return [];
  const supabase = createClient();

  const [{ data: words }, { data: senses }, { data: examples }] = await Promise.all([
    supabase.from("words").select("id, lemma, pos").in("id", wordIds),
    supabase
      .from("word_senses")
      .select("id, word_id, meaning_ko, meaning_en")
      .in("word_id", wordIds)
      .order("position"),
    supabase.from("examples").select("id, word_id, text_en, text_ko").in("word_id", wordIds),
  ]);

  const sensesByWord = new Map<string, WordSense[]>();
  (senses ?? []).forEach((s) => {
    const list = sensesByWord.get(s.word_id) ?? [];
    list.push({ id: s.id, meaningKo: s.meaning_ko, meaningEn: s.meaning_en });
    sensesByWord.set(s.word_id, list);
  });

  const examplesByWord = new Map<string, WordExample[]>();
  (examples ?? []).forEach((e) => {
    const list = examplesByWord.get(e.word_id) ?? [];
    list.push({ id: e.id, textEn: e.text_en, textKo: e.text_ko });
    examplesByWord.set(e.word_id, list);
  });

  return (words ?? []).map((w) => ({
    id: w.id,
    lemma: w.lemma,
    pos: w.pos,
    senses: sensesByWord.get(w.id) ?? [],
    examples: examplesByWord.get(w.id) ?? [],
  }));
}

export async function loadUserStates(userId: string, wordIds: string[]): Promise<Map<string, WordProgress>> {
  if (wordIds.length === 0) return new Map();
  const supabase = createClient();
  const { data } = await supabase
    .from("user_word_states")
    .select(
      "word_id, level, stability, difficulty, consecutive_wrong, consecutive_correct, last_session_id, last_item_type"
    )
    .eq("user_id", userId)
    .in("word_id", wordIds);

  const map = new Map<string, WordProgress>();
  (data ?? []).forEach((r) => {
    map.set(r.word_id, {
      level: r.level,
      stability: r.stability,
      difficulty: r.difficulty,
      consecutiveWrong: r.consecutive_wrong,
      consecutiveCorrect: r.consecutive_correct,
      lastSessionId: r.last_session_id,
      lastItemType: r.last_item_type,
    });
  });
  return map;
}

// 콜드스타트 대응: 개인화 혼동 이력이 있으면 그쪽, 없으면 시드 혼동쌍(user_id=null)으로.
export async function loadConfusionPartners(
  userId: string,
  wordIds: string[]
): Promise<Map<string, { wordId: string; lemma: string }>> {
  if (wordIds.length === 0) return new Map();
  const supabase = createClient();

  const [{ data: personalRows }, { data: seedRows }] = await Promise.all([
    supabase
      .from("confusions")
      .select("word_id, confused_with_word_id, count")
      .eq("user_id", userId)
      .in("word_id", wordIds),
    supabase.from("confusions").select("word_id, confused_with_word_id").is("user_id", null).in("word_id", wordIds),
  ]);

  const personal = (personalRows ?? []).map((r) => ({
    wordId: r.word_id,
    confusedWithWordId: r.confused_with_word_id,
    count: r.count,
  }));
  const seed = (seedRows ?? []).map((r) => ({ wordId: r.word_id, confusedWithWordId: r.confused_with_word_id }));

  const partnerIdByWord = new Map<string, string>();
  for (const wordId of wordIds) {
    const partnerId = pickConfusionPartner(wordId, personal, seed);
    if (partnerId) partnerIdByWord.set(wordId, partnerId);
  }

  const partnerIds = Array.from(new Set(partnerIdByWord.values()));
  if (partnerIds.length === 0) return new Map();

  const { data: partnerWords } = await supabase.from("words").select("id, lemma").in("id", partnerIds);
  const lemmaById = new Map((partnerWords ?? []).map((w) => [w.id, w.lemma]));

  const result = new Map<string, { wordId: string; lemma: string }>();
  partnerIdByWord.forEach((partnerId, wordId) => {
    const lemma = lemmaById.get(partnerId);
    if (lemma) result.set(wordId, { wordId: partnerId, lemma });
  });
  return result;
}

export async function createSession(userId: string, mode: SessionMode, unitId: string | null): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId, mode, unit_id: unitId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "세션을 시작하지 못했습니다.");
  return data.id;
}

export async function endSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
}

export async function saveAnswer(params: {
  userId: string;
  sessionId: string;
  wordId: string;
  itemType: ItemType;
  isCorrect: boolean;
  rating: FsrsRating;
  chosenWordId: string | null;
  responseMs: number;
  position: number;
  nextMastery: MasteryState;
  nextFsrs: FsrsState;
}): Promise<void> {
  const supabase = createClient();

  await Promise.all([
    supabase.from("user_word_states").upsert(
      {
        user_id: params.userId,
        word_id: params.wordId,
        level: params.nextMastery.level,
        stability: params.nextFsrs.stability,
        difficulty: params.nextFsrs.difficulty,
        due_at: params.nextFsrs.dueAt,
        consecutive_correct: params.nextMastery.consecutiveCorrect,
        consecutive_wrong: params.nextMastery.consecutiveWrong,
        last_session_id: params.nextMastery.lastSessionId,
        last_reviewed_at: new Date().toISOString(),
        last_item_type: params.itemType,
      },
      { onConflict: "user_id,word_id" }
    ),
    supabase.from("review_logs").insert({
      user_id: params.userId,
      word_id: params.wordId,
      item_type: params.itemType,
      is_correct: params.isCorrect,
      chosen_option_id: params.chosenWordId,
      response_ms: params.responseMs,
      derived_rating: params.rating,
    }),
    supabase.from("session_items").insert({
      session_id: params.sessionId,
      word_id: params.wordId,
      item_type: params.itemType,
      is_correct: params.isCorrect,
      response_ms: params.responseMs,
      position: params.position,
    }),
  ]);

  // 오답이고 상대가 특정됐으면(MC/CONTRAST) 혼동쌍 카운트를 올린다.
  if (!params.isCorrect && params.chosenWordId) {
    await recordConfusion(params.userId, params.wordId, params.chosenWordId);
  }
}

async function recordConfusion(userId: string, wordId: string, confusedWithWordId: string): Promise<void> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("confusions")
    .select("id, count")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .eq("confused_with_word_id", confusedWithWordId)
    .maybeSingle();

  if (existing) {
    await supabase.from("confusions").update({ count: existing.count + 1 }).eq("id", existing.id);
  } else {
    await supabase
      .from("confusions")
      .insert({ user_id: userId, word_id: wordId, confused_with_word_id: confusedWithWordId, count: 1 });
  }
}
