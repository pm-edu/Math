import { describe, expect, it } from "vitest";
import { interpretCandidate } from "./gemini-server";

// Gemini는 실패를 200 OK 안에 담아 보내는 경우가 있다. 그걸 성공으로 넘기면 잘린 JSON이
// 파싱 단계까지 흘러가서, 화면에는 "JSON으로 해석하지 못했습니다"만 뜨고 진짜 원인
// (모델이 길이 제한에 걸려 말을 못 끝냄)은 어디에도 안 남는다.
describe("interpretCandidate", () => {
  function candidate(fields: Record<string, unknown>) {
    return { candidates: [{ content: { parts: [{ text: "{}" }] }, ...fields }] };
  }

  it("정상 응답은 텍스트를 그대로 돌려준다", () => {
    const r = interpretCandidate({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"items":[]}' }] } }] });
    expect(r).toEqual({ ok: true, text: '{"items":[]}' });
  });

  it("finishReason이 없어도 텍스트가 있으면 성공으로 본다", () => {
    const r = interpretCandidate({ candidates: [{ content: { parts: [{ text: "hello" }] } }] });
    expect(r.ok).toBe(true);
  });

  it("MAX_TOKENS면 실패로 바꾸고 개수를 줄이라고 안내한다", () => {
    const r = interpretCandidate(candidate({ finishReason: "MAX_TOKENS" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("길이 제한");
    expect(r.message).toContain("개수");
  });

  it("안전차단 계열은 이유를 그대로 알려준다", () => {
    for (const reason of ["SAFETY", "RECITATION", "PROHIBITED_CONTENT"]) {
      const r = interpretCandidate(candidate({ finishReason: reason }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.message).toContain(reason);
    }
  });

  it("텍스트가 비면 실패로 본다", () => {
    const r = interpretCandidate({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "   " }] } }] });
    expect(r.ok).toBe(false);
  });

  it("candidates가 아예 없어도 터지지 않는다", () => {
    expect(interpretCandidate({}).ok).toBe(false);
    expect(interpretCandidate(null).ok).toBe(false);
  });
});
