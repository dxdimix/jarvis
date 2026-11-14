import { describe, expect, it } from "vitest";
import { findProfileDir, flattenBookmarks } from "../agent/lib/bookmarks.mjs";
import { matchBookmark } from "../src/lib/bookmarks";

describe("findProfileDir", () => {
  it("メールアドレスでログインしているプロフィールを探す", () => {
    const state = { profile: { info_cache: { Default: { user_name: "other@example.com" }, "Profile 2": { user_name: "Boss@Example.com" } } } };
    expect(findProfileDir(state, "boss@example.com")).toBe("Profile 2");
    expect(findProfileDir(state, "none@example.com")).toBeNull();
  });
});

describe("flattenBookmarks", () => {
  it("フォルダの中までたどり、開ける URL だけを並べる", () => {
    const json = {
      roots: {
        bookmark_bar: {
          children: [
            { type: "url", name: "経費精算", url: "https://keihi.example.com" },
            { type: "folder", name: "仕事", children: [{ type: "url", name: "勤怠", url: "https://kintai.example.com" }] },
            { type: "url", name: "設定", url: "chrome://settings" },
          ],
        },
        other: { children: [] },
      },
    };
    expect(flattenBookmarks(json)).toEqual([
      { title: "経費精算", url: "https://keihi.example.com", folder: "ブックマークバー", sort: 0 },
      { title: "勤怠", url: "https://kintai.example.com", folder: "ブックマークバー / 仕事", sort: 1 },
    ]);
  });
});

describe("matchBookmark", () => {
  const list = [
    { title: "経費精算システム", url: "https://a", folder: "" },
    { title: "Google カレンダー", url: "https://b", folder: "" },
  ];
  it("「〇〇を開いて」の〇〇を含むブックマークを探す", () => {
    expect(matchBookmark("経費精算を開いて", list)?.url).toBe("https://a");
    expect(matchBookmark("グーグルカレンダーを開いて", list)).toBeNull();
    expect(matchBookmark("Googleカレンダーを開いて", list)?.url).toBe("https://b");
  });
  it("開く言葉がなければ何もしない", () => {
    expect(matchBookmark("経費精算について教えて", list)).toBeNull();
  });
});
