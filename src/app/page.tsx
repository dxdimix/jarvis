"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/LoginForm";
import { Hud } from "@/components/hud/Hud";

// キーミスのメイン画面（声が中心）。文字入力と会話の履歴は、右上のアイコンで開く。
export default function Home() {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) return null;
  if (!session) return <LoginForm supabase={supabase} />;
  return <Hud supabase={supabase} session={session} />;
}
