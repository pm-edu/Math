// 교사/관리자용 단어장 빌더 화면(/admin/words)이 쓰는 데이터 접근 함수.
// 학생용 session-data.ts와 분리해서 둔다(발행 여부와 무관하게 전부 보여야 하므로
// 쿼리 조건이 다르다). RLS는 is_staff()가 막아준다.

import { createClient } from "@/lib/supabase/client";

export type AdminWordSet = {
  id: string;
  titleKo: string;
  titleEn: string | null;
  curriculum: string;
  level: string | null;
  isPublished: boolean;
  unitCount: number;
  wordCount: number;
};

export type AdminUnit = {
  id: string;
  title: string;
  position: number;
  wordCount: number;
};

export type AdminWordRow = {
  unitWordId: string; // unit_words 행 식별용(=word id, 복합키라 word_id를 그대로 씀)
  wordId: string;
  lemma: string;
  pos: string | null;
  meaningKo: string;
  exampleEn: string | null;
  position: number;
};

export async function loadWordSets(): Promise<AdminWordSet[]> {
  const supabase = createClient();
  const { data: sets } = await supabase
    .from("word_sets")
    .select("id, title_ko, title_en, curriculum, level, is_published")
    .order("created_at", { ascending: false });
  const setList = sets ?? [];
  if (setList.length === 0) return [];
  const setIds = setList.map((s) => s.id);

  const { data: units } = await supabase.from("units").select("id, set_id").in("set_id", setIds);
  const unitList = units ?? [];
  const unitIds = unitList.map((u) => u.id);

  const { data: uw } =
    unitIds.length > 0
      ? await supabase.from("unit_words").select("unit_id").in("unit_id", unitIds)
      : { data: [] as { unit_id: string }[] };

  const unitCountBySet = new Map<string, number>();
  unitList.forEach((u) => unitCountBySet.set(u.set_id, (unitCountBySet.get(u.set_id) ?? 0) + 1));

  const setIdByUnit = new Map(unitList.map((u) => [u.id, u.set_id]));
  const wordCountBySet = new Map<string, number>();
  (uw ?? []).forEach((r) => {
    const setId = setIdByUnit.get(r.unit_id);
    if (setId) wordCountBySet.set(setId, (wordCountBySet.get(setId) ?? 0) + 1);
  });

  return setList.map((s) => ({
    id: s.id,
    titleKo: s.title_ko,
    titleEn: s.title_en,
    curriculum: s.curriculum,
    level: s.level,
    isPublished: s.is_published,
    unitCount: unitCountBySet.get(s.id) ?? 0,
    wordCount: wordCountBySet.get(s.id) ?? 0,
  }));
}

export async function createWordSet(data: {
  titleKo: string;
  titleEn: string;
  curriculum: string;
  level: string;
}): Promise<string> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("word_sets")
    .insert({
      title_ko: data.titleKo,
      title_en: data.titleEn || null,
      curriculum: data.curriculum || "general",
      level: data.level || null,
      is_published: false,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "단어장을 만들지 못했습니다.");
  return row.id;
}

export async function togglePublish(setId: string, isPublished: boolean): Promise<void> {
  const supabase = createClient();
  await supabase.from("word_sets").update({ is_published: isPublished }).eq("id", setId);
}

export async function loadUnits(setId: string): Promise<AdminUnit[]> {
  const supabase = createClient();
  const { data: units } = await supabase
    .from("units")
    .select("id, title, position")
    .eq("set_id", setId)
    .order("position");
  const unitList = units ?? [];
  if (unitList.length === 0) return [];
  const unitIds = unitList.map((u) => u.id);
  const { data: uw } = await supabase.from("unit_words").select("unit_id").in("unit_id", unitIds);
  const countByUnit = new Map<string, number>();
  (uw ?? []).forEach((r) => countByUnit.set(r.unit_id, (countByUnit.get(r.unit_id) ?? 0) + 1));
  return unitList.map((u) => ({ id: u.id, title: u.title, position: u.position, wordCount: countByUnit.get(u.id) ?? 0 }));
}

export async function createUnit(setId: string, title: string): Promise<string> {
  const supabase = createClient();
  const { data: existing } = await supabase.from("units").select("position").eq("set_id", setId).order("position", { ascending: false }).limit(1);
  const nextPosition = (existing?.[0]?.position ?? 0) + 1;
  const { data: row, error } = await supabase
    .from("units")
    .insert({ set_id: setId, title, position: nextPosition })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "유닛을 만들지 못했습니다.");
  return row.id;
}

