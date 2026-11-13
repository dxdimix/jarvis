import { describe, expect, it } from "vitest";
import { buildQuery, listApps } from "../agent/tools/appdata.mjs";
import { safeEnv } from "../agent/lib/claude-session.mjs";

describe("listApps", () => {
  it(".env.local の JARVIS_APP_<名前>_URL / _KEY からアプリの一覧を作る", () => {
    const apps = listApps({
      JARVIS_APP_FX_URL: "https://a.supabase.co",
      JARVIS_APP_FX_KEY: "sb_secret_x",
      JARVIS_APP_FX_LABEL: "FX",
      JARVIS_APP_KABU_URL: "https://b.supabase.co", // キーがないものは使えない
      OTHER: "1",
    });
    expect(Object.keys(apps)).toEqual(["fx"]);
    expect(apps.fx.label).toBe("FX");
  });
});

describe("buildQuery", () => {
  it("読み取りの問い合わせに直す", () => {
    const q = buildQuery(["--select", "id,status", "--order", "created_at.desc", "--limit", "5", "--where", "status=eq.error"]);
    expect(q.toString()).toBe("select=id%2Cstatus&order=created_at.desc&status=eq.error&limit=5");
  });

  it("行の数の上限を守る", () => {
    expect(buildQuery(["--limit", "99999"]).get("limit")).toBe("200");
    expect(buildQuery([]).get("limit")).toBe("20");
  });

  it("おかしな値は止める", () => {
    expect(() => buildQuery(["--select", "id;drop"])).toThrow();
    expect(() => buildQuery(["--order", "id desc"])).toThrow();
    expect(() => buildQuery(["--where", "status=delete.x"])).toThrow();
    expect(() => buildQuery(["--method", "DELETE"])).toThrow();
    expect(() => buildQuery(["--limit"])).toThrow();
  });
});

describe("safeEnv", () => {
  it("Claude Code にはキーや秘密の値を渡さない", () => {
    const env = safeEnv({
      PATH: "/bin",
      SUPABASE_SECRET_KEY: "s",
      SUPABASE_URL: "u",
      JARVIS_APP_FX_KEY: "k",
      GH_TOKEN: "t",
      CLAUDE_MODEL: "sonnet",
      CLAUDE_CODE_OAUTH_TOKEN: "login",
    });
    expect(env).toEqual({ PATH: "/bin", CLAUDE_MODEL: "sonnet", CLAUDE_CODE_OAUTH_TOKEN: "login" });
  });
});
