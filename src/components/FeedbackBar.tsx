"use client";

// 返事ごとの評価（よい / よくない）と、ひとことの感想。ディミは次の会話からこれを参考にする。

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Feedback = { rating: 1 | -1; comment: string | null };

export function FeedbackBar({
  supabase,
  messageId,
  value,
  onChange,
}: {
  supabase: SupabaseClient;
  messageId: string;
  value: Feedback | undefined;
  onChange: (f: Feedback | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(value?.comment ?? "");
  const [error, setError] = useState("");

  async function save(rating: 1 | -1, text: string | null) {
    setError("");
    const { error } = await supabase
      .from("feedback")
      .upsert({ message_id: messageId, rating, comment: text?.trim() || null }, { onConflict: "message_id" });
    if (error) return setError(`保存できませんでした: ${error.message}`);
    onChange({ rating, comment: text?.trim() || null });
  }

  async function clear() {
    const { error } = await supabase.from("feedback").delete().eq("message_id", messageId);
    if (error) return setError(`取り消せませんでした: ${error.message}`);
    onChange(undefined);
    setEditing(false);
  }

  // 文字だけのボタン（水色の英字。押したものだけ明るく光る）
  const btn =
    "rounded border px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] transition hover:border-cyan-300/70 hover:text-cyan-100";
  const on = " border-cyan-300/80 bg-cyan-400/10 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.45)]";
  const off = " border-cyan-400/25 text-cyan-400/70";
  return (
    <div className="mt-1 text-xs text-slate-400">
      <div className="flex items-center gap-1">
        <button
          aria-label="よい返事"
          aria-pressed={value?.rating === 1}
          onClick={() => (value?.rating === 1 ? clear() : save(1, value?.comment ?? null))}
          className={btn + (value?.rating === 1 ? on : off)}
        >
          GOOD
        </button>
        <button
          aria-label="よくない返事"
          aria-pressed={value?.rating === -1}
          onClick={() => {
            if (value?.rating === -1) return clear();
            save(-1, value?.comment ?? null);
            setEditing(true);
          }}
          className={btn + (value?.rating === -1 ? on : off)}
        >
          BAD
        </button>
        {value && !editing && (
          <button onClick={() => setEditing(true)} className="ml-1 text-cyan-400/70 underline hover:text-cyan-200">
            {value.comment ? `「${value.comment}」` : "ひとこと添える"}
          </button>
        )}
      </div>
      {editing && value && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(value.rating, comment);
            setEditing(false);
          }}
          className="mt-1 flex gap-1"
        >
          <input
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={value.rating === -1 ? "どこがよくなかった？（例: 長い、言い方が固い）" : "よかったところ（任意）"}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
          />
          <button className="rounded bg-cyan-700 px-2 text-white">保存</button>
        </form>
      )}
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
