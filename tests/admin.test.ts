import { describe, expect, it } from "vitest";
import { rowsToText, stamp } from "../src/lib/logs";

describe("管理の画面のコピー", () => {
  it("日本時間の日時を付けて、1 行 1 件にする（本文の改行は字下げ）", () => {
    expect(stamp("2026-11-14T12:05:33Z")).toBe("2026-11-14 21:05:33");
    const text = rowsToText([
      { id: "1", at: "2026-11-14T12:05:33Z", kind: "あなた", text: "YouTube を開いて" },
      { id: "2", at: "2026-11-14T12:05:36Z", kind: "DIMY", text: "開きました。\n次は？" },
    ]);
    expect(text).toBe("[2026-11-14 21:05:33] あなた: YouTube を開いて\n[2026-11-14 21:05:36] DIMY: 開きました。\n    次は？");
  });
});
