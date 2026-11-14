"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/LoginForm";
import { Chat } from "@/components/Chat";

// 文字で会話する画面（以前のメイン画面）
export default function ChatPage() {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) return null;
  if (!session) return <LoginForm supabase={supabase} />;
  return <Chat supabase={supabase} session={session} />;
}
