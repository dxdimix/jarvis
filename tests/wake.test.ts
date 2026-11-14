import { describe, expect, it } from "vitest";
import { parseControl, parseWake, toSpeech } from "../src/lib/wake";
import { takeSpeakable } from "../src/lib/speech";

describe("parseWake", () => {
  it("呼びかけだけなら空文字、続きがあればその言葉", () => {
    expect(parseWake("ディミ")).toBe("");
    expect(parseWake("ねえディミ、FX を開いて")).toBe("FX を開いて");
    expect(parseWake("リミ 今日の天気は")).toBe("今日の天気は");
  });
  it("呼びかけで始まらなければ null（周りの会話には反応しない）", () => {
    expect(parseWake("今日の夕飯どうする")).toBeNull();
    expect(parseWake("ディミってすごいね")).not.toBeNull(); // 始まりが名前なら呼びかけとみなす
  });
});

describe("parseControl", () => {
  it("終わり・聞かないで・取り消しを見分ける", () => {
    expect(parseControl("終わり")).toBe("end");
    expect(parseControl("ありがとう。")).toBe("end");
    expect(parseControl("聞かないで")).toBe("mute");
    expect(parseControl("違う")).toBe("cancel");
    expect(parseControl("終わりの時間を教えて")).toBeNull();
  });
});

describe("toSpeech", () => {
  it("英字の名前を読みやすくし、URL と記号を読まない", () => {
    expect(toSpeech("DIMY です。詳しくは https://example.com を見て")).toBe("ディミ です。詳しくは  を見て");
    expect(toSpeech("・FX は好調\n・株は休み")).toBe("エフエックス は好調。株は休み");
  });
});

describe("takeSpeakable（まとめて読む）", () => {
  it("minChars に満たないうちは、返事の途中では読まない", () => {
    expect(takeSpeakable("はい。今日は晴れ", 0, false, 20)).toEqual({ chunk: "", next: 0 });
    expect(takeSpeakable("はい。今日は晴れです。明日は雨の予報です。", 0, false, 10).chunk).toBe("はい。今日は晴れです。明日は雨の予報です。");
  });
  it("返事が終わったら、短くても読む", () => {
    expect(takeSpeakable("はい。", 0, true, 50)).toEqual({ chunk: "はい。", next: 3 });
  });
});
