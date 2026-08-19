import { describe, expect, it } from "vitest";
import { extractJsonText } from "./llm-server";

// 로컬 모델은 클라우드와 달리 "JSON만 주세요"를 덜 지킨다. 추론형(DeepSeek-R1 계열)은
// <think> 블록을 먼저 쓰고, 지시형 모델도 앞뒤에 설명을 덧붙이는 일이 잦다.
// 그대로 JSON.parse 하면 깨지므로, 파싱 전에 바깥 JSON 덩어리만 잘라낸다.
describe("extractJsonText", () => {
  it("순수 JSON은 그대로 둔다", () => {
    expect(extractJsonText('{"items":[]}')).toBe('{"items":[]}');
  });

  it("<think> 블록을 걷어낸다", () => {
    const raw = '<think>먼저 문항을 구상해 보자...</think>\n{"items":[{"prompt":"Q"}]}';
    expect(extractJsonText(raw)).toBe('{"items":[{"prompt":"Q"}]}');
  });

  it("앞뒤 설명을 잘라낸다", () => {
    const raw = 'Here is the JSON you asked for:\n\n{"items":[1,2]}\n\nLet me know if you need changes.';
    expect(extractJsonText(raw)).toBe('{"items":[1,2]}');
  });

  it("코드펜스로 감싼 것도 처리한다", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJsonText(raw)).toBe('{"a":1}');
  });

  it("배열로 시작하는 응답도 처리한다", () => {
    expect(extractJsonText('설명\n[{"a":1}]\n끝')).toBe('[{"a":1}]');
  });

  it("중첩된 객체에서 가장 바깥까지 가져온다", () => {
    const raw = 'note\n{"stimulus":{"title":"t"},"items":[{"o":{"x":1}}]}\nend';
    expect(extractJsonText(raw)).toBe('{"stimulus":{"title":"t"},"items":[{"o":{"x":1}}]}');
  });

  it("JSON이 아예 없으면 원문을 돌려준다(파싱 단계에서 실패 메시지가 뜬다)", () => {
    expect(extractJsonText("죄송합니다, 만들 수 없습니다.")).toBe("죄송합니다, 만들 수 없습니다.");
  });

  it("여는 괄호만 있고 닫는 게 없으면 거기서부터 돌려준다", () => {
    expect(extractJsonText('시작 {"a":1')).toBe('{"a":1');
  });
});
