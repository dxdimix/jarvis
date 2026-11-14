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
    expect(p).toContain("利用者: A\nキーミス: B");
    expect(p.endsWith(formatTurn("C", now))).toBe(true);
  });

  it("文字数の上限を超えたら古い履歴から落とす", () => {
    const history = [
      { role: "user" as const, content: "古い発言".repeat(10) },
      { role: "user" as const, content: "新しい発言" },
    ];
    const p = buildFirstTurn(history, "C", { now, maxChars: 20 });
    expect(p).toContain("利用者: 新しい発言");
    expect(p).not.toContain("古い発言");
  });
});

describe("buildMemoryBlock", () => {
  it("覚えていることと評価を、会話の最初に渡す文にする", async () => {
    const { buildMemoryBlock } = await import("../agent/lib/prompt.mjs");
    const block = buildMemoryBlock(
      [{ kind: "style", content: "結論を先に" }],
      [{ rating: -1, comment: "長い", reply: "FX の状況は" }],
    );
    expect(block).toContain("・[話し方の好み] 結論を先に");
    expect(block).toContain("・よくない「長い」（返事: FX の状況は）");
    expect(buildMemoryBlock([], [])).toBe("");
  });

  it("覚えていることを、最初の発言の前に入れる", () => {
    const p = buildFirstTurn([], "こんにちは", { now, memory: "（覚えていること）" });
    expect(p.startsWith("（覚えていること）\n\n")).toBe(true);
  });
});
