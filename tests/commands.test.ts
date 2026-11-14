import { describe, expect, it } from "vitest";
import { parseMoveCommand, parseSearchCommand, searchUrl } from "../src/lib/commands";

describe("parseSearchCommand", () => {
  it("YouTube / Google で検索", () => {
    expect(parseSearchCommand("YouTubeで猫の動画と検索")).toEqual({ site: "youtube", query: "猫の動画", account: null });
    expect(parseSearchCommand("グーグルで明日の天気を検索して")).toEqual({ site: "google", query: "明日の天気", account: null });
    expect(parseSearchCommand("ユーチューブ で ドル円 って調べて")).toEqual({ site: "youtube", query: "ドル円", account: null });
  });
  it("アカウントの指定", () => {
    expect(parseSearchCommand("アカウント2でYouTubeで料理と検索")?.account).toBe(2);
    expect(parseSearchCommand("YouTubeで料理と検索 アカウント２で")?.account).toBe(2);
    expect(parseSearchCommand("仕事用でグーグルで会議室と検索", { 2: "仕事用" })).toEqual({ site: "google", query: "会議室", account: 2 });
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
