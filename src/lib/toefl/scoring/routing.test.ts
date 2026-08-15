import { describe, expect, it } from "vitest";
import { routeStage2 } from "./routing";

describe("routeStage2", () => {
  it("threshold 이상이면 hard", () => {
    expect(routeStage2(6, 6)).toBe("hard");
    expect(routeStage2(9, 6)).toBe("hard");
  });

  it("threshold 미만이면 easy", () => {
    expect(routeStage2(5.5, 6)).toBe("easy");
    expect(routeStage2(0, 6)).toBe("easy");
  });
});
