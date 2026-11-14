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
