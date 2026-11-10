import { describe, expect, it } from "vitest";
import { buildFirstTurn, formatTurn } from "../agent/lib/prompt.mjs";

const now = new Date("2026-11-10T03:00:00Z");

describe("formatTurn", () => {
  it("発言の先頭に日本時間の現在日時を付ける", () => {
    expect(formatTurn("こんにちは", now)).toBe("[現在日時: 2026/11/10 12:00:00]\nこんにちは");
  });
});

describe("buildFirstTurn", () => {
  it("履歴がなければ今回の発言だけ", () => {
    expect(buildFirstTurn([], "こんにちは", { now })).toBe(formatTurn("こんにちは", now));
  });

  it("履歴を古い順に話者付きで添える", () => {
    const p = buildFirstTurn(
      [
        { role: "user", content: "A" },
        { role: "assistant", content: "B" },
      ],
      "C",
      { now },
    );
    expect(p).toContain("ボス: A\nジャービス: B");
    expect(p.endsWith(formatTurn("C", now))).toBe(true);
  });

  it("文字数の上限を超えたら古い履歴から落とす", () => {
    const history = [
      { role: "user" as const, content: "古い発言".repeat(10) },
      { role: "user" as const, content: "新しい発言" },
    ];
    const p = buildFirstTurn(history, "C", { now, maxChars: 20 });
    expect(p).toContain("ボス: 新しい発言");
    expect(p).not.toContain("古い発言");
  });
});
