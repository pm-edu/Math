import { createPublicClient } from "@/lib/supabase/server";

export type Category = {
  id: string;
  name: string;
  name_en: string | null;
  position: number;
};

// 강좌 분류 목록. 관리자가 /admin/categories 에서 등록·삭제한다.
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await createPublicClient()
    .from("categories")
    .select("id, name, name_en, position")
    .order("position");

  if (error) return [];
  return (data ?? []) as Category[];
}
