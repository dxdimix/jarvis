"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/LoginForm";
import { Hud } from "@/components/hud/Hud";

// キーミスの全画面（デスクトップ PC の画面に出しっぱなしにする用）
export default function HudPage() {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) return null;
  if (!session) return <LoginForm supabase={supabase} />;
  return <Hud supabase={supabase} />;
}
