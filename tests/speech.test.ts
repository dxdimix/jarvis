import { describe, expect, it } from "vitest";
import { pickJapaneseVoice, takeSpeakable } from "../src/lib/speech";

describe("takeSpeakable", () => {
  it("返事の途中は、最後の文の区切りまでを返す", () => {
    expect(takeSpeakable("こんにちは。今日は晴れ", 0, false)).toEqual({ chunk: "こんにちは。", next: 6 });
  });

  it("区切りがまだなければ何も返さない", () => {
    expect(takeSpeakable("こんにちは", 0, false)).toEqual({ chunk: "", next: 0 });
  });

  it("続きは前回の位置から取り出す", () => {
    const first = takeSpeakable("こんにちは。今日は", 0, false);
    expect(first).toEqual({ chunk: "こんにちは。", next: 6 });
    // 返事が書き足された後
    expect(takeSpeakable("こんにちは。今日は晴れです！明日は", first.next, false)).toEqual({
      chunk: "今日は晴れです！",
      next: 14,
    });
  });

  it("返事の完了後は残りを全部返す", () => {
    expect(takeSpeakable("こんにちは。またね", 6, true)).toEqual({ chunk: "またね", next: 9 });
  });

  it("改行も区切りとして扱い、前後の空白は除く", () => {
    expect(takeSpeakable("1. 寿司\n2. 天ぷら", 0, false)).toEqual({ chunk: "1. 寿司", next: 6 });
  });
});

describe("pickJapaneseVoice", () => {
  const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
  const voices = [v("Google US English", "en-US"), v("Microsoft Nanami Online", "ja-JP"), v("Microsoft Keita Online", "ja-JP")];

  it("男性の日本語の声を優先する", () => {
    expect(pickJapaneseVoice(voices)?.name).toBe("Microsoft Keita Online");
  });

  it("指定された声があればそれを使う", () => {
    expect(pickJapaneseVoice(voices, "Microsoft Nanami Online")?.name).toBe("Microsoft Nanami Online");
  });

  it("日本語の声がなければ null", () => {
    expect(pickJapaneseVoice([v("Google US English", "en-US")])).toBeNull();
  });
});
