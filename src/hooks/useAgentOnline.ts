"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/** PC の常駐プログラムが動いているか（Realtime の Presence で知らせてくる）。確認中は null。 */
export function useAgentOnline(supabase: SupabaseClient) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const channel = supabase.channel("jarvis-presence");
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).length > 0);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setOnline(null);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return online;
}
