"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// 名前を変えたので、新しい名前のチャンネルと、更新前の PC が使う古い名前のチャンネルの両方を見る。
// （PC の常駐プログラムが自動更新で新しい版になるまでの間も、オンラインと表示するため）
const CHANNELS = ["kymis-presence", "jarvis-presence"];

/** PC の常駐プログラムが動いているか（Realtime の Presence で知らせてくる）。確認中は null。 */
export function useAgentOnline(supabase: SupabaseClient) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const present: Record<string, boolean> = {};
    const channels = CHANNELS.map((name) => {
      const channel = supabase.channel(name);
      channel
        .on("presence", { event: "sync" }, () => {
          present[name] = Object.keys(channel.presenceState()).length > 0;
          setOnline(Object.values(present).some(Boolean));
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setOnline(null);
        });
      return channel;
    });
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [supabase]);

  return online;
}
