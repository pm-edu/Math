import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync("C:/GitHub/Math/.env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  for (const detail of ["중2", "중3"]) {
    const { data } = await db
      .from("curriculum_units")
      .select("unit_name")
      .eq("curriculum_detail", detail)
      .order("sort_order");
    console.log(`\n=== ${detail} 단원별 문제 수 ===`);
    for (const u of data ?? []) {
      const { count } = await db
        .from("problems")
        .select("id", { count: "exact", head: true })
        .eq("subject", "math")
        .eq("unit", u.unit_name);
      console.log(`  ${u.unit_name}: ${count ?? 0}건`);
    }
  }
}
main();
