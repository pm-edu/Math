import { createPublicClient } from "@/lib/supabase/server";

export type Course = {
  slug: string;
  category: "초등" | "중등" | "고등" | "IB";
  title: string;
  description: string;
  price: number;
  lessons: number;
  includes: string[];
};

const COLUMNS = "slug, category, title, description, price, lessons, includes";

type CourseRow = Omit<Course, "description"> & { description: string | null };

function toCourse(row: CourseRow): Course {
  return { ...row, description: row.description ?? "" };
}

export async function getCourses(): Promise<Course[]> {
  const { data, error } = await createPublicClient()
    .from("courses")
    .select(COLUMNS)
    .order("price");

  if (error) throw new Error(`강좌 목록을 불러오지 못했습니다: ${error.message}`);

  return (data ?? []).map(toCourse);
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
