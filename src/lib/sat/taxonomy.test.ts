import { describe, expect, it } from "vitest";
import {
  MATH_DOMAINS,
  MATH_SKILLS,
  MATH_SKILL_COUNT,
  RW_DOMAINS,
  RW_SKILLS,
  RW_SKILL_COUNT,
  SAT_DOMAINS,
  SAT_SKILLS,
  SAT_SKILL_COUNT,
  skillLabelKo,
  skillToDomain,
} from "./taxonomy";

describe("SAT taxonomy", () => {
  it("has 11 RW skills, 19 Math skills, 30 total", () => {
    expect(RW_SKILL_COUNT).toBe(11);
    expect(MATH_SKILL_COUNT).toBe(19);
    expect(SAT_SKILL_COUNT).toBe(30);
    expect(SAT_SKILLS.length).toBe(30);
  });

  it("has no duplicate skill keys", () => {
    const keys = SAT_SKILLS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every skill's domain belongs to the declared domain set", () => {
    for (const skill of SAT_SKILLS) {
      expect(SAT_DOMAINS as readonly string[]).toContain(skill.domain);
    }
  });

  it("RW skills only use RW domains, Math skills only use Math domains", () => {
    for (const skill of RW_SKILLS) {
      expect(RW_DOMAINS as readonly string[]).toContain(skill.domain);
    }
    for (const skill of MATH_SKILLS) {
      expect(MATH_DOMAINS as readonly string[]).toContain(skill.domain);
    }
  });

  it("maps a skill key to its domain", () => {
    expect(skillToDomain("central_ideas")).toBe("information_ideas");
    expect(skillToDomain("right_tri_trig")).toBe("geometry_trig");
  });

  it("maps a skill key to its Korean label", () => {
    expect(skillLabelKo("words_in_context")).toBe("문맥 속 어휘");
    expect(skillLabelKo("probability")).toBe("확률");
  });

  it("every skill has a non-empty Korean label", () => {
    for (const skill of SAT_SKILLS) {
      expect(skill.labelKo.length).toBeGreaterThan(0);
    }
  });
});
