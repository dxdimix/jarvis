"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/LoginForm";
import { Memory } from "@/components/Memory";

// キーミスが覚えていること（話し方の好み・事実・決まり）を見て、足して、消す画面
export default function MemoryPage() {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) return null;
  if (!session) return <LoginForm supabase={supabase} />;
  return <Memory supabase={supabase} />;
}
