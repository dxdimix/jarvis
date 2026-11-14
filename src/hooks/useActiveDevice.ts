"use client";

// ディミの画面が複数開いているとき（Chrome と Edge、PC とノートなど）、声を出す・聞くのを 1 つの画面だけにする。
// 最後に操作した画面（クリック・キー・声）が「担当」になる。担当でない画面は、読み上げ・呼びかけ・右 Ctrl に反応しない。
// 画面どうしは Supabase の Presence（チャンネル dimy-voice）で、最後に操作した時刻を知らせ合う。
// つながっていないときは、自分を担当とみなす（声が出なくなるより、二重になる方がまし）。

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Entry = { id: string; at: number };

/** 担当を決める: 最後に操作した時刻がいちばん新しい画面（同じなら id の順） */
export function pickLeader(entries: Entry[]): string | null {
  let best: Entry | null = null;
  for (const e of entries) if (!best || e.at > best.at || (e.at === best.at && e.id > best.id)) best = e;
  return best?.id ?? null;
}

export function useActiveDevice(supabase: SupabaseClient) {
  const [id] = useState(() => Math.random().toString(36).slice(2, 10));
  const [leader, setLeader] = useState(true);
  const leaderRef = useRef(true);
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const atRef = useRef(0);
  const lastSent = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    lastSent.current = Date.now();
    ch.track({ id, at: atRef.current }).catch(() => {});
  }, [id]);

  /** この画面を操作した（担当になる） */
  const markActive = useCallback(() => {
    atRef.current = Date.now();
    leaderRef.current = true;
    setLeader(true);
    // 知らせすぎないよう、1 秒に 1 回まで（間に合わなかった分は、少しあとでまとめて知らせる）
    const wait = 1000 - (Date.now() - lastSent.current);
    if (wait <= 0) announce();
    else if (!pending.current) {
      pending.current = setTimeout(() => {
        pending.current = null;
        announce();
      }, wait);
    }
  }, [announce]);

  useEffect(() => {
    atRef.current = Date.now(); // 開いたばかりの画面を担当にする
    const ch = supabase.channel("dimy-voice", { config: { presence: { key: id } } });
    channelRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Entry>();
      const entries = Object.values(state).flat().map((e) => ({ id: e.id, at: e.at }));
      const l = pickLeader(entries);
      const me = l === null || l === id;
      leaderRef.current = me;
      setLeader(me);
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") announce();
    });
    const onAct = () => markActive();
    window.addEventListener("pointerdown", onAct);
    window.addEventListener("keydown", onAct);
    return () => {
      window.removeEventListener("pointerdown", onAct);
      window.removeEventListener("keydown", onAct);
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [supabase, id, announce, markActive]);

  return { leader, leaderRef, markActive };
}
