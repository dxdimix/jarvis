"use client";

// キーミスが覚えていること。利用者が書いたものと、キーミスが会話から書き留めたものが並ぶ。
// 「使う」を外すと、消さずに一時的に使わないようにできる。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Note = {
  id: string;
  kind: "style" | "fact" | "rule";
  content: string;
  source: "user" | "kymis";
  active: boolean;
  created_at: string;
};
type FeedbackRow = { id: string; rating: number; comment: string | null; created_at: string; messages: { content: string } | null };

const KIND_LABEL: Record<Note["kind"], string> = { style: "話し方の好み", fact: "わたしについて", rule: "決まり" };

export function Memory({ supabase }: { supabase: SupabaseClient }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [kind, setKind] = useState<Note["kind"]>("style");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [n, f] = await Promise.all([
      supabase.from("kymis_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("feedback").select("id, rating, comment, created_at, messages(content)").order("created_at", { ascending: false }).limit(30),
    ]);
    if (n.error) return setError(`読み込めませんでした: ${n.error.message}（データベースの更新が必要かもしれません）`);
    setNotes(n.data as Note[]);
    if (!f.error) setFeedback(f.data as unknown as FeedbackRow[]);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 最初の読み込み
    load();
    const ch = supabase
      .channel("memory-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "kymis_notes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setError("");
    const { error } = await supabase.from("kymis_notes").insert({ kind, content: content.trim(), source: "user" });
    if (error) return setError(`保存できませんでした: ${error.message}`);
    setContent("");
    load();
  }

  async function toggle(n: Note) {
    const { error } = await supabase.from("kymis_notes").update({ active: !n.active, updated_at: new Date().toISOString() }).eq("id", n.id);
    if (error) setError(`変更できませんでした: ${error.message}`);
    load();
  }

  async function remove(n: Note) {
    if (!confirm(`「${n.content}」を消しますか？`)) return;
    const { error } = await supabase.from("kymis_notes").delete().eq("id", n.id);
    if (error) setError(`消せませんでした: ${error.message}`);
    load();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-widest text-cyan-400">覚えていること</h1>
        <Link href="/" className="text-sm text-slate-400 underline hover:text-slate-200">
          戻る
        </Link>
      </header>
      <p className="mb-4 text-sm text-slate-400">
        キーミスは、会話のたびにここに書かれたことを守ります。話し方の好みなどを書いてください。会話の中でキーミスが気づいたことも、ここに追加されます。
      </p>

      <form onSubmit={add} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Note["kind"])}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
          aria-label="種類"
        >
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例: 結論を先に、2 文以内で答えてほしい"
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
        <button className="rounded bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500">追加</button>
      </form>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-slate-500">まだありません。</li>}
        {notes.map((n) => (
          <li key={n.id} className={"rounded border border-slate-800 bg-slate-900/60 px-3 py-2 " + (n.active ? "" : "opacity-50")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-cyan-300">{KIND_LABEL[n.kind]}</span>
                <span>{n.content}</span>
                <div className="mt-1 text-xs text-slate-500">
                  {n.source === "user" ? "あなたが追加" : "キーミスが会話から追加"}・
                  {new Date(n.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </div>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button onClick={() => toggle(n)} className="underline text-slate-300">
                  {n.active ? "使わない" : "使う"}
                </button>
                <button onClick={() => remove(n)} className="underline text-red-300">
                  消す
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-10 text-sm font-semibold tracking-widest text-cyan-400">最近の評価</h2>
      <p className="mb-3 text-xs text-slate-500">会話の返事の下の GOOD / BAD で付けたもの。最新の 10 件を、キーミスが次の会話で参考にします。</p>
      <ul className="space-y-2 text-sm">
        {feedback.length === 0 && <li className="text-slate-500">まだありません。</li>}
        {feedback.map((f) => (
          <li key={f.id} className="rounded border border-slate-800 px-3 py-2">
            <span className="font-mono text-xs tracking-[0.2em] text-cyan-300">{f.rating > 0 ? "GOOD" : "BAD"}</span>
            {f.comment && <span className="ml-2">「{f.comment}」</span>}
            <div className="mt-1 line-clamp-2 text-xs text-slate-500">{f.messages?.content}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