export async function loadUnitWordsAdmin(unitId: string): Promise<AdminWordRow[]> {
  const supabase = createClient();
  const { data: uw } = await supabase.from("unit_words").select("word_id, position").eq("unit_id", unitId).order("position");
  const rows = uw ?? [];
  if (rows.length === 0) return [];
  const wordIds = rows.map((r) => r.word_id);

  const [{ data: words }, { data: senses }, { data: examples }] = await Promise.all([
    supabase.from("words").select("id, lemma, pos").in("id", wordIds),
    supabase.from("word_senses").select("word_id, meaning_ko").in("word_id", wordIds).order("position"),
    supabase.from("examples").select("word_id, text_en").in("word_id", wordIds),
  ]);
  const wordById = new Map((words ?? []).map((w) => [w.id, w]));
  const senseByWord = new Map<string, string>();
  (senses ?? []).forEach((s) => { if (!senseByWord.has(s.word_id)) senseByWord.set(s.word_id, s.meaning_ko); });
  const exampleByWord = new Map<string, string>();
  (examples ?? []).forEach((e) => { if (!exampleByWord.has(e.word_id)) exampleByWord.set(e.word_id, e.text_en); });

  return rows
    .map((r) => {
      const w = wordById.get(r.word_id);
      if (!w) return null;
      return {
        unitWordId: r.word_id,
        wordId: r.word_id,
        lemma: w.lemma,
        pos: w.pos,
        meaningKo: senseByWord.get(r.word_id) ?? "",
        exampleEn: exampleByWord.get(r.word_id) ?? null,
        position: r.position,
      };
    })
    .filter((r): r is AdminWordRow => r !== null);
}

export async function findExistingLemmas(lemmas: string[]): Promise<Set<string>> {
  if (lemmas.length === 0) return new Set();
  const supabase = createClient();
  const { data } = await supabase.from("words").select("lemma").in("lemma", lemmas);
  return new Set((data ?? []).map((w) => w.lemma.toLowerCase()));
}

export type GeneratedWordDraft = {
  lemma: string;
  pos: string;
  meaningKo: string;
  meaningEn: string;
  exampleEn: string;
  exampleKo: string;
};

// 새 단어(word+word_sense+example)를 저장하고 유닛에 배정한다.
// 관리자가 검토·수정 후 호출하는 것이므로 verified=true(is_reviewed=true)로 저장한다.
// 이미 있는 lemma는 건너뛰고(중복 방지) 몇 개를 건너뛰었는지 알려준다.
export async function saveGeneratedWords(
  unitId: string,
  drafts: GeneratedWordDraft[]
): Promise<{ saved: number; skipped: string[] }> {
  const supabase = createClient();
  const lemmas = drafts.map((d) => d.lemma.trim());
  const existing = await findExistingLemmas(lemmas);

  const toInsert = drafts.filter((d) => !existing.has(d.lemma.trim().toLowerCase()));
  const skipped = drafts.filter((d) => existing.has(d.lemma.trim().toLowerCase())).map((d) => d.lemma);
  if (toInsert.length === 0) return { saved: 0, skipped };

  const { data: insertedWords, error: wErr } = await supabase
    .from("words")
    .insert(
      toInsert.map((d) => ({
        lemma: d.lemma.trim(),
        pos: d.pos.trim() || null,
        source: "ai",
        is_reviewed: true,
      }))
    )
    .select("id, lemma");
  if (wErr || !insertedWords) throw new Error(wErr?.message ?? "단어 저장에 실패했습니다.");

  const wordIdByLemma = new Map(insertedWords.map((w) => [w.lemma, w.id]));

  const senseRows = toInsert
    .map((d) => {
      const wordId = wordIdByLemma.get(d.lemma.trim());
      if (!wordId) return null;
      return { word_id: wordId, meaning_ko: d.meaningKo.trim(), meaning_en: d.meaningEn.trim() || null, is_reviewed: true };
    })
    .filter((r) => r !== null);

  const exampleRows = toInsert
    .map((d) => {
      const wordId = wordIdByLemma.get(d.lemma.trim());
      if (!wordId || !d.exampleEn.trim()) return null;
      return {
        word_id: wordId,
        text_en: d.exampleEn.trim(),
        text_ko: d.exampleKo.trim() || null,
        source: "ai",
        is_reviewed: true,
      };
    })
    .filter((r) => r !== null);

  const { data: existingUnitWords } = await supabase.from("unit_words").select("position").eq("unit_id", unitId).order("position", { ascending: false }).limit(1);
  let nextPosition = (existingUnitWords?.[0]?.position ?? 0) + 1;
  const unitWordRows = toInsert
    .map((d) => {
      const wordId = wordIdByLemma.get(d.lemma.trim());
      if (!wordId) return null;
      return { unit_id: unitId, word_id: wordId, position: nextPosition++ };
    })
    .filter((r) => r !== null);

  await Promise.all([
    supabase.from("word_senses").insert(senseRows),
    exampleRows.length > 0 ? supabase.from("examples").insert(exampleRows) : Promise.resolve(),
    supabase.from("unit_words").insert(unitWordRows),
  ]);

  return { saved: toInsert.length, skipped };
}
