import { describe, expect, it } from "vitest";
import { buildPrompt } from "../agent/lib/prompt.mjs";

const now = new Date("2026-11-10T03:00:00Z");

describe("buildPrompt", () => {
  it("今回の発言と日時が入る", () => {
    const p = buildPrompt([], "こんにちは", { now });
    expect(p).toContain("## ボスの今回の発言\nこんにちは");
    expect(p).toContain("2026/11/10 12:00:00");
    expect(p).toContain("（なし）");
  });

  it("履歴を古い順に話者付きで入れる", () => {
    const p = buildPrompt(
      [
        { role: "user", content: "A" },
        { role: "assistant", content: "B" },
      ],
      "C",
      { now },
    );
    expect(p).toContain("ボス: A\nジャービス: B");
  });

  it("文字数の上限を超えたら古い履歴から落とす", () => {
    const history = [
      { role: "user" as const, content: "古い発言".repeat(10) },
      { role: "user" as const, content: "新しい発言" },
    ];
    const p = buildPrompt(history, "C", { now, maxChars: 20 });
    expect(p).toContain("ボス: 新しい発言");
    expect(p).not.toContain("古い発言");
  });
});
