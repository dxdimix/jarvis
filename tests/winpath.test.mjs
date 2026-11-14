import { describe, expect, it } from "vitest";
import { decodeOutput } from "../agent/lib/claude-session.mjs";
import { findClaudeBin } from "../agent/lib/winpath.mjs";

describe("Windows の文字と場所", () => {
  it("Shift_JIS のメッセージも文字化けせずに読む", () => {
    expect(decodeOutput(Buffer.from([0x27, 0x63, 0x6c, 0x61, 0x75, 0x64, 0x65, 0x27, 0x20, 0x82, 0xcd]))).toBe("'claude' は");
    expect(decodeOutput(Buffer.from("日本語"))).toBe("日本語");
  });
  it("CLAUDE_BIN の指定があればそれを使う", () => {
    expect(findClaudeBin({ CLAUDE_BIN: "C:\\x\\claude.exe" })).toBe("C:\\x\\claude.exe");
  });
});
