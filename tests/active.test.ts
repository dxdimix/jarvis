import { describe, expect, it } from "vitest";
import { pickLeader } from "../src/hooks/useActiveDevice";

describe("pickLeader", () => {
  it("最後に操作した画面が担当", () => {
    expect(pickLeader([{ id: "a", at: 1 }, { id: "b", at: 5 }, { id: "c", at: 3 }])).toBe("b");
    expect(pickLeader([])).toBeNull();
  });
});
