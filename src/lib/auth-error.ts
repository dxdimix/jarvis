// ログインに失敗した理由を、利用者が次に何をすればよいか分かる日本語にする。

export function describeLoginError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "メールアドレスかパスワードが違います。Supabase の「Authentication」→「Users」で作ったアカウントが、下に表示している接続先のプロジェクトにあるか確認してください。";
  }
  if (m.includes("email not confirmed")) {
    return "このアカウントは、メールアドレスの確認が済んでいません。Supabase でアカウントを作り直すときに「Auto Confirm User?」にチェックを入れてください。";
  }
  if (m.includes("email logins are disabled") || m.includes("email provider is disabled")) {
    return "Supabase でメールアドレスでのログインがオフになっています。「Authentication」→「Sign In / Providers」で「Email」をオンにしてください（「Allow new users to sign up」はオフのままで大丈夫です）。";
  }
  if (m.includes("invalid api key") || m.includes("no api key")) {
    return "Vercel に設定した Supabase のキーが正しくありません。Vercel の「Environment Variables」の NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を確認してください。";
  }
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
    return "Supabase につながりませんでした。Vercel に設定した NEXT_PUBLIC_SUPABASE_URL を確認してください。";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "ログインの試行が多すぎます。数分待ってから、もう一度試してください。";
  }
  return `ログインできませんでした（${message}）。`;
}

/** Supabase の URL からプロジェクトの番号を取り出す（例: https://abcd.supabase.co → abcd）。 */
export function projectRefFromUrl(url: string | undefined): string {
  if (!url) return "未設定";
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return "URL の形が正しくありません";
  }
}
