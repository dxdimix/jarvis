import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listChromeProfiles, listClaudeSessions, readSessionHead, runCommand } from "../agent/lib/pc.mjs";

describe("listChromeProfiles", () => {
  it("Chrome の並び順でアカウント 1, 2… にする", () => {
    const ls = {
      profile: {
        profiles_order: ["Profile 2", "Default"],
        info_cache: { Default: { name: "仕事", user_name: "a@x.com" }, "Profile 2": { name: "個人", user_name: "b@y.com" } },
      },
    };
    expect(listChromeProfiles(ls)).toEqual([
      { dir: "Profile 2", name: "個人", email: "b@y.com" },
      { dir: "Default", name: "仕事", email: "a@x.com" },
    ]);
  });
  it("並び順がなければ Default が最初", () => {
    const ls = { profile: { info_cache: { "Profile 1": { name: "B" }, Default: { name: "A" } } } };
    expect(listChromeProfiles(ls).map((p) => p.dir)).toEqual(["Default", "Profile 1"]);
  });
});

describe("Claude Code のセッション", () => {
  it("題名と作業フォルダを取り出す", () => {
    const text = [
      JSON.stringify({ type: "user", cwd: "C:\\dev\\fx", message: { role: "user", content: "<command-name>/init</command-name>" } }),
      JSON.stringify({ type: "user", cwd: "C:\\dev\\fx", message: { role: "user", content: [{ type: "text", text: "注文の画面を直して" }] } }),
    ].join("\n");
    expect(readSessionHead(text)).toEqual({ title: "注文の画面を直して", cwd: "C:\\dev\\fx" });
  });
  it("フォルダから一覧を作る（新しい順）", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dimy-sessions-"));
    fs.mkdirSync(path.join(root, "proj"));
    const id = "0123abcd-0000-4000-8000-000000000000";
    fs.writeFileSync(path.join(root, "proj", `${id}.jsonl`), JSON.stringify({ type: "summary", summary: "株の集計", cwd: "/x/kabu" }) + "\n");
    expect(listClaudeSessions(root)).toMatchObject([{ id, title: "株の集計", project: "kabu" }]);
  });
});

describe("runCommand", () => {
  it("http / https 以外は開かない", async () => {
    await expect(runCommand({ kind: "open_url", payload: { url: "file:///C:/x" } }, { log: () => {} })).rejects.toThrow("http / https");
  });
  it("セッションの番号の形を確かめる", async () => {
    await expect(runCommand({ kind: "open_session", payload: { id: "x & del" } }, { log: () => {} })).rejects.toThrow("形");
  });
});

import { pickProfile } from "../agent/lib/pc.mjs";

describe("開く Chrome のプロフィール", () => {
  const profiles = [
    { dir: "Default", name: "ゲスト", email: "" },
    { dir: "Profile 1", name: "仕事", email: "boss@example.com" },
    { dir: "Profile 2", name: "個人", email: "me@gmail.com" },
  ];
  it("指定がなければマスターアカウント（利用者のメールアドレスのプロフィール）", () => {
    expect(pickProfile(profiles, {}, "Boss@example.com").dir).toBe("Profile 1");
  });
  it("番号・フォルダ名の指定が先", () => {
    expect(pickProfile(profiles, { account: 3 }, "boss@example.com").dir).toBe("Profile 2");
    expect(pickProfile(profiles, { profile: "Default" }, "boss@example.com").dir).toBe("Default");
  });
  it("ない番号はエラー、ないフォルダ名はマスターアカウント", () => {
    expect(() => pickProfile(profiles, { account: 9 }, "boss@example.com")).toThrow("アカウント 9");
    expect(pickProfile(profiles, { profile: "Profile 9" }, "boss@example.com").dir).toBe("Profile 1");
  });
});
