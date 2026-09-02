// taxonomy.ts와 마이그레이션의 domain/skill CHECK 제약이 어긋나면 여기서 잡힌다
// (지시서 SAT P0 §2 "스킬 키가 DB CHECK 제약과 일치" — 완료검증표 #3의 자동화).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAT_DOMAINS, SAT_SKILLS } from "./taxonomy";

const MIGRATION_PATH = join(__dirname, "../../../supabase/migrations/202609021000_create_sat_schema.sql");

function extractCheckList(sql: string, columnMarker: string): string[] {
  const idx = sql.indexOf(columnMarker);
  if (idx === -1) throw new Error(`marker not found in migration: ${columnMarker}`);
  const clauseEnd = sql.indexOf(")),", idx);
  const clause = sql.slice(idx, clauseEnd);
  return [...clause.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

describe("sat_questions CHECK constraints match taxonomy.ts", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const domainCheck = extractCheckList(sql, "domain         text not null check");
  const skillCheck = extractCheckList(sql, "skill          text not null check");

  it("domain CHECK has exactly the taxonomy domains, same set", () => {
    expect(new Set(domainCheck)).toEqual(new Set(SAT_DOMAINS));
    expect(domainCheck.length).toBe(SAT_DOMAINS.length);
  });

  it("skill CHECK has exactly the taxonomy skills, same set", () => {
    const taxonomyKeys = SAT_SKILLS.map((s) => s.key);
    expect(new Set(skillCheck)).toEqual(new Set(taxonomyKeys));
    expect(skillCheck.length).toBe(taxonomyKeys.length);
    expect(skillCheck.length).toBe(30);
  });
});
