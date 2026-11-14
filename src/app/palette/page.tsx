"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/LoginForm";
import { Palette } from "@/components/pins/Palette";

// パレット（2 枚目以降のモニター用。固定ウィンドウだけを並べる画面）。/palette?n=モニターの番号
export default function PalettePage() {
  const [supabase] = useState(createClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    const v = Number(new URLSearchParams(location.search).get("n"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setN(Number.isInteger(v) && v > 0 && v < 10 ? v : 1);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined || n === null) return null;
  if (!session) return <LoginForm supabase={supabase} />;
  return <Palette session={session} n={n} />;
}
