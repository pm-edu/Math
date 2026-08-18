import { describe, expect, it } from "vitest";
import { assembleSentence, isPunctuationChunk } from "./sentence-assembly";

describe("isPunctuationChunk", () => {
  it("recognizes single punctuation characters", () => {
    expect(isPunctuationChunk(".")).toBe(true);
    expect(isPunctuationChunk(",")).toBe(true);
  });
  it("rejects words", () => {
    expect(isPunctuationChunk("the")).toBe(false);
  });
});

describe("assembleSentence", () => {
  const chunkById = new Map([
    ["c1", { id: "c1", text: "The" }],
    ["c2", { id: "c2", text: "committee" }],
    ["c3", { id: "c3", text: "approved" }],
    ["c4", { id: "c4", text: "." }],
  ]);

  it("joins words with spaces and attaches punctuation without a leading space", () => {
    expect(assembleSentence(["c1", "c2", "c3", "c4"], chunkById)).toBe("The committee approved.");
  });

  it("returns an empty string for an empty order", () => {
    expect(assembleSentence([], chunkById)).toBe("");
  });
});
