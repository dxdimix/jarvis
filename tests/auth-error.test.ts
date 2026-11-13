import { describe, expect, it } from "vitest";
import { describeLoginError, normalizeSupabaseUrl, projectRefFromUrl } from "../src/lib/auth-error";

describe("describeLoginError", () => {
  it("よくある失敗の理由を日本語にする", () => {
    expect(describeLoginError("Invalid login credentials")).toContain("メールアドレスかパスワードが違います");
    expect(describeLoginError("Email not confirmed")).toContain("Auto Confirm User");
    expect(describeLoginError("Email logins are disabled")).toContain("Sign In / Providers");
    expect(describeLoginError("Invalid API key")).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(describeLoginError("Failed to fetch")).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("知らない理由はそのまま添える", () => {
    expect(describeLoginError("something odd")).toBe("ログインできませんでした（something odd）。");
  });
});

describe("projectRefFromUrl", () => {
  it("プロジェクトの番号を取り出す", () => {
    expect(projectRefFromUrl("https://abcdefgh.supabase.co")).toBe("abcdefgh");
    expect(projectRefFromUrl(undefined)).toBe("未設定");
    expect(projectRefFromUrl("abc")).toBe("URL の形が正しくありません");
  });
});

describe("normalizeSupabaseUrl", () => {
  it("後ろの /rest/v1/ などを取り除く", () => {
    expect(normalizeSupabaseUrl("https://abcd.supabase.co/rest/v1/")).toBe("https://abcd.supabase.co");
    expect(normalizeSupabaseUrl(" https://abcd.supabase.co/ ")).toBe("https://abcd.supabase.co");
    expect(normalizeSupabaseUrl("https://abcd.supabase.co")).toBe("https://abcd.supabase.co");
  });
});
