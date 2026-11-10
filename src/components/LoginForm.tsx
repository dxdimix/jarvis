"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// 利用者は本人のみ。アカウントは Supabase の管理画面で作る（画面からの新規登録はしない）。
export function LoginForm({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("ログインできませんでした。メールアドレスとパスワードを確認してください。");
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-3 px-4">
      <h1 className="text-center text-2xl font-semibold tracking-widest text-cyan-400">J.A.R.V.I.S.</h1>
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
      />
      <input
        type="password"
        required
        autoComplete="current-password"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
      />
      <button
        disabled={busy}
        className="rounded bg-cyan-600 py-2 font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
      >
        {busy ? "確認中…" : "ログイン"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
