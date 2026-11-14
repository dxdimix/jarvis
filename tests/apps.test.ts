import { describe, expect, it } from "vitest";
import { APPS, canEmbed, detectOpenCommand } from "../src/lib/apps";

const app = (id: string) => APPS.find((a) => a.id === id)!;

describe("detectOpenCommand", () => {
  it("「〇〇を開いて」でアプリを見つける", () => {
    expect(detectOpenCommand("FX を開いて")?.id).toBe("fx");
    expect(detectOpenCommand("株の画面を見せて")?.id).toBe("kabu");
    expect(detectOpenCommand("競馬を表示して")?.id).toBe("keiba");
    expect(detectOpenCommand("UMSheetを起動して")?.id).toBe("umsheet");
  });

  it("開く言葉がなければ何もしない（ふつうの質問はディミに渡す）", () => {
    expect(detectOpenCommand("FX の今日の状況を教えて")).toBeNull();
    expect(detectOpenCommand("ドアを開いて")).toBeNull();
  });
});

describe("canEmbed", () => {
  it("dxdimix.com のアプリと、ログインのないアプリは中で開ける", () => {
    for (const id of ["fx", "kabu", "keiba", "umsheet", "nencho"]) expect(canEmbed(app(id))).toBe(true);
  });

  it("ドメインが違うログインのあるアプリと、表示を禁止しているアプリは別ウィンドウ", () => {
    expect(canEmbed({ ...app("fx"), url: "https://example.vercel.app" })).toBe(false);
    expect(canEmbed(app("medical"))).toBe(false);
  });
});
