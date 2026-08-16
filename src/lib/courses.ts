import { createPublicClient } from "@/lib/supabase/server";
import type { Subject } from "@/lib/subject";

export type Course = {
  id: string;
  slug: string;
  subject: Subject;
  category: "초등" | "중등" | "고등" | "IB";
  title: string;
  description: string;
  price: number;
  /** 루피 가격. 없으면 영어 화면에서도 원화로 표시한다. */
  price_inr: number | null;
  lessons: number;
  includes: string[];
  /** 영어 화면용. 비어 있으면 한국어를 그대로 보여준다. */
  title_en: string | null;
  description_en: string | null;
  includes_en: string[] | null;
};

const COLUMNS =
  "id, slug, subject, category, title, description, price, price_inr, lessons, includes, title_en, description_en, includes_en";

type CourseRow = Omit<Course, "description"> & { description: string | null };

function toCourse(row: CourseRow): Course {
  return { ...row, description: row.description ?? "" };
}

export async function getCourses(subject: Subject): Promise<Course[]> {
  const { data, error } = await createPublicClient()
    .from("courses")
    .select(COLUMNS)
    .eq("subject", subject)
    .order("price");

  if (error) throw new Error(`강좌 목록을 불러오지 못했습니다: ${error.message}`);

  return (data ?? []).map(toCourse);
}

/** 홈 화면 카드용 — 해당 과목에서 가장 최근에 만든 강좌 하나 */
export async function getLatestCourse(subject: Subject): Promise<Course | null> {
  const { data, error } = await createPublicClient()
    .from("courses")
    .select(COLUMNS)
    .eq("subject", subject)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return toCourse(data);
}

export async function getCourse(slug: string): Promise<Course | null> {
  const { data, error } = await createPublicClient()
    .from("courses")
    .select(COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`강좌를 불러오지 못했습니다: ${error.message}`);

  return data ? toCourse(data) : null;
}
