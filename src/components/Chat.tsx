"use client";

import { useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/types";

const HISTORY_LIMIT = 100;

export function Chat({ supabase, session }: { supabase: SupabaseClient; session: Session }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(`履歴を読み込めませんでした: ${error.message}`);
        else setMessages((data as Message[]).reverse());
      });

    // PC 常駐プログラムが返事を書き込んだり、状態を変えたりしたら、すぐ画面に反映する。
    const channel = supabase
      .channel("messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        setMessages((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((m) => m.id !== (payload.old as Message).id);
          }
          const row = payload.new as Message;
          const i = prev.findIndex((m) => m.id === row.id);
          if (i === -1) return [...prev, row];
          const next = prev.slice();
          next[i] = row;
          return next;
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    setInput("");
    setError("");
    const { error } = await supabase.from("messages").insert({ role: "user", content });
    if (error) {
      setError(`送信できませんでした: ${error.message}`);
      setInput(content);
    }
  }

  const waiting = messages.some((m) => m.role === "user" && (m.status === "pending" || m.status === "processing"));

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold tracking-widest text-cyan-400">J.A.R.V.I.S.</h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="underline hover:text-slate-200">
            ログアウト
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-slate-500">話しかけてください。PC の常駐プログラムが答えます。</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 " +
                (m.role === "user" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-100")
              }
            >
              {m.content}
              {m.role === "user" && m.status === "pending" && (
                <div className="mt-1 text-xs text-cyan-200">PC の応答待ち（常駐プログラムが動いているか確認）</div>
              )}
              {m.role === "user" && m.status === "processing" && (
                <div className="mt-1 text-xs text-cyan-200">考えています…</div>
              )}
              {m.status === "error" && <div className="mt-1 text-xs text-red-300">エラー: {m.error}</div>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      {error && <p className="pb-2 text-sm text-red-400">{error}</p>}
      <form onSubmit={send} className="flex gap-2 pb-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={waiting ? "返事を待っています…" : "ジャービスに話しかける"}
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
        <button className="rounded bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500">送信</button>
      </form>
    </div>
  );
}
