"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/LoginForm";
import { Hud } from "@/components/hud/Hud";

// ディミのメイン画面（声が中心）。文字入力と会話の履歴は、右上のアイコンで開く。
export default function Home() {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) return null;
  // ディミの画面の中（小窓・固定ウィンドウ）にディミ自身を開いたときは、何もしない（声が 2 回出るため）
  if (typeof window !== "undefined" && window.top !== window.self)
    return <p className="grid h-dvh place-items-center bg-slate-950 p-6 text-center text-sm text-slate-400">ディミの画面の中には、ディミを開けません。</p>;
  if (!session) return <LoginForm supabase={supabase} />;
  return <Hud supabase={supabase} session={session} />;
}
