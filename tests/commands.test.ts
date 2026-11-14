import { describe, expect, it } from "vitest";
import { parseOpenSite, stripBrowser, extractAccount, matchSession, parseMoveCommand, parseSearchCommand, parseSessionCommand, searchUrl } from "../src/lib/commands";

describe("parseSearchCommand", () => {
  it("YouTube / Google で検索", () => {
    expect(parseSearchCommand("YouTubeで猫の動画と検索")).toEqual({ site: "youtube", query: "猫の動画", account: null });
    expect(parseSearchCommand("グーグルで明日の天気を検索して")).toEqual({ site: "google", query: "明日の天気", account: null });
    expect(parseSearchCommand("ユーチューブ で ドル円 って調べて")).toEqual({ site: "youtube", query: "ドル円", account: null });
  });
  it("アカウントの指定", () => {
    expect(parseSearchCommand("アカウント2でYouTubeで料理と検索")?.account).toBe(2);
    expect(parseSearchCommand("YouTubeで料理と検索 アカウント２で")?.account).toBe(2);
    expect(parseSearchCommand("仕事用のアカウントでグーグルで会議室と検索", { 2: "仕事用" })).toEqual({ site: "google", query: "会議室", account: 2 });
  });
  it("検索の命令でなければ null", () => {
    expect(parseSearchCommand("YouTubeで何が人気？")).toBeNull();
    expect(parseSearchCommand("今日の天気は")).toBeNull();
  });
  it("URL", () => {
    expect(searchUrl({ site: "youtube", query: "猫", account: 2 })).toBe("https://www.youtube.com/results?search_query=%E7%8C%AB&authuser=1");
    expect(searchUrl({ site: "google", query: "a b", account: null }, true)).toBe("https://www.google.com/search?q=a%20b&igu=1");
  });
});

describe("parseMoveCommand", () => {
  it("メイン画面からパレットへ", () => {
    expect(parseMoveCommand("モニター4のパレットに移して")).toEqual({ from: "hud", to: "palette-4" });
    expect(parseMoveCommand("ウィンドウを全部パレット四に移して")).toEqual({ from: "hud", to: "palette-4" });
  });
  it("パレットどうし・メインに戻す", () => {
    expect(parseMoveCommand("パレット1からパレット4に全部移して")).toEqual({ from: "palette-1", to: "palette-4" });
    expect(parseMoveCommand("パレット4をメインに戻して")).toEqual({ from: "palette-4", to: "hud" });
  });
  it("移す命令でなければ null", () => {
    expect(parseMoveCommand("FXを開いて")).toBeNull();
    expect(parseMoveCommand("メインに戻して")).toBeNull();
  });
});

describe("Claude のセッション", () => {
  it("命令を見分ける", () => {
    expect(parseSessionCommand("Claudeの株の集計というセッションを開いて")).toEqual({ kind: "any", query: "株の集計" });
    expect(parseSessionCommand("クロードのチャットを開いて")).toEqual({ kind: "chat", query: "" });
    expect(parseSessionCommand("クロードコードの注文画面のセッション開いて")).toEqual({ kind: "code", query: "注文画面" });
    expect(parseSessionCommand("今日の天気は")).toBeNull();
  });
  it("題名で探す", () => {
    const list = [{ title: "FX の注文画面を直して" }, { title: "株の集計を作る" }];
    expect(matchSession(list, "株の集計")).toBe(list[1]);
    expect(matchSession(list, "注文画面")).toBe(list[0]);
    expect(matchSession(list, "競馬")).toBeNull();
  });
  it("アカウントの指定", () => {
    expect(extractAccount("アカウント2で FX を開いて")).toEqual({ account: 2, rest: "FX を開いて" });
    expect(extractAccount("個人のアカウントでYouTubeを開いて", { 2: "個人" }).account).toBe(2);
    // 呼び名（同じプロフィールの名前が複数あっても、呼び名で区別できる）
    const names = { 6: ["サブ", "圭佑"], 8: ["病院", "圭佑"], 9: ["真知子"] };
    expect(extractAccount("病院のアカウントでGmailを開いて", names)).toEqual({ account: 8, rest: "Gmailを開いて" });
    expect(extractAccount("サブアカウントでYouTube開いて", names).account).toBe(6);
    expect(extractAccount("真知子のアカウントでカレンダー", names).account).toBe(9);
  });
});

describe("Chrome で開く・よく使うサイト", () => {
  it("「Chrome で」を取り出す", () => {
    expect(stripBrowser("YouTubeをChromeで開いて")).toEqual({ chrome: true, rest: "YouTubeを 開いて" });
    expect(stripBrowser("FXをブラウザで開いて").chrome).toBe(true);
    expect(stripBrowser("FXを開いて").chrome).toBe(false);
  });
  it("サイトを開く命令", () => {
    expect(parseOpenSite("YouTubeを開いて")?.name).toBe("YouTube");
    expect(parseOpenSite("ユーチューブ 開いて")?.name).toBe("YouTube");
    expect(parseOpenSite("YouTubeを 開いて")?.name).toBe("YouTube");
    expect(parseOpenSite("グーグルカレンダーを開いて")?.name).toBe("Google カレンダー");
    expect(parseOpenSite("カレンダーを見せて")?.name).toBe("Google カレンダー");
    expect(parseOpenSite("YouTubeで人気の動画は")).toBeNull();
  });
});
